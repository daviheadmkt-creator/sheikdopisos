-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 3: comercial
-- Parâmetros comerciais, orçamentos, vendas, itens e pagamentos.
--
-- Princípios:
--  * Totais SEMPRE recalculados no servidor (nunca confiar no cliente).
--  * Revestimento: caixas = teto(área × (1 + sobra%) ÷ m²/caixa); quantidade = m² coberto.
--  * Confirmar venda reserva estoque por item, em UM lote (sem mistura automática).
--  * Pagamentos: à vista, parcelado ou misto; soma deve fechar com o total.
--  * Pedido de venda NÃO é documento fiscal (NF-e/NFC-e em fase futura).
-- =====================================================================

create type public.status_orcamento as enum ('rascunho', 'enviado', 'aprovado', 'recusado', 'convertido', 'cancelado');
create type public.status_venda as enum ('rascunho', 'confirmada', 'cancelada', 'concluida');
create type public.forma_pagamento as enum (
  'dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'crediario'
);

-- ---------------------------------------------------------------------
-- Parâmetros comerciais (linha única; editável na Tela 12)
-- ---------------------------------------------------------------------
create table public.parametros_comerciais (
  id boolean primary key default true check (id),
  reservar_ao_confirmar boolean not null default true,
  validade_orcamento_dias int not null default 10 check (validade_orcamento_dias between 1 and 180),
  validade_reserva_dias int not null default 7 check (validade_reserva_dias between 1 and 90),
  perc_sobra_padrao numeric(5,2) not null default 10 check (perc_sobra_padrao between 0 and 100),
  desconto_max_sem_aprovacao numeric(5,2) not null default 5 check (desconto_max_sem_aprovacao between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.parametros_comerciais default values;

-- ---------------------------------------------------------------------
-- Orçamentos
-- ---------------------------------------------------------------------
create sequence public.orcamentos_numero_seq start 1;

create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.orcamentos_numero_seq'),
  cliente_id uuid references public.clientes(id) on delete restrict,
  cliente_nome text,
  cliente_telefone text,
  vendedor_id uuid references public.usuarios(id) on delete set null,
  status public.status_orcamento not null default 'rascunho',
  validade date not null,
  condicoes_pagamento text,
  observacoes text,
  subtotal numeric(14,2) not null default 0,
  desconto_total numeric(14,2) not null default 0,
  frete numeric(14,2) not null default 0 check (frete >= 0),
  total numeric(14,2) not null default 0,
  venda_id uuid unique,
  motivo_status text,
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint orcamento_cliente check (cliente_id is not null or nullif(trim(cliente_nome), '') is not null)
);
create index orcamentos_cliente_idx on public.orcamentos(cliente_id);
create index orcamentos_status_idx on public.orcamentos(status, created_at desc);

create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  ordem int not null,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  descricao text not null,
  unidade text not null,
  m2_por_caixa numeric(10,4),
  area_m2 numeric(14,4) check (area_m2 is null or area_m2 > 0),
  perc_sobra numeric(5,2) not null default 0 check (perc_sobra between 0 and 100),
  caixas int check (caixas is null or caixas > 0),
  quantidade numeric(14,4) not null check (quantidade > 0),
  preco_unitario numeric(14,2) not null check (preco_unitario >= 0),
  desconto_perc numeric(5,2) not null default 0 check (desconto_perc between 0 and 100),
  valor_bruto numeric(14,2) not null,
  valor_desconto numeric(14,2) not null,
  valor_total numeric(14,2) not null,
  observacao text
);
create index orcamento_itens_orc_idx on public.orcamento_itens(orcamento_id, ordem);

-- ---------------------------------------------------------------------
-- Vendas (pedidos)
-- ---------------------------------------------------------------------
create sequence public.vendas_numero_seq start 1;

create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.vendas_numero_seq'),
  orcamento_id uuid unique references public.orcamentos(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  vendedor_id uuid references public.usuarios(id) on delete set null,
  status public.status_venda not null default 'rascunho',
  tipo_entrega text not null default 'retirada' check (tipo_entrega in ('retirada', 'entrega')),
  endereco_entrega_id uuid references public.cliente_enderecos(id) on delete restrict,
  subtotal numeric(14,2) not null default 0,
  desconto_total numeric(14,2) not null default 0,
  frete numeric(14,2) not null default 0 check (frete >= 0),
  total numeric(14,2) not null default 0,
  observacoes text,
  confirmada_em timestamptz,
  confirmada_por uuid references auth.users(id) on delete set null,
  cancelada_em timestamptz,
  cancelada_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint venda_endereco_entrega check (tipo_entrega = 'retirada' or endereco_entrega_id is not null)
);
create index vendas_cliente_idx on public.vendas(cliente_id, created_at desc);
create index vendas_status_idx on public.vendas(status, created_at desc);

alter table public.orcamentos
  add constraint orcamentos_venda_fk foreign key (venda_id) references public.vendas(id) on delete restrict;

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  ordem int not null,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  descricao text not null,
  unidade text not null,
  m2_por_caixa numeric(10,4),
  area_m2 numeric(14,4) check (area_m2 is null or area_m2 > 0),
  perc_sobra numeric(5,2) not null default 0 check (perc_sobra between 0 and 100),
  caixas int check (caixas is null or caixas > 0),
  quantidade numeric(14,4) not null check (quantidade > 0),
  preco_unitario numeric(14,2) not null check (preco_unitario >= 0),
  desconto_perc numeric(5,2) not null default 0 check (desconto_perc between 0 and 100),
  valor_bruto numeric(14,2) not null,
  valor_desconto numeric(14,2) not null,
  valor_total numeric(14,2) not null,
  lote_id uuid,
  deposito_id uuid references public.depositos(id) on delete restrict,
  localizacao_id uuid,
  reserva_id uuid references public.estoque_reservas(id) on delete restrict,
  observacao text,
  constraint venda_item_lote_fk foreign key (lote_id, produto_id) references public.lotes(id, produto_id),
  constraint venda_item_local_fk foreign key (localizacao_id, deposito_id) references public.localizacoes(id, deposito_id)
);
create index venda_itens_venda_idx on public.venda_itens(venda_id, ordem);
create index venda_itens_produto_idx on public.venda_itens(produto_id);

create table public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  forma public.forma_pagamento not null,
  valor numeric(14,2) not null check (valor > 0),
  parcelas int not null default 1 check (parcelas between 1 and 48),
  primeiro_vencimento date,
  intervalo_dias int not null default 30 check (intervalo_dias between 1 and 120),
  observacao text
);
create index venda_pagamentos_venda_idx on public.venda_pagamentos(venda_id);

-- ---------------------------------------------------------------------
-- Cálculo dos itens (mesma regra do frontend: src/features/comercial/calculos.ts)
-- ---------------------------------------------------------------------
create or replace function public.calcular_item_comercial(p_item jsonb)
returns table (
  produto_id uuid, descricao text, unidade text, m2_por_caixa numeric, area_m2 numeric, perc_sobra numeric,
  caixas int, quantidade numeric, preco_unitario numeric, desconto_perc numeric,
  valor_bruto numeric, valor_desconto numeric, valor_total numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_prod record;
  v_area numeric := nullif(p_item ->> 'area_m2', '')::numeric;
  v_sobra numeric := coalesce(nullif(p_item ->> 'perc_sobra', '')::numeric, 0);
  v_desc numeric := coalesce(nullif(p_item ->> 'desconto_perc', '')::numeric, 0);
  v_preco numeric := (p_item ->> 'preco_unitario')::numeric;
  v_caixas int;
  v_qtd numeric;
  v_bruto numeric;
  v_vdesc numeric;
begin
  select p.id, p.descricao, p.unidade, p.eh_revestimento, p.m2_por_caixa, p.status
  into v_prod from public.produtos p where p.id = (p_item ->> 'produto_id')::uuid;
  if not found then raise exception 'Produto não encontrado' using errcode = 'P0002'; end if;
  if v_prod.status <> 'ativo' then
    raise exception 'O produto % está inativo', v_prod.descricao using errcode = 'P0001';
  end if;
  if v_preco is null or v_preco < 0 then raise exception 'Preço inválido' using errcode = '22023'; end if;

  if v_prod.eh_revestimento and v_area is not null and v_prod.m2_por_caixa > 0 then
    v_caixas := ceil(v_area * (1 + v_sobra / 100) / v_prod.m2_por_caixa)::int;
    v_qtd := case when v_prod.unidade = 'CX' then v_caixas::numeric else v_caixas * v_prod.m2_por_caixa end;
  else
    v_area := null;
    v_qtd := (p_item ->> 'quantidade')::numeric;
    if v_prod.eh_revestimento and v_prod.m2_por_caixa > 0 and v_prod.unidade <> 'CX' then
      v_caixas := ceil(v_qtd / v_prod.m2_por_caixa)::int;
    end if;
  end if;
  perform public.validar_quantidade_produto(v_prod.id, v_qtd);

  v_bruto := round(v_qtd * v_preco, 2);
  v_vdesc := round(v_bruto * v_desc / 100, 2);

  return query select v_prod.id, v_prod.descricao, v_prod.unidade, v_prod.m2_por_caixa, v_area, v_sobra,
    v_caixas, v_qtd, v_preco, v_desc, v_bruto, v_vdesc, v_bruto - v_vdesc;
end;
$$;

-- ---------------------------------------------------------------------
-- Orçamento: salvar (cabeçalho + itens, uma transação)
-- ---------------------------------------------------------------------
create or replace function public.salvar_orcamento(p jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_status public.status_orcamento;
  v_validade int;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua ao menos um item no orçamento' using errcode = '22023';
  end if;
  select validade_orcamento_dias into v_validade from public.parametros_comerciais;

  if v_id is null then
    insert into public.orcamentos (cliente_id, cliente_nome, cliente_telefone, vendedor_id, validade,
      condicoes_pagamento, observacoes, frete)
    values (
      nullif(p ->> 'cliente_id', '')::uuid, nullif(trim(p ->> 'cliente_nome'), ''),
      nullif(p ->> 'cliente_telefone', ''), coalesce(nullif(p ->> 'vendedor_id', '')::uuid, auth.uid()),
      coalesce(nullif(p ->> 'validade', '')::date, current_date + v_validade),
      nullif(trim(p ->> 'condicoes_pagamento'), ''), nullif(trim(p ->> 'observacoes'), ''),
      coalesce(nullif(p ->> 'frete', '')::numeric, 0)
    ) returning id into v_id;
  else
    select status into v_status from public.orcamentos where id = v_id for update;
    if not found then raise exception 'Orçamento não encontrado' using errcode = 'P0002'; end if;
    if v_status not in ('rascunho', 'enviado') then
      raise exception 'Orçamento % não pode mais ser alterado', v_status using errcode = 'P0001';
    end if;
    update public.orcamentos set
      cliente_id = nullif(p ->> 'cliente_id', '')::uuid,
      cliente_nome = nullif(trim(p ->> 'cliente_nome'), ''),
      cliente_telefone = nullif(p ->> 'cliente_telefone', ''),
      vendedor_id = nullif(p ->> 'vendedor_id', '')::uuid,
      validade = nullif(p ->> 'validade', '')::date,
      condicoes_pagamento = nullif(trim(p ->> 'condicoes_pagamento'), ''),
      observacoes = nullif(trim(p ->> 'observacoes'), ''),
      frete = coalesce(nullif(p ->> 'frete', '')::numeric, 0)
    where id = v_id;
    delete from public.orcamento_itens where orcamento_id = v_id;
  end if;

  insert into public.orcamento_itens (orcamento_id, ordem, produto_id, descricao, unidade, m2_por_caixa, area_m2,
    perc_sobra, caixas, quantidade, preco_unitario, desconto_perc, valor_bruto, valor_desconto, valor_total, observacao)
  select v_id, e.ordem, c.produto_id, c.descricao, c.unidade, c.m2_por_caixa, c.area_m2, c.perc_sobra, c.caixas,
         c.quantidade, c.preco_unitario, c.desconto_perc, c.valor_bruto, c.valor_desconto, c.valor_total,
         nullif(trim(e.item ->> 'observacao'), '')
  from jsonb_array_elements(p_itens) with ordinality as e(item, ordem)
  cross join lateral public.calcular_item_comercial(e.item) c;

  update public.orcamentos o set
    subtotal = s.bruto, desconto_total = s.vdesc, total = s.bruto - s.vdesc + o.frete
  from (select coalesce(sum(valor_bruto), 0) as bruto, coalesce(sum(valor_desconto), 0) as vdesc
        from public.orcamento_itens where orcamento_id = v_id) s
  where o.id = v_id;

  return v_id;
end;
$$;

-- Desconto acima do limite exige permissão de aprovação
create or replace function public.verificar_limite_desconto(p_modulo text, p_maior_desconto numeric, p_desconto_total numeric, p_bruto numeric)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite numeric;
begin
  select desconto_max_sem_aprovacao into v_limite from public.parametros_comerciais;
  if (p_maior_desconto > v_limite or (p_bruto > 0 and p_desconto_total / p_bruto * 100 > v_limite))
     and not public.tem_permissao(p_modulo, 'aprovar') then
    raise exception 'Desconto acima de % por cento exige aprovação de um gerente', v_limite using errcode = '42501';
  end if;
end;
$$;

create or replace function public.alterar_status_orcamento(p_id uuid, p_status public.status_orcamento, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orc public.orcamentos%rowtype;
  v_maior numeric;
begin
  select * into v_orc from public.orcamentos where id = p_id for update;
  if not found then raise exception 'Orçamento não encontrado' using errcode = 'P0002'; end if;

  if p_status = 'enviado' then
    if not public.tem_permissao('orcamentos', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
    if v_orc.status <> 'rascunho' then raise exception 'Somente rascunhos podem ser enviados' using errcode = 'P0001'; end if;
  elsif p_status = 'aprovado' then
    if not public.tem_permissao('orcamentos', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
    if v_orc.status not in ('rascunho', 'enviado') then raise exception 'Orçamento não pode ser aprovado' using errcode = 'P0001'; end if;
    if v_orc.validade < current_date then raise exception 'Orçamento vencido: atualize a validade' using errcode = 'P0001'; end if;
    if v_orc.cliente_id is null then
      raise exception 'Vincule um cliente cadastrado antes de aprovar' using errcode = 'P0001';
    end if;
    select max(desconto_perc) into v_maior from public.orcamento_itens where orcamento_id = p_id;
    perform public.verificar_limite_desconto('orcamentos', coalesce(v_maior, 0), v_orc.desconto_total, v_orc.subtotal);
  elsif p_status = 'recusado' then
    if not public.tem_permissao('orcamentos', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
    if v_orc.status not in ('rascunho', 'enviado', 'aprovado') then raise exception 'Operação inválida' using errcode = 'P0001'; end if;
  elsif p_status = 'cancelado' then
    if not public.tem_permissao('orcamentos', 'cancelar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
    if v_orc.status in ('convertido', 'cancelado') then raise exception 'Operação inválida' using errcode = 'P0001'; end if;
  else
    raise exception 'Transição de status não permitida' using errcode = '22023';
  end if;

  if p_status in ('recusado', 'cancelado') and nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;

  update public.orcamentos set
    status = p_status,
    motivo_status = coalesce(nullif(trim(p_motivo), ''), motivo_status),
    aprovado_em = case when p_status = 'aprovado' then now() else aprovado_em end,
    aprovado_por = case when p_status = 'aprovado' then auth.uid() else aprovado_por end
  where id = p_id;
end;
$$;

-- Converte orçamento aprovado em venda (rascunho). Idempotente.
create or replace function public.converter_orcamento_em_venda(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orc public.orcamentos%rowtype;
  v_venda uuid;
begin
  if not public.tem_permissao('vendas', 'criar') then
    raise exception 'Sem permissão para criar vendas' using errcode = '42501';
  end if;
  select * into v_orc from public.orcamentos where id = p_id for update;
  if not found then raise exception 'Orçamento não encontrado' using errcode = 'P0002'; end if;
  if v_orc.venda_id is not null then return v_orc.venda_id; end if;
  if v_orc.status <> 'aprovado' then
    raise exception 'Somente orçamentos aprovados podem ser convertidos' using errcode = 'P0001';
  end if;
  if v_orc.cliente_id is null then
    raise exception 'Vincule um cliente cadastrado ao orçamento antes de converter' using errcode = 'P0001';
  end if;

  insert into public.vendas (orcamento_id, cliente_id, vendedor_id, subtotal, desconto_total, frete, total, observacoes)
  values (p_id, v_orc.cliente_id, v_orc.vendedor_id, v_orc.subtotal, v_orc.desconto_total, v_orc.frete, v_orc.total,
          v_orc.observacoes)
  returning id into v_venda;

  insert into public.venda_itens (venda_id, ordem, produto_id, descricao, unidade, m2_por_caixa, area_m2, perc_sobra,
    caixas, quantidade, preco_unitario, desconto_perc, valor_bruto, valor_desconto, valor_total, observacao)
  select v_venda, ordem, produto_id, descricao, unidade, m2_por_caixa, area_m2, perc_sobra, caixas, quantidade,
         preco_unitario, desconto_perc, valor_bruto, valor_desconto, valor_total, observacao
  from public.orcamento_itens where orcamento_id = p_id;

  update public.orcamentos set status = 'convertido', venda_id = v_venda where id = p_id;
  return v_venda;
end;
$$;

-- ---------------------------------------------------------------------
-- Venda: salvar rascunho (cabeçalho + itens + pagamentos)
-- ---------------------------------------------------------------------
create or replace function public.salvar_venda(p jsonb, p_itens jsonb, p_pagamentos jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_status public.status_venda;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua ao menos um item na venda' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.vendas (cliente_id, vendedor_id, tipo_entrega, endereco_entrega_id, frete, observacoes)
    values (
      (p ->> 'cliente_id')::uuid, coalesce(nullif(p ->> 'vendedor_id', '')::uuid, auth.uid()),
      coalesce(nullif(p ->> 'tipo_entrega', ''), 'retirada'), nullif(p ->> 'endereco_entrega_id', '')::uuid,
      coalesce(nullif(p ->> 'frete', '')::numeric, 0), nullif(trim(p ->> 'observacoes'), '')
    ) returning id into v_id;
  else
    select status into v_status from public.vendas where id = v_id for update;
    if not found then raise exception 'Venda não encontrada' using errcode = 'P0002'; end if;
    if v_status <> 'rascunho' then
      raise exception 'Venda % não pode ser alterada', v_status using errcode = 'P0001';
    end if;
    update public.vendas set
      cliente_id = (p ->> 'cliente_id')::uuid,
      vendedor_id = nullif(p ->> 'vendedor_id', '')::uuid,
      tipo_entrega = coalesce(nullif(p ->> 'tipo_entrega', ''), 'retirada'),
      endereco_entrega_id = nullif(p ->> 'endereco_entrega_id', '')::uuid,
      frete = coalesce(nullif(p ->> 'frete', '')::numeric, 0),
      observacoes = nullif(trim(p ->> 'observacoes'), '')
    where id = v_id;
    delete from public.venda_itens where venda_id = v_id;
    delete from public.venda_pagamentos where venda_id = v_id;
  end if;

  insert into public.venda_itens (venda_id, ordem, produto_id, descricao, unidade, m2_por_caixa, area_m2, perc_sobra,
    caixas, quantidade, preco_unitario, desconto_perc, valor_bruto, valor_desconto, valor_total, lote_id, deposito_id,
    localizacao_id, observacao)
  select v_id, e.ordem, c.produto_id, c.descricao, c.unidade, c.m2_por_caixa, c.area_m2, c.perc_sobra, c.caixas,
         c.quantidade, c.preco_unitario, c.desconto_perc, c.valor_bruto, c.valor_desconto, c.valor_total,
         nullif(e.item ->> 'lote_id', '')::uuid, nullif(e.item ->> 'deposito_id', '')::uuid,
         nullif(e.item ->> 'localizacao_id', '')::uuid, nullif(trim(e.item ->> 'observacao'), '')
  from jsonb_array_elements(p_itens) with ordinality as e(item, ordem)
  cross join lateral public.calcular_item_comercial(e.item) c;

  insert into public.venda_pagamentos (venda_id, forma, valor, parcelas, primeiro_vencimento, intervalo_dias, observacao)
  select v_id, (x ->> 'forma')::public.forma_pagamento, (x ->> 'valor')::numeric,
         coalesce(nullif(x ->> 'parcelas', '')::int, 1), nullif(x ->> 'primeiro_vencimento', '')::date,
         coalesce(nullif(x ->> 'intervalo_dias', '')::int, 30), nullif(trim(x ->> 'observacao'), '')
  from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) x;

  update public.vendas v set
    subtotal = s.bruto, desconto_total = s.vdesc, total = s.bruto - s.vdesc + v.frete
  from (select coalesce(sum(valor_bruto), 0) as bruto, coalesce(sum(valor_desconto), 0) as vdesc
        from public.venda_itens where venda_id = v_id) s
  where v.id = v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Venda: confirmar (valida, reserva estoque por lote). Idempotente.
-- ---------------------------------------------------------------------
create or replace function public.confirmar_venda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.vendas%rowtype;
  v_param public.parametros_comerciais%rowtype;
  v_item record;
  v_pago numeric;
  v_maior numeric;
  v_cliente_status text;
  v_disp numeric;
  v_res uuid;
begin
  if not (public.tem_permissao('vendas', 'criar') or public.tem_permissao('vendas', 'editar')) then
    raise exception 'Sem permissão para confirmar vendas' using errcode = '42501';
  end if;
  select * into v_venda from public.vendas where id = p_id for update;
  if not found then raise exception 'Venda não encontrada' using errcode = 'P0002'; end if;
  if v_venda.status = 'confirmada' then return; end if;
  if v_venda.status <> 'rascunho' then
    raise exception 'Somente vendas em rascunho podem ser confirmadas' using errcode = 'P0001';
  end if;
  select * into v_param from public.parametros_comerciais;

  select status into v_cliente_status from public.clientes where id = v_venda.cliente_id;
  if v_cliente_status <> 'ativo' then
    raise exception 'Cliente % não pode comprar', v_cliente_status using errcode = 'P0001';
  end if;

  select coalesce(sum(valor), 0) into v_pago from public.venda_pagamentos where venda_id = p_id;
  if v_pago <> v_venda.total then
    raise exception 'Pagamentos (R$ %) não fecham com o total da venda (R$ %)', v_pago, v_venda.total using errcode = 'P0001';
  end if;

  select max(desconto_perc) into v_maior from public.venda_itens where venda_id = p_id;
  perform public.verificar_limite_desconto('vendas', coalesce(v_maior, 0), v_venda.desconto_total, v_venda.subtotal);

  for v_item in
    select i.*, p.eh_revestimento from public.venda_itens i join public.produtos p on p.id = i.produto_id
    where i.venda_id = p_id order by i.ordem
  loop
    if v_item.deposito_id is null then
      raise exception 'Item %: selecione o lote/local de estoque', v_item.ordem using errcode = 'P0001';
    end if;
    if v_item.eh_revestimento and v_item.lote_id is null then
      raise exception 'Item % (%): revestimentos exigem lote', v_item.ordem, v_item.descricao using errcode = 'P0001';
    end if;

    if v_param.reservar_ao_confirmar then
      v_res := public.reservar_estoque(jsonb_build_object(
        'produto_id', v_item.produto_id, 'lote_id', v_item.lote_id, 'deposito_id', v_item.deposito_id,
        'localizacao_id', v_item.localizacao_id, 'quantidade', v_item.quantidade,
        'cliente_id', v_venda.cliente_id, 'documento_tipo', 'venda', 'documento_id', p_id::text,
        'validade', (now() + make_interval(days => v_param.validade_reserva_dias))::text,
        'chave_idempotencia', 'venda-item:' || v_item.id
      ));
      update public.venda_itens set reserva_id = v_res where id = v_item.id;
    else
      select quantidade_disponivel into v_disp from public.estoque_saldos
      where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id
        and lote_id is not distinct from v_item.lote_id and localizacao_id is not distinct from v_item.localizacao_id;
      if coalesce(v_disp, 0) < v_item.quantidade then
        raise exception 'Item % (%): estoque disponível insuficiente', v_item.ordem, v_item.descricao using errcode = 'P0001';
      end if;
    end if;
  end loop;

  update public.vendas set status = 'confirmada', confirmada_em = now(), confirmada_por = auth.uid() where id = p_id;
end;
$$;

-- Cancela a venda e libera as reservas ativas vinculadas
create or replace function public.cancelar_venda(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.vendas%rowtype;
  v_res public.estoque_reservas%rowtype;
begin
  if not public.tem_permissao('vendas', 'cancelar') then
    raise exception 'Sem permissão para cancelar vendas' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into v_venda from public.vendas where id = p_id for update;
  if not found then raise exception 'Venda não encontrada' using errcode = 'P0002'; end if;
  if v_venda.status not in ('rascunho', 'confirmada') then
    raise exception 'Venda % não pode ser cancelada', v_venda.status using errcode = 'P0001';
  end if;
  if exists (select 1 from public.estoque_reservas where documento_tipo = 'venda' and documento_id = p_id::text
             and quantidade_consumida > 0) then
    raise exception 'Venda com mercadoria já separada/entregue: use devolução' using errcode = 'P0001';
  end if;

  for v_res in select * from public.estoque_reservas
               where documento_tipo = 'venda' and documento_id = p_id::text and status = 'ativa' for update loop
    update public.estoque_saldos set quantidade_reservada = quantidade_reservada - (v_res.quantidade - v_res.quantidade_consumida),
      updated_at = now()
    where produto_id = v_res.produto_id and deposito_id = v_res.deposito_id
      and lote_id is not distinct from v_res.lote_id and localizacao_id is not distinct from v_res.localizacao_id;
    update public.estoque_reservas set status = 'liberada', encerrada_em = now(), encerrada_por = auth.uid(),
      motivo_encerramento = 'Venda cancelada: ' || trim(p_motivo)
    where id = v_res.id;
  end loop;

  update public.vendas set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(),
    motivo_cancelamento = trim(p_motivo)
  where id = p_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.calcular_item_comercial(jsonb)',
    'public.salvar_orcamento(jsonb, jsonb)',
    'public.verificar_limite_desconto(text, numeric, numeric, numeric)',
    'public.alterar_status_orcamento(uuid, public.status_orcamento, text)',
    'public.converter_orcamento_em_venda(uuid)',
    'public.salvar_venda(jsonb, jsonb, jsonb)',
    'public.confirmar_venda(uuid)',
    'public.cancelar_venda(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Carimbos, auditoria e RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['orcamentos', 'vendas'] loop
    execute format('create trigger trg_carimbo before insert or update on public.%I
                    for each row execute function public.fn_carimbo()', t);
  end loop;
  foreach t in array array['parametros_comerciais', 'orcamentos', 'orcamento_itens', 'vendas', 'venda_itens', 'venda_pagamentos'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

alter table public.parametros_comerciais enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.venda_pagamentos enable row level security;

create policy parametros_select on public.parametros_comerciais for select to authenticated using (true);
create policy parametros_update on public.parametros_comerciais for update to authenticated
  using (public.tem_permissao('configuracoes', 'editar')) with check (public.tem_permissao('configuracoes', 'editar'));

create policy orcamentos_select on public.orcamentos for select to authenticated using (public.tem_permissao('orcamentos', 'ler'));
create policy orcamentos_insert on public.orcamentos for insert to authenticated with check (public.tem_permissao('orcamentos', 'criar'));
create policy orcamentos_update on public.orcamentos for update to authenticated
  using (public.tem_permissao('orcamentos', 'editar') and status in ('rascunho', 'enviado'))
  with check (public.tem_permissao('orcamentos', 'editar'));

create policy orcamento_itens_select on public.orcamento_itens for select to authenticated using (public.tem_permissao('orcamentos', 'ler'));
create policy orcamento_itens_write on public.orcamento_itens for all to authenticated
  using ((public.tem_permissao('orcamentos', 'criar') or public.tem_permissao('orcamentos', 'editar'))
         and exists (select 1 from public.orcamentos o where o.id = orcamento_id and o.status in ('rascunho', 'enviado')))
  with check ((public.tem_permissao('orcamentos', 'criar') or public.tem_permissao('orcamentos', 'editar'))
         and exists (select 1 from public.orcamentos o where o.id = orcamento_id and o.status in ('rascunho', 'enviado')));

create policy vendas_select on public.vendas for select to authenticated using (public.tem_permissao('vendas', 'ler'));
create policy vendas_insert on public.vendas for insert to authenticated with check (public.tem_permissao('vendas', 'criar'));
create policy vendas_update on public.vendas for update to authenticated
  using (public.tem_permissao('vendas', 'editar') and status = 'rascunho')
  with check (public.tem_permissao('vendas', 'editar'));

create policy venda_itens_select on public.venda_itens for select to authenticated using (public.tem_permissao('vendas', 'ler'));
create policy venda_itens_write on public.venda_itens for all to authenticated
  using ((public.tem_permissao('vendas', 'criar') or public.tem_permissao('vendas', 'editar'))
         and exists (select 1 from public.vendas v where v.id = venda_id and v.status = 'rascunho'))
  with check ((public.tem_permissao('vendas', 'criar') or public.tem_permissao('vendas', 'editar'))
         and exists (select 1 from public.vendas v where v.id = venda_id and v.status = 'rascunho'));

create policy venda_pagamentos_select on public.venda_pagamentos for select to authenticated using (public.tem_permissao('vendas', 'ler'));
create policy venda_pagamentos_write on public.venda_pagamentos for all to authenticated
  using ((public.tem_permissao('vendas', 'criar') or public.tem_permissao('vendas', 'editar'))
         and exists (select 1 from public.vendas v where v.id = venda_id and v.status = 'rascunho'))
  with check ((public.tem_permissao('vendas', 'criar') or public.tem_permissao('vendas', 'editar'))
         and exists (select 1 from public.vendas v where v.id = venda_id and v.status = 'rascunho'));
