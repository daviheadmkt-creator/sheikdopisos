-- =====================================================================
-- Revisão de QA / segurança
--  1. Privilégios mínimos: visitante (anon) sem acesso a tabelas; ninguém faz TRUNCATE
--     (o TRUNCATE ignora RLS); views somente leitura; usuarios só edita nome/telefone/ativo.
--  2. Status dos documentos só muda pelas funções oficiais (políticas fixam o status
--     também no WITH CHECK, inclusive no INSERT).
--  3. Valores dos itens sempre recalculados no banco (quantidade × preço − desconto).
--  4. Ao confirmar/aprovar, os totais do cabeçalho precisam bater com os itens.
--  5. Preço abaixo da tabela conta como desconto para o limite que exige aprovação.
--  6. Carimbo de autoria (created_by/created_at) não pode ser forjado nem alterado.
-- =====================================================================

-- ---------------------------------------------------------------- 1. Privilégios
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

do $$
declare v record;
begin
  for v in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' loop
    execute format('revoke insert, update, delete on public.%I from authenticated', v.relname);
  end loop;
end $$;

-- usuarios: o cadastro é criado pelo gatilho de auth.users; pela API só nome, telefone e ativo
revoke insert, update, delete on public.usuarios from authenticated;
grant update (nome, telefone, ativo) on public.usuarios to authenticated;

-- Funções auxiliares sem uso direto pelo navegador
revoke execute on function public.categoria_sistema(text, public.tipo_titulo) from authenticated;
revoke execute on function public.deposito_em_inventario(uuid) from authenticated;

-- ---------------------------------------------------------------- 2. Status fixado nas políticas
alter policy vendas_insert on public.vendas
  with check ((select public.tem_permissao('vendas', 'criar')) and status = 'rascunho');
alter policy vendas_update on public.vendas
  with check ((select public.tem_permissao('vendas', 'editar')) and status = 'rascunho');

alter policy orcamentos_insert on public.orcamentos
  with check ((select public.tem_permissao('orcamentos', 'criar')) and status = 'rascunho');
alter policy orcamentos_update on public.orcamentos
  with check ((select public.tem_permissao('orcamentos', 'editar')) and status in ('rascunho', 'enviado'));

alter policy compras_pedidos_insert on public.compras_pedidos
  with check ((select public.tem_permissao('compras', 'criar')) and status = 'rascunho');
alter policy compras_pedidos_update on public.compras_pedidos
  with check ((select public.tem_permissao('compras', 'editar')) and status = 'rascunho');

alter policy compras_cotacoes_write on public.compras_cotacoes
  with check (((select public.tem_permissao('compras', 'criar')) or (select public.tem_permissao('compras', 'editar')))
              and status in ('aberta', 'cancelada'));

alter policy compras_solicitacoes_insert on public.compras_solicitacoes
  with check (((select public.tem_permissao('compras', 'criar')) or (select public.tem_permissao('estoque', 'criar')))
              and status = 'pendente');
alter policy compras_solicitacoes_update on public.compras_solicitacoes
  with check ((select public.tem_permissao('compras', 'editar')) and status in ('pendente', 'em_cotacao', 'em_pedido', 'cancelada'));

-- ---------------------------------------------------------------- 3. Valores dos itens
create or replace function public.fn_item_valores()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_preco numeric;
begin
  if tg_table_name = 'compras_pedido_itens' then
    v_preco := new.custo_unitario;
  else
    v_preco := new.preco_unitario;
  end if;
  new.valor_bruto := round(new.quantidade * v_preco, 2);
  new.valor_desconto := round(new.valor_bruto * new.desconto_perc / 100, 2);
  new.valor_total := new.valor_bruto - new.valor_desconto;
  return new;
end;
$$;

create trigger trg_item_valores before insert or update on public.venda_itens
  for each row execute function public.fn_item_valores();
create trigger trg_item_valores before insert or update on public.orcamento_itens
  for each row execute function public.fn_item_valores();
create trigger trg_item_valores before insert or update on public.compras_pedido_itens
  for each row execute function public.fn_item_valores();

-- Quantidade recebida só é alterada pelas funções de recebimento (executadas como dono do banco)
create or replace function public.fn_pedido_item_recebido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.quantidade_recebida := case when tg_op = 'INSERT' then 0 else old.quantidade_recebida end;
  end if;
  return new;
end;
$$;

create trigger trg_pedido_item_recebido before insert or update on public.compras_pedido_itens
  for each row execute function public.fn_pedido_item_recebido();

-- ---------------------------------------------------------------- 4 e 5. Conferência ao confirmar/aprovar
create or replace function public._conferir_documento(p_tabela text, p_id uuid, p_subtotal numeric, p_desconto numeric,
  p_frete numeric, p_total numeric, p_modulo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bruto numeric;
  v_vdesc numeric;
  v_lista numeric;
  v_liquido numeric;
  v_limite numeric;
  v_item record;
begin
  execute format('select coalesce(sum(valor_bruto), 0), coalesce(sum(valor_desconto), 0) from public.%I where %I = $1',
                 p_tabela, case p_tabela when 'venda_itens' then 'venda_id' when 'orcamento_itens' then 'orcamento_id' else 'pedido_id' end)
    into v_bruto, v_vdesc using p_id;

  if p_subtotal <> v_bruto or p_desconto <> v_vdesc or p_total <> v_bruto - v_vdesc + p_frete then
    raise exception 'Os totais do documento não conferem com os itens. Abra o documento e salve novamente.'
      using errcode = 'P0001';
  end if;

  if p_modulo is null then return; end if; -- compras: sem preço de tabela

  -- Preço abaixo da tabela também é desconto
  select desconto_max_sem_aprovacao into v_limite from public.parametros_comerciais;
  if v_limite is null or public.tem_permissao(p_modulo, 'aprovar') then return; end if;

  v_lista := 0;
  v_liquido := 0;
  for v_item in execute format(
    'select i.ordem, i.descricao, i.valor_total, round(i.quantidade * p.preco_venda, 2) as lista
       from public.%I i join public.produtos p on p.id = i.produto_id
      where i.%I = $1 order by i.ordem',
    p_tabela, case p_tabela when 'venda_itens' then 'venda_id' else 'orcamento_id' end) using p_id
  loop
    if v_item.lista > 0 then
      v_lista := v_lista + v_item.lista;
      v_liquido := v_liquido + v_item.valor_total;
      if (v_item.lista - v_item.valor_total) / v_item.lista * 100 > v_limite then
        raise exception 'Item % (%): preço abaixo da tabela equivale a desconto de % por cento (limite % por cento). Exige aprovação de um gerente.',
          v_item.ordem, v_item.descricao, round((v_item.lista - v_item.valor_total) / v_item.lista * 100, 2), v_limite
          using errcode = '42501';
      end if;
    end if;
  end loop;
  if v_lista > 0 and (v_lista - v_liquido) / v_lista * 100 > v_limite then
    raise exception 'O desconto total em relação ao preço de tabela (% por cento) passa do limite de % por cento. Exige aprovação de um gerente.',
      round((v_lista - v_liquido) / v_lista * 100, 2), v_limite using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public._conferir_documento(text, uuid, numeric, numeric, numeric, numeric, text) from public, anon, authenticated;

create or replace function public.fn_conferir_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'vendas' and old.status::text = 'rascunho' and new.status::text = 'confirmada' then
    perform public._conferir_documento('venda_itens', new.id, new.subtotal, new.desconto_total, new.frete, new.total, 'vendas');
  elsif tg_table_name = 'orcamentos' and old.status::text in ('rascunho', 'enviado') and new.status::text = 'aprovado' then
    perform public._conferir_documento('orcamento_itens', new.id, new.subtotal, new.desconto_total, new.frete, new.total, 'orcamentos');
  elsif tg_table_name = 'compras_pedidos' and old.status::text = 'rascunho' and new.status::text = 'aprovado' then
    perform public._conferir_documento('compras_pedido_itens', new.id, new.subtotal, new.desconto_total, new.frete, new.total, null);
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_conferir_documento() from public, anon, authenticated;

create trigger trg_conferir_documento before update of status on public.vendas
  for each row execute function public.fn_conferir_documento();
create trigger trg_conferir_documento before update of status on public.orcamentos
  for each row execute function public.fn_conferir_documento();
create trigger trg_conferir_documento before update of status on public.compras_pedidos
  for each row execute function public.fn_conferir_documento();

-- ---------------------------------------------------------------- 6. Carimbo de autoria
create or replace function public.fn_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
