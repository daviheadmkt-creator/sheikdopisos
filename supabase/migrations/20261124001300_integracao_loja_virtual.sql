-- =====================================================================
-- Integração com a LOJA VIRTUAL (WooCommerce — plugin "Sheik ERP Conector")
--
-- Fluxo:
--  * O plugin da loja envia clientes e pedidos para a função de servidor
--    /api/loja-webhook (assinatura HMAC), que chama as funções abaixo com a
--    service_role. Nenhuma delas pode ser executada pelo navegador.
--  * Cliente: localizado pelo ID da loja, depois CPF/CNPJ, depois e-mail
--    (só se houver exatamente um). O ERP é o cadastro mestre: a loja só
--    completa dados em branco (exceto clientes criados pela própria loja).
--  * Pedido pago/em espera → venda em RASCUNHO no ERP (origem "loja"), com os
--    preços cobrados na loja. O vendedor escolhe lote/depósito e confirma —
--    as regras de estoque, financeiro e entrega continuam as mesmas.
--  * SKU da loja = SKU do produto no ERP. Sem correspondência, o pedido fica
--    "pendente" na tela Pedidos da Loja até ser reprocessado.
--  * Pedido cancelado/estornado na loja cancela a venda em rascunho; se já
--    estiver confirmada, fica "atenção" para tratamento manual.
-- =====================================================================

-- ---------------------------------------------------------------- Colunas de origem
alter table public.clientes
  add column origem text not null default 'erp' check (origem in ('erp', 'loja')),
  add column loja_cliente_id bigint unique check (loja_cliente_id is null or loja_cliente_id > 0);

alter table public.vendas
  add column origem text not null default 'erp' check (origem in ('erp', 'loja')),
  add column loja_pedido_id bigint unique check (loja_pedido_id is null or loja_pedido_id > 0);

-- Pelo navegador ninguém marca/desmarca a origem nem o vínculo com a loja
create or replace function public.fn_protege_origem_loja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.origem := 'erp';
      if tg_table_name = 'clientes' then new.loja_cliente_id := null; else new.loja_pedido_id := null; end if;
    else
      new.origem := old.origem;
      if tg_table_name = 'clientes' then new.loja_cliente_id := old.loja_cliente_id; else new.loja_pedido_id := old.loja_pedido_id; end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protege_origem_loja before insert or update on public.clientes
  for each row execute function public.fn_protege_origem_loja();
create trigger trg_protege_origem_loja before insert or update on public.vendas
  for each row execute function public.fn_protege_origem_loja();

-- ---------------------------------------------------------------- Pedidos recebidos da loja
create table public.loja_pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido_loja_id bigint not null unique check (pedido_loja_id > 0),
  numero_loja text not null,
  status_loja text not null,
  situacao text not null default 'aguardando_pagamento'
    check (situacao in ('aguardando_pagamento', 'integrado', 'pendente', 'cancelado', 'atencao')),
  mensagem text,
  cliente_id uuid references public.clientes(id) on delete restrict,
  venda_id uuid unique references public.vendas(id) on delete restrict,
  cliente_nome text,
  total_loja numeric(14,2) not null default 0,
  forma_pagamento text,
  pago_em timestamptz,
  modificado_loja timestamptz,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index loja_pedidos_situacao_idx on public.loja_pedidos(situacao, recebido_em desc);
create index loja_pedidos_recebido_idx on public.loja_pedidos(recebido_em desc);

alter table public.loja_pedidos enable row level security;
create policy loja_pedidos_select on public.loja_pedidos for select to authenticated
  using ((select public.tem_permissao('vendas', 'ler')));
-- escrita somente pelas funções abaixo
revoke insert, update, delete, truncate on public.loja_pedidos from authenticated;
revoke all on public.loja_pedidos from anon;

-- ---------------------------------------------------------------- Auxiliares (uso interno)
create or replace function public._loja_texto(p text, p_max int default 150)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), p_max), '');
$$;

create or replace function public._loja_telefone(p text, p_max int default 11)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) in (12, 13) and left(d, 2) = '55' then d := substr(d, 3); end if;
  d := ltrim(d, '0');
  return case when length(d) between 10 and p_max then d end;
end;
$$;

create or replace function public._loja_data(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v date;
  t text := trim(coalesce(p, ''));
begin
  begin
    if t ~ '^\d{4}-\d{2}-\d{2}' then
      v := to_date(left(t, 10), 'YYYY-MM-DD');
    elsif t ~ '^\d{2}/\d{2}/\d{4}$' then
      v := to_date(t, 'DD/MM/YYYY');
    end if;
  exception when others then
    v := null;
  end;
  if v < date '1900-01-01' or v > current_date then v := null; end if;
  return v;
end;
$$;

-- Cliente: localiza ou cria; o ERP é o cadastro mestre (a loja só completa o que falta)
create or replace function public._loja_salvar_cliente(c jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loja bigint := nullif(nullif(c ->> 'loja_id', ''), '0')::bigint;
  v_tipo public.tipo_pessoa := case when upper(c ->> 'tipo') = 'PJ' then 'PJ' else 'PF' end;
  v_cpf text := regexp_replace(coalesce(c ->> 'cpf', ''), '\D', '', 'g');
  v_cnpj text := upper(regexp_replace(coalesce(c ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g'));
  v_email text := lower(trim(coalesce(c ->> 'email', '')));
  v_nome text := public._loja_texto(c ->> 'nome');
  v_razao text := public._loja_texto(c ->> 'razao_social');
  v_ie text := public._loja_texto(c ->> 'ie', 30);
  v_tel text := public._loja_telefone(c ->> 'telefone');
  v_cel text := public._loja_telefone(c ->> 'celular', 13);
  v_nasc date := public._loja_data(c ->> 'nascimento');
  v_doc text;
  v_obs text;
  v_id uuid;
  v_origem text;
  v_qtd int;
begin
  if c is null or jsonb_typeof(c) <> 'object' then
    raise exception 'Dados do cliente ausentes' using errcode = '22023';
  end if;

  if not public.valida_cpf(v_cpf) then v_cpf := null; end if;
  if not public.valida_cnpj(v_cnpj) then v_cnpj := null; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then v_email := null; end if;
  if v_tel is null then v_tel := public._loja_telefone(c ->> 'celular'); end if;
  if v_cel is null then v_cel := public._loja_telefone(c ->> 'telefone', 13); end if;

  if v_tipo = 'PJ' and v_cnpj is null then
    v_tipo := 'PF'; -- sem CNPJ válido não há como cadastrar PJ
    v_obs := 'Informado como pessoa jurídica na loja, sem CNPJ válido' || coalesce(' (' || v_razao || ')', '') || '.';
  end if;
  v_doc := case when v_tipo = 'PJ' then v_cnpj else v_cpf end;

  if v_tipo = 'PJ' then
    v_razao := coalesce(v_razao, v_nome);
  end if;
  v_nome := coalesce(case when v_tipo = 'PJ' then v_razao end, v_nome, v_email, 'Cliente da loja virtual');
  if length(v_nome) < 2 then v_nome := 'Cliente da loja virtual'; end if;

  -- 1) ID da loja · 2) CPF/CNPJ · 3) e-mail (somente se houver um único cliente com ele)
  if v_loja is not null then
    select id into v_id from public.clientes where loja_cliente_id = v_loja;
  end if;
  if v_id is null and v_doc is not null then
    select id into v_id from public.clientes where documento = v_doc;
  end if;
  if v_id is null and v_email is not null then
    select count(*), min(id::text)::uuid into v_qtd, v_id from public.clientes where lower(email) = v_email;
    if v_qtd <> 1 then v_id := null; end if;
  end if;

  if v_id is null then
    insert into public.clientes (
      tipo_pessoa, nome, razao_social, documento, inscricao_estadual, telefone, whatsapp, email,
      data_nascimento, contato_nome, observacoes, origem, loja_cliente_id
    ) values (
      v_tipo, v_nome, case when v_tipo = 'PJ' then v_razao end, v_doc, case when v_tipo = 'PJ' then v_ie end,
      v_tel, v_cel, v_email,
      case when v_tipo = 'PF' then v_nasc end,
      case when v_tipo = 'PJ' then public._loja_texto(c ->> 'nome') end,
      concat_ws(' ', 'Cadastro criado pela loja virtual.', v_obs), 'loja', v_loja
    ) returning id into v_id;
    return v_id;
  end if;

  select origem into v_origem from public.clientes where id = v_id;
  update public.clientes cl set
    loja_cliente_id = coalesce(cl.loja_cliente_id,
      case when v_loja is not null and not exists (select 1 from public.clientes o where o.loja_cliente_id = v_loja) then v_loja end),
    email = case when v_origem = 'loja' then coalesce(v_email, cl.email) else coalesce(cl.email, v_email) end,
    telefone = case when v_origem = 'loja' then coalesce(v_tel, cl.telefone) else coalesce(cl.telefone, v_tel) end,
    whatsapp = case when v_origem = 'loja' then coalesce(v_cel, cl.whatsapp) else coalesce(cl.whatsapp, v_cel) end,
    documento = coalesce(cl.documento,
      case when v_doc is not null and cl.tipo_pessoa = v_tipo
                and not exists (select 1 from public.clientes o where o.documento = v_doc) then v_doc end),
    data_nascimento = case when cl.tipo_pessoa = 'PF' then coalesce(cl.data_nascimento, v_nasc) else cl.data_nascimento end,
    nome = case when v_origem = 'loja' and cl.tipo_pessoa = v_tipo then v_nome else cl.nome end,
    razao_social = case when v_origem = 'loja' and cl.tipo_pessoa = 'PJ' and v_tipo = 'PJ' then v_razao else cl.razao_social end
  where cl.id = v_id;
  return v_id;
end;
$$;

-- Endereço: reaproveita se já existir (mesmo CEP + número + complemento); retorna null se incompleto
create or replace function public._loja_salvar_endereco(p_cliente uuid, e jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cep text := regexp_replace(coalesce(e ->> 'cep', ''), '\D', '', 'g');
  v_log text := public._loja_texto(e ->> 'logradouro', 200);
  v_num text := coalesce(public._loja_texto(e ->> 'numero', 20), 'S/N');
  v_comp text := public._loja_texto(e ->> 'complemento', 100);
  v_bairro text := coalesce(public._loja_texto(e ->> 'bairro', 100), 'Não informado');
  v_cidade text := public._loja_texto(e ->> 'cidade', 100);
  v_uf text := upper(trim(coalesce(e ->> 'uf', '')));
  v_id uuid;
begin
  if e is null or jsonb_typeof(e) <> 'object' or v_cep !~ '^\d{8}$' or v_log is null or v_cidade is null
     or not public.uf_valida(v_uf) then
    return null;
  end if;

  select id into v_id from public.cliente_enderecos
  where cliente_id = p_cliente and cep = v_cep and lower(numero) = lower(v_num)
    and coalesce(lower(complemento), '') = coalesce(lower(v_comp), '')
  limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.cliente_enderecos (cliente_id, descricao, cep, logradouro, numero, complemento, bairro, cidade, uf, principal)
  values (p_cliente, 'Loja virtual', v_cep, v_log, v_num, v_comp, v_bairro, v_cidade, v_uf,
          not exists (select 1 from public.cliente_enderecos where cliente_id = p_cliente and principal))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public._loja_forma_pagamento(p jsonb)
returns public.forma_pagamento
language sql
immutable
set search_path = ''
as $$
  with m as (select lower(coalesce(p ->> 'metodo', '') || ' ' || coalesce(p ->> 'titulo', '')) as t)
  select (case
    when t ~ 'pix' then 'pix'
    when t ~ 'boleto|bolbradesco|ticket' then 'boleto'
    when t ~ 'debit|d[eé]bito' then 'cartao_debito'
    when t ~ 'credit|cr[eé]dito|cart[aã]o|card|stripe|cielo|rede|getnet|pagseguro|pagbank|mercado|pagarme|pagar\.me|paypal|asaas' then 'cartao_credito'
    when t ~ 'bacs|transfer|dep[oó]sito' then 'transferencia'
    when t ~ '(^|\s)cod(\s|$)|dinheiro|cash|entrega' then 'dinheiro'
    else 'transferencia'
  end)::public.forma_pagamento
  from m;
$$;

create or replace function public._loja_observacoes(p jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select left(concat_ws(E'\n',
    'Pedido #' || (p ->> 'numero') || ' da loja virtual.',
    'Pagamento: ' || coalesce(nullif(p -> 'pagamento' ->> 'titulo', ''), p -> 'pagamento' ->> 'metodo', 'não informado')
      || case when nullif(p ->> 'pago_em', '') is not null
              then ' — pago em ' || to_char(public.data_local((p ->> 'pago_em')::timestamptz), 'DD/MM/YYYY')
              else ' — aguardando confirmação do pagamento' end,
    'Entrega: ' || coalesce(nullif(p -> 'entrega' ->> 'metodo_titulo', ''), 'não informada'),
    case when jsonb_array_length(coalesce(p -> 'cupons', '[]'::jsonb)) > 0
         then 'Cupons: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(p -> 'cupons') x) end,
    case when nullif(trim(p ->> 'observacao_cliente'), '') is not null
         then 'Observação do cliente: ' || trim(p ->> 'observacao_cliente') end
  ), 2000);
$$;

-- ---------------------------------------------------------------- Núcleo do pedido (uso interno)
create or replace function public._loja_processar_pedido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lp public.loja_pedidos%rowtype;
  p jsonb;
  v_status text;
  v_cli uuid;
  v_end uuid;
  v_retirada boolean;
  v_venda public.vendas%rowtype;
  v_item jsonb;
  v_prod record;
  v_itens jsonb := '[]'::jsonb;
  v_faltando text[] := '{}';
  v_avisos text[] := '{}';
  v_qtd numeric;
  v_m2_loja numeric;
  v_total_item numeric;
  v_venda_id uuid;
  v_total numeric;
  v_parcelas int;
begin
  select * into v_lp from public.loja_pedidos where id = p_id for update;
  if not found then raise exception 'Pedido da loja não encontrado' using errcode = 'P0002'; end if;
  p := v_lp.payload;
  v_status := lower(v_lp.status_loja);

  begin
    -- Cliente e endereço de entrega
    v_cli := public._loja_salvar_cliente(p -> 'cliente');
    if jsonb_typeof(p -> 'cliente' -> 'endereco') = 'object' then
      perform public._loja_salvar_endereco(v_cli, p -> 'cliente' -> 'endereco');
    end if;
    update public.loja_pedidos set cliente_id = v_cli where id = p_id;

    if v_lp.venda_id is not null then
      select * into v_venda from public.vendas where id = v_lp.venda_id for update;
    end if;

    -- Cancelado / estornado / falhou na loja
    if v_status in ('cancelled', 'refunded', 'failed') then
      if v_venda.id is null or v_venda.status = 'cancelada' then
        update public.loja_pedidos set situacao = 'cancelado', mensagem = 'Pedido ' ||
          case v_status when 'refunded' then 'reembolsado' when 'failed' then 'com pagamento recusado' else 'cancelado' end || ' na loja.'
        where id = p_id;
      elsif v_venda.status = 'rascunho' then
        update public.vendas set status = 'cancelada', cancelada_em = now(),
          motivo_cancelamento = 'Pedido #' || v_lp.numero_loja || ' cancelado/estornado na loja virtual (' || v_status || ')'
        where id = v_venda.id;
        update public.loja_pedidos set situacao = 'cancelado', mensagem = 'Venda #' || v_venda.numero || ' cancelada automaticamente.'
        where id = p_id;
      else
        update public.loja_pedidos set situacao = 'atencao', mensagem = 'O pedido foi cancelado/estornado na loja, mas a venda #'
          || v_venda.numero || ' já está ' || v_venda.status || ' no ERP. Cancele a venda ou registre a devolução manualmente.'
        where id = p_id;
      end if;
      return;
    end if;

    -- Ainda sem pagamento (pendente, rascunho do checkout etc.)
    if v_status not in ('processing', 'on-hold', 'completed') then
      if v_venda.id is null then
        update public.loja_pedidos set situacao = 'aguardando_pagamento', mensagem = null where id = p_id;
      end if;
      return;
    end if;

    -- Venda já criada: só atualiza as observações enquanto estiver em rascunho
    if v_venda.id is not null then
      if v_venda.status = 'rascunho' then
        update public.vendas set observacoes = public._loja_observacoes(p) where id = v_venda.id;
      end if;
      if (select situacao from public.loja_pedidos where id = p_id) <> 'atencao' then
        update public.loja_pedidos set situacao = 'integrado' where id = p_id;
      end if;
      return;
    end if;

    -- Monta os itens com o SKU do ERP e o preço cobrado na loja
    for v_item in select * from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) loop
      select pr.id, pr.sku, pr.descricao, pr.unidade, pr.eh_revestimento, pr.m2_por_caixa, pr.status into v_prod
      from public.produtos pr
      where upper(pr.sku) = upper(trim(coalesce(v_item ->> 'sku', '')))
      order by (pr.sku = trim(v_item ->> 'sku')) desc
      limit 1;

      if v_prod.id is null then
        v_faltando := v_faltando || (coalesce(nullif(trim(v_item ->> 'sku'), ''), 'sem SKU') || ' (' || coalesce(v_item ->> 'nome', '?') || ')');
        continue;
      end if;
      if v_prod.status <> 'ativo' then
        v_faltando := v_faltando || (v_prod.sku || ' (produto inativo no ERP)');
        continue;
      end if;

      v_qtd := (v_item ->> 'quantidade')::numeric;
      v_total_item := round((v_item ->> 'valor_total')::numeric, 2);
      v_m2_loja := coalesce(nullif(v_item ->> 'm2_caixa', '')::numeric, 0);
      if v_qtd is null or v_qtd <= 0 or v_total_item is null or v_total_item < 0 then
        raise exception 'Item % com quantidade ou valor inválido', v_prod.sku using errcode = '22023';
      end if;

      -- Revestimento vendido por caixa na loja → m² no ERP (ou caixas, se a unidade do ERP for CX)
      if v_m2_loja > 0 and v_prod.eh_revestimento and v_prod.m2_por_caixa > 0 then
        if v_m2_loja <> v_prod.m2_por_caixa then
          v_avisos := v_avisos || (v_prod.sku || ': m² por caixa diferente na loja (' || v_m2_loja || ') e no ERP (' || v_prod.m2_por_caixa || ')');
        end if;
        if v_prod.unidade <> 'CX' then v_qtd := v_qtd * v_prod.m2_por_caixa; end if;
      end if;

      v_itens := v_itens || jsonb_build_object(
        'produto_id', v_prod.id,
        'quantidade', v_qtd,
        'preco_unitario', round(v_total_item / v_qtd, 2),
        'desconto_perc', 0,
        'observacao', 'Loja: ' || left(coalesce(v_item ->> 'nome', ''), 150)
      );
    end loop;

    if array_length(v_faltando, 1) > 0 or jsonb_array_length(v_itens) = 0 then
      update public.loja_pedidos set situacao = 'pendente', mensagem =
        case when array_length(v_faltando, 1) > 0
             then 'Produtos sem correspondência no ERP (SKU): ' || array_to_string(v_faltando, '; ')
                  || '. Cadastre/ative o SKU no produto do ERP e clique em Reprocessar.'
             else 'Pedido sem itens.' end
      where id = p_id;
      return;
    end if;

    -- Entrega: endereço de entrega (ou cobrança); retirada na loja dispensa endereço
    v_retirada := coalesce((p -> 'entrega' ->> 'retirada')::boolean, false);
    if not v_retirada then
      v_end := public._loja_salvar_endereco(v_cli, coalesce(p -> 'entrega' -> 'endereco', p -> 'cliente' -> 'endereco'));
      if v_end is null then
        v_retirada := true;
        v_avisos := v_avisos || 'Endereço de entrega incompleto: venda criada como retirada, ajuste antes de confirmar'::text;
      end if;
    end if;

    v_venda_id := public.salvar_venda(
      jsonb_build_object(
        'cliente_id', v_cli,
        'tipo_entrega', case when v_retirada then 'retirada' else 'entrega' end,
        'endereco_entrega_id', v_end,
        'frete', greatest(round(coalesce(nullif(p ->> 'frete', '')::numeric, 0), 2), 0),
        'observacoes', public._loja_observacoes(p)
      ),
      v_itens,
      '[]'::jsonb
    );
    update public.vendas set origem = 'loja', loja_pedido_id = v_lp.pedido_loja_id where id = v_venda_id;

    select total into v_total from public.vendas where id = v_venda_id;
    v_parcelas := least(greatest(coalesce(nullif(p -> 'pagamento' ->> 'parcelas', '')::int, 1), 1), 48);
    if v_total > 0 then
      insert into public.venda_pagamentos (venda_id, forma, valor, parcelas, primeiro_vencimento, observacao)
      values (v_venda_id, public._loja_forma_pagamento(p -> 'pagamento'), v_total, v_parcelas, public.hoje(),
              left('Loja virtual: ' || coalesce(nullif(p -> 'pagamento' ->> 'titulo', ''), p -> 'pagamento' ->> 'metodo', ''), 200));
    end if;

    if v_total <> v_lp.total_loja then
      v_avisos := v_avisos || ('Total no ERP (R$ ' || v_total || ') difere do total da loja (R$ ' || v_lp.total_loja
                               || ') por arredondamento de preços ou taxas');
    end if;

    update public.loja_pedidos set venda_id = v_venda_id, situacao = 'integrado',
      mensagem = nullif(array_to_string(v_avisos, '. '), '')
    where id = p_id;

  exception when others then
    -- Erro de dados (produto, quantidade, cliente...): registra para tratamento e não perde o pedido
    update public.loja_pedidos set situacao = 'atencao', mensagem = left('Não foi possível integrar: ' || sqlerrm, 1000)
    where id = p_id;
  end;
end;
$$;

-- ---------------------------------------------------------------- Pontos de entrada
-- Chamadas somente pela função de servidor /api/loja-webhook (service_role)
create or replace function public.loja_receber_cliente(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public._loja_salvar_cliente(p);
  if jsonb_typeof(p -> 'endereco') = 'object' then
    perform public._loja_salvar_endereco(v_id, p -> 'endereco');
  end if;
  return (select jsonb_build_object('cliente_id', id, 'codigo', codigo) from public.clientes where id = v_id);
end;
$$;

create or replace function public.loja_receber_pedido(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid bigint := nullif(p ->> 'id', '')::bigint;
  v_mod timestamptz := nullif(p ->> 'modificado_em', '')::timestamptz;
  v_lp public.loja_pedidos%rowtype;
begin
  if v_pid is null or v_pid <= 0 then raise exception 'Pedido sem identificador' using errcode = '22023'; end if;
  if nullif(trim(p ->> 'status'), '') is null then raise exception 'Pedido sem status' using errcode = '22023'; end if;

  select * into v_lp from public.loja_pedidos where pedido_loja_id = v_pid for update;
  if found and v_mod is not null and v_lp.modificado_loja is not null and v_mod < v_lp.modificado_loja then
    -- Envio atrasado de uma versão mais antiga do pedido: ignora
    return jsonb_build_object('pedido', v_lp.id, 'situacao', v_lp.situacao, 'ignorado', true);
  end if;

  insert into public.loja_pedidos (pedido_loja_id, numero_loja, status_loja, cliente_nome, total_loja, forma_pagamento,
    pago_em, modificado_loja, payload)
  values (
    v_pid, left(coalesce(nullif(p ->> 'numero', ''), v_pid::text), 40), left(lower(p ->> 'status'), 40),
    public._loja_texto(coalesce(nullif(p -> 'cliente' ->> 'razao_social', ''), p -> 'cliente' ->> 'nome')),
    round(coalesce(nullif(p ->> 'total', '')::numeric, 0), 2),
    public._loja_texto(coalesce(nullif(p -> 'pagamento' ->> 'titulo', ''), p -> 'pagamento' ->> 'metodo'), 120),
    nullif(p ->> 'pago_em', '')::timestamptz, v_mod, p
  )
  on conflict (pedido_loja_id) do update set
    numero_loja = excluded.numero_loja, status_loja = excluded.status_loja, cliente_nome = excluded.cliente_nome,
    total_loja = excluded.total_loja, forma_pagamento = excluded.forma_pagamento, pago_em = excluded.pago_em,
    modificado_loja = excluded.modificado_loja, payload = excluded.payload, atualizado_em = now()
  returning * into v_lp;

  perform public._loja_processar_pedido(v_lp.id);

  select * into v_lp from public.loja_pedidos where id = v_lp.id;
  return jsonb_build_object(
    'pedido', v_lp.id, 'situacao', v_lp.situacao, 'mensagem', v_lp.mensagem,
    'venda_numero', (select numero from public.vendas where id = v_lp.venda_id)
  );
end;
$$;

-- Tela "Pedidos da Loja": reprocessa um pedido pendente (ex.: depois de cadastrar o SKU)
create or replace function public.loja_reprocessar_pedido(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lp public.loja_pedidos%rowtype;
begin
  if not public.tem_permissao('vendas', 'criar') then
    raise exception 'Sem permissão para criar vendas' using errcode = '42501';
  end if;
  perform public._loja_processar_pedido(p_id);
  select * into v_lp from public.loja_pedidos where id = p_id;
  return jsonb_build_object('situacao', v_lp.situacao, 'mensagem', v_lp.mensagem,
    'venda_numero', (select numero from public.vendas where id = v_lp.venda_id));
end;
$$;

-- ---------------------------------------------------------------- Privilégios
do $$
declare f text;
begin
  foreach f in array array[
    'public._loja_texto(text, int)',
    'public._loja_telefone(text, int)',
    'public._loja_data(text)',
    'public._loja_salvar_cliente(jsonb)',
    'public._loja_salvar_endereco(uuid, jsonb)',
    'public._loja_forma_pagamento(jsonb)',
    'public._loja_observacoes(jsonb)',
    'public._loja_processar_pedido(uuid)',
    'public.loja_receber_cliente(jsonb)',
    'public.loja_receber_pedido(jsonb)',
    'public.fn_protege_origem_loja()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.loja_receber_cliente(jsonb) to service_role;
grant execute on function public.loja_receber_pedido(jsonb) to service_role;
revoke execute on function public.loja_reprocessar_pedido(uuid) from public, anon;
grant execute on function public.loja_reprocessar_pedido(uuid) to authenticated;
grant select on public.loja_pedidos to service_role;
