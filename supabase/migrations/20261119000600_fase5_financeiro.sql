-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 5: financeiro, contas a pagar/receber e caixa
--
-- Conceitos (diferenciados conforme solicitado):
--  * Faturamento  = vendas confirmadas (regime de competência).
--  * Recebimento  = dinheiro efetivamente recebido (movimentos financeiros).
--  * Saldo        = saldo inicial + entradas − saídas de cada conta.
--
-- Princípios:
--  * Títulos/parcelas/movimentos só mudam por funções do servidor.
--  * Movimentos financeiros são imutáveis; correção por ESTORNO (lançamento inverso).
--  * Venda confirmada → título a receber; recebimento de compra confirmado → título a pagar.
--  * Conta do tipo caixa só movimenta com sessão de caixa aberta.
--  * Operações aceitam chave de idempotência.
-- =====================================================================

create type public.tipo_titulo as enum ('receber', 'pagar');
create type public.status_titulo as enum ('aberto', 'parcial', 'liquidado', 'cancelado');
create type public.status_parcela as enum ('aberta', 'parcial', 'paga', 'cancelada');
create type public.tipo_conta_financeira as enum ('caixa', 'banco', 'carteira');
create type public.natureza_movimento as enum ('recebimento', 'pagamento', 'suprimento', 'sangria', 'transferencia', 'ajuste', 'estorno');

-- ---------------------------------------------------------------------
-- Parâmetros, contas, categorias e centros de custo
-- ---------------------------------------------------------------------
create table public.parametros_financeiros (
  id boolean primary key default true check (id),
  multa_perc numeric(5,2) not null default 2 check (multa_perc between 0 and 20),
  juros_mes_perc numeric(5,2) not null default 1 check (juros_mes_perc between 0 and 20),
  dias_carencia int not null default 0 check (dias_carencia between 0 and 30),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.parametros_financeiros default values;

create table public.contas_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) >= 2),
  tipo public.tipo_conta_financeira not null,
  banco text,
  agencia text,
  numero_conta text,
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date not null default current_date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.tipo_titulo not null,
  grupo_dre text not null check (grupo_dre in (
    'receita_vendas', 'outras_receitas', 'receitas_financeiras',
    'estoque', 'despesas_vendas', 'despesas_pessoal', 'despesas_ocupacao', 'despesas_administrativas',
    'despesas_financeiras', 'impostos', 'nao_operacional'
  )),
  sistema boolean not null default false,
  ativo boolean not null default true,
  unique (nome, tipo)
);

create table public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) >= 2),
  ativo boolean not null default true
);

-- ---------------------------------------------------------------------
-- Títulos e parcelas
-- ---------------------------------------------------------------------
create sequence public.titulos_numero_seq start 1;

create table public.titulos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.titulos_numero_seq'),
  tipo public.tipo_titulo not null,
  descricao text not null check (length(trim(descricao)) >= 3),
  cliente_id uuid references public.clientes(id) on delete restrict,
  fornecedor_id uuid references public.fornecedores(id) on delete restrict,
  categoria_id uuid not null references public.categorias_financeiras(id) on delete restrict,
  centro_custo_id uuid references public.centros_custo(id) on delete restrict,
  documento_tipo text not null default 'manual' check (documento_tipo in ('manual', 'venda', 'compra')),
  documento_id text,
  competencia date not null,
  valor_total numeric(14,2) not null check (valor_total > 0),
  status public.status_titulo not null default 'aberto',
  observacoes text,
  chave_idempotencia text unique,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint titulo_pessoa check ((tipo = 'receber' and fornecedor_id is null) or (tipo = 'pagar' and cliente_id is null))
);
create unique index titulos_documento_uk on public.titulos(documento_tipo, documento_id, tipo) where documento_tipo <> 'manual';
create index titulos_tipo_status_idx on public.titulos(tipo, status);
create index titulos_cliente_idx on public.titulos(cliente_id);
create index titulos_fornecedor_idx on public.titulos(fornecedor_id);

create table public.titulo_parcelas (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references public.titulos(id) on delete cascade,
  numero int not null check (numero > 0),
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  valor_pago numeric(14,2) not null default 0,
  juros_pagos numeric(14,2) not null default 0 check (juros_pagos >= 0),
  descontos numeric(14,2) not null default 0 check (descontos >= 0),
  status public.status_parcela not null default 'aberta',
  forma_prevista public.forma_pagamento,
  liquidada_em date,
  unique (titulo_id, numero),
  constraint parcela_pago check (valor_pago >= 0 and valor_pago <= valor)
);
create index titulo_parcelas_venc_idx on public.titulo_parcelas(status, vencimento);

-- Custo do produto no momento da venda (para CMV/DRE)
alter table public.venda_itens add column custo_unitario numeric(14,4);

-- ---------------------------------------------------------------------
-- Caixa e movimentos financeiros
-- ---------------------------------------------------------------------
create sequence public.caixa_sessoes_numero_seq start 1;

create table public.caixa_sessoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.caixa_sessoes_numero_seq'),
  conta_id uuid not null references public.contas_financeiras(id) on delete restrict,
  operador_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  operador_nome text,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  aberto_em timestamptz not null default now(),
  valor_abertura numeric(14,2) not null check (valor_abertura >= 0),
  saldo_sistema_abertura numeric(14,2) not null,
  fechado_em timestamptz,
  valor_esperado numeric(14,2),
  valor_contado numeric(14,2) check (valor_contado is null or valor_contado >= 0),
  diferenca numeric(14,2),
  observacoes text
);
create unique index caixa_sessoes_aberta_uk on public.caixa_sessoes(conta_id) where status = 'aberto';
create index caixa_sessoes_operador_idx on public.caixa_sessoes(operador_id, aberto_em desc);

create sequence public.movimentos_financeiros_numero_seq start 1;

create table public.movimentos_financeiros (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.movimentos_financeiros_numero_seq'),
  conta_id uuid not null references public.contas_financeiras(id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'saida')),
  natureza public.natureza_movimento not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  titulo_id uuid references public.titulos(id) on delete restrict,
  parcela_id uuid references public.titulo_parcelas(id) on delete restrict,
  caixa_sessao_id uuid references public.caixa_sessoes(id) on delete restrict,
  categoria_id uuid references public.categorias_financeiras(id) on delete restrict,
  centro_custo_id uuid references public.centros_custo(id) on delete restrict,
  forma_pagamento public.forma_pagamento,
  descricao text not null,
  valor_principal numeric(14,2) not null default 0,
  valor_juros numeric(14,2) not null default 0,
  valor_desconto numeric(14,2) not null default 0,
  transferencia_id uuid,
  estorno_de uuid unique references public.movimentos_financeiros(id) on delete restrict,
  chave_idempotencia text unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_nome text
);
create index movimentos_conta_data_idx on public.movimentos_financeiros(conta_id, data desc);
create index movimentos_parcela_idx on public.movimentos_financeiros(parcela_id);
create index movimentos_sessao_idx on public.movimentos_financeiros(caixa_sessao_id);
create index movimentos_data_idx on public.movimentos_financeiros(data);

create trigger trg_movimentos_fin_imutaveis
  before update or delete on public.movimentos_financeiros
  for each row execute function public.fn_bloqueia_alteracao();

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public.saldo_conta(p_conta uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select c.saldo_inicial + coalesce((
    select sum(case when m.tipo = 'entrada' then m.valor else -m.valor end)
    from public.movimentos_financeiros m where m.conta_id = c.id), 0)
  from public.contas_financeiras c where c.id = p_conta;
$$;

create or replace function public.categoria_sistema(p_nome text, p_tipo public.tipo_titulo)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.categorias_financeiras where nome = p_nome and tipo = p_tipo;
$$;

create or replace function public._atualizar_status_titulo(p_titulo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.titulos t set status = case
      when t.status = 'cancelado' then 'cancelado'::public.status_titulo
      when not exists (select 1 from public.titulo_parcelas p where p.titulo_id = t.id and p.status in ('aberta', 'parcial'))
        then 'liquidado'::public.status_titulo
      when exists (select 1 from public.titulo_parcelas p where p.titulo_id = t.id and p.valor_pago > 0)
        then 'parcial'::public.status_titulo
      else 'aberto'::public.status_titulo end
  where t.id = p_titulo;
end;
$$;

-- Cria título com N parcelas iguais (diferença de centavos na 1ª)
create or replace function public._criar_titulo(
  p_tipo public.tipo_titulo, p_descricao text, p_cliente uuid, p_fornecedor uuid, p_categoria uuid, p_centro uuid,
  p_doc_tipo text, p_doc_id text, p_competencia date, p_valor numeric, p_parcelas int, p_primeiro_venc date,
  p_intervalo int, p_forma public.forma_pagamento, p_obs text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_base numeric;
  v_resto numeric;
  i int;
begin
  if p_valor is null or p_valor <= 0 then raise exception 'Valor do título deve ser maior que zero' using errcode = '22023'; end if;
  if p_parcelas < 1 or p_parcelas > 120 then raise exception 'Quantidade de parcelas inválida' using errcode = '22023'; end if;
  v_base := trunc(p_valor / p_parcelas, 2);
  if v_base <= 0 then raise exception 'Valor insuficiente para a quantidade de parcelas' using errcode = '22023'; end if;
  v_resto := p_valor - v_base * p_parcelas;

  insert into public.titulos (tipo, descricao, cliente_id, fornecedor_id, categoria_id, centro_custo_id, documento_tipo,
    documento_id, competencia, valor_total, observacoes)
  values (p_tipo, trim(p_descricao), p_cliente, p_fornecedor, p_categoria, p_centro, coalesce(p_doc_tipo, 'manual'),
    p_doc_id, p_competencia, p_valor, nullif(trim(p_obs), ''))
  returning id into v_id;

  for i in 1..p_parcelas loop
    insert into public.titulo_parcelas (titulo_id, numero, vencimento, valor, forma_prevista)
    values (v_id, i, p_primeiro_venc + (i - 1) * p_intervalo, v_base + case when i = 1 then v_resto else 0 end, p_forma);
  end loop;
  return v_id;
end;
$$;

-- Sessão aberta da conta (caixa) validando o operador
create or replace function public._sessao_caixa(p_conta uuid, p_exigir_operador boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sessao public.caixa_sessoes%rowtype;
begin
  select * into v_sessao from public.caixa_sessoes where conta_id = p_conta and status = 'aberto';
  if not found then
    raise exception 'O caixa está fechado. Abra o caixa antes de movimentar' using errcode = 'P0001';
  end if;
  if p_exigir_operador and v_sessao.operador_id <> auth.uid() and not public.tem_permissao('caixa', 'aprovar') then
    raise exception 'Este caixa foi aberto por %; somente o operador ou um gerente pode movimentá-lo', v_sessao.operador_nome
      using errcode = '42501';
  end if;
  return v_sessao.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Liquidação (pagamento/recebimento) de parcela — núcleo interno
-- ---------------------------------------------------------------------
create or replace function public._liquidar_parcela(
  p_parcela uuid, p_conta uuid, p_data date, p_principal numeric, p_juros numeric, p_desconto numeric,
  p_forma public.forma_pagamento, p_chave text, p_descricao text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parc public.titulo_parcelas%rowtype;
  v_tit public.titulos%rowtype;
  v_conta public.contas_financeiras%rowtype;
  v_sessao uuid;
  v_valor numeric;
  v_mov uuid;
  v_restante numeric;
begin
  if p_chave is not null then
    select id into v_mov from public.movimentos_financeiros where chave_idempotencia = p_chave;
    if found then return v_mov; end if;
  end if;

  select * into v_parc from public.titulo_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if v_parc.status in ('paga', 'cancelada') then raise exception 'Parcela já %', v_parc.status using errcode = 'P0001'; end if;
  select * into v_tit from public.titulos where id = v_parc.titulo_id;
  if v_tit.status = 'cancelado' then raise exception 'Título cancelado' using errcode = 'P0001'; end if;

  v_restante := v_parc.valor - v_parc.valor_pago;
  p_juros := coalesce(p_juros, 0);
  p_desconto := coalesce(p_desconto, 0);
  if p_principal is null or p_principal <= 0 or p_principal > v_restante then
    raise exception 'Valor principal inválido: em aberto R$ %', v_restante using errcode = '22023';
  end if;
  if p_juros < 0 or p_desconto < 0 then raise exception 'Juros e desconto não podem ser negativos' using errcode = '22023'; end if;
  v_valor := p_principal + p_juros - p_desconto;
  if v_valor <= 0 then raise exception 'O desconto não pode ser igual ou maior que o valor pago' using errcode = '22023'; end if;

  select * into v_conta from public.contas_financeiras where id = p_conta;
  if not found or not v_conta.ativo then raise exception 'Conta financeira inválida ou inativa' using errcode = '22023'; end if;
  if v_conta.tipo = 'caixa' then v_sessao := public._sessao_caixa(p_conta); end if;
  if v_tit.tipo = 'pagar' and public.saldo_conta(p_conta) < v_valor and v_conta.tipo = 'caixa' then
    raise exception 'Saldo insuficiente no caixa (R$ %)', public.saldo_conta(p_conta) using errcode = 'P0001';
  end if;

  insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, titulo_id, parcela_id, caixa_sessao_id,
    categoria_id, centro_custo_id, forma_pagamento, descricao, valor_principal, valor_juros, valor_desconto,
    chave_idempotencia, created_by_nome)
  values (p_conta, case when v_tit.tipo = 'receber' then 'entrada' else 'saida' end,
    case when v_tit.tipo = 'receber' then 'recebimento'::public.natureza_movimento else 'pagamento'::public.natureza_movimento end,
    v_valor, coalesce(p_data, current_date), v_tit.id, p_parcela, v_sessao, v_tit.categoria_id, v_tit.centro_custo_id, p_forma,
    coalesce(nullif(trim(p_descricao), ''), format('%s %s/%s — %s', case when v_tit.tipo = 'receber' then 'Recebimento' else 'Pagamento' end,
      v_tit.numero, v_parc.numero, v_tit.descricao)),
    p_principal, p_juros, p_desconto, p_chave, public.nome_usuario_atual())
  returning id into v_mov;

  update public.titulo_parcelas set
    valor_pago = valor_pago + p_principal,
    juros_pagos = juros_pagos + p_juros,
    descontos = descontos + p_desconto,
    status = case when valor_pago + p_principal = valor then 'paga'::public.status_parcela else 'parcial'::public.status_parcela end,
    liquidada_em = case when valor_pago + p_principal = valor then coalesce(p_data, current_date) else liquidada_em end
  where id = p_parcela;

  perform public._atualizar_status_titulo(v_tit.id);
  return v_mov;
exception
  when unique_violation then
    select id into v_mov from public.movimentos_financeiros where chave_idempotencia = p_chave;
    if v_mov is not null then return v_mov; end if;
    raise;
end;
$$;

revoke execute on function public._criar_titulo(public.tipo_titulo, text, uuid, uuid, uuid, uuid, text, text, date, numeric, int, date, int, public.forma_pagamento, text) from public, anon, authenticated;
revoke execute on function public._liquidar_parcela(uuid, uuid, date, numeric, numeric, numeric, public.forma_pagamento, text, text) from public, anon, authenticated;
revoke execute on function public._atualizar_status_titulo(uuid) from public, anon, authenticated;
revoke execute on function public._sessao_caixa(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- API pública: títulos e liquidação
-- ---------------------------------------------------------------------
create or replace function public.liquidar_parcela(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_tipo public.tipo_conta_financeira;
begin
  select tipo into v_conta_tipo from public.contas_financeiras where id = (p ->> 'conta_id')::uuid;
  if not (public.tem_permissao('contas', 'editar') or (v_conta_tipo = 'caixa' and public.tem_permissao('caixa', 'criar'))) then
    raise exception 'Sem permissão para liquidar títulos' using errcode = '42501';
  end if;
  return public._liquidar_parcela(
    (p ->> 'parcela_id')::uuid, (p ->> 'conta_id')::uuid, nullif(p ->> 'data', '')::date,
    (p ->> 'principal')::numeric, nullif(p ->> 'juros', '')::numeric, nullif(p ->> 'desconto', '')::numeric,
    nullif(p ->> 'forma', '')::public.forma_pagamento, nullif(p ->> 'chave_idempotencia', ''), p ->> 'descricao');
end;
$$;

-- Título manual (despesa/receita avulsa). Opcionalmente já liquidado (lançamento à vista).
create or replace function public.criar_titulo(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_tipo public.tipo_titulo := (p ->> 'tipo')::public.tipo_titulo;
  v_pago boolean := coalesce((p ->> 'pago')::boolean, false);
  v_conta uuid := nullif(p ->> 'conta_id', '')::uuid;
  v_conta_tipo public.tipo_conta_financeira;
  v_parc uuid;
  v_cat_tipo public.tipo_titulo;
begin
  select tipo into v_conta_tipo from public.contas_financeiras where id = v_conta;
  if not (public.tem_permissao('contas', 'criar') or (v_pago and v_conta_tipo = 'caixa' and public.tem_permissao('caixa', 'criar'))) then
    raise exception 'Sem permissão para lançar títulos' using errcode = '42501';
  end if;
  if nullif(p ->> 'chave_idempotencia', '') is not null then
    select id into v_id from public.titulos where chave_idempotencia = p ->> 'chave_idempotencia';
    if found then return v_id; end if;
  end if;
  select tipo into v_cat_tipo from public.categorias_financeiras where id = (p ->> 'categoria_id')::uuid and ativo;
  if v_cat_tipo is distinct from v_tipo then
    raise exception 'Categoria inválida para este tipo de título' using errcode = '22023';
  end if;

  v_id := public._criar_titulo(
    v_tipo, p ->> 'descricao',
    case when v_tipo = 'receber' then nullif(p ->> 'cliente_id', '')::uuid end,
    case when v_tipo = 'pagar' then nullif(p ->> 'fornecedor_id', '')::uuid end,
    (p ->> 'categoria_id')::uuid, nullif(p ->> 'centro_custo_id', '')::uuid, 'manual', null,
    coalesce(nullif(p ->> 'competencia', '')::date, current_date), (p ->> 'valor')::numeric,
    case when v_pago then 1 else coalesce(nullif(p ->> 'parcelas', '')::int, 1) end,
    coalesce(nullif(p ->> 'primeiro_vencimento', '')::date, current_date),
    coalesce(nullif(p ->> 'intervalo_dias', '')::int, 30),
    nullif(p ->> 'forma', '')::public.forma_pagamento, p ->> 'observacoes');
  update public.titulos set chave_idempotencia = nullif(p ->> 'chave_idempotencia', '') where id = v_id;

  if v_pago then
    if v_conta is null then raise exception 'Informe a conta do pagamento' using errcode = '22023'; end if;
    select id into v_parc from public.titulo_parcelas where titulo_id = v_id and numero = 1;
    perform public._liquidar_parcela(v_parc, v_conta, coalesce(nullif(p ->> 'competencia', '')::date, current_date),
      (p ->> 'valor')::numeric, 0, 0, nullif(p ->> 'forma', '')::public.forma_pagamento,
      nullif(p ->> 'chave_idempotencia', '') || ':1', null);
  end if;
  return v_id;
end;
$$;

create or replace function public.cancelar_titulo(p_titulo uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tit public.titulos%rowtype;
begin
  if not (public.tem_permissao('contas', 'cancelar') or public.tem_permissao('financeiro', 'cancelar')) then
    raise exception 'Sem permissão para cancelar títulos' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into v_tit from public.titulos where id = p_titulo for update;
  if not found then raise exception 'Título não encontrado' using errcode = 'P0002'; end if;
  if v_tit.status = 'cancelado' then return; end if;
  if v_tit.documento_tipo = 'venda' then
    raise exception 'Títulos de venda são cancelados pelo cancelamento da venda' using errcode = 'P0001';
  end if;
  if v_tit.documento_tipo = 'compra' and not public.tem_permissao('financeiro', 'cancelar') then
    raise exception 'Somente o financeiro pode cancelar títulos de compra' using errcode = '42501';
  end if;
  if exists (select 1 from public.titulo_parcelas where titulo_id = p_titulo and valor_pago > 0) then
    raise exception 'Título com pagamentos: estorne os movimentos antes de cancelar' using errcode = 'P0001';
  end if;
  update public.titulos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = trim(p_motivo) where id = p_titulo;
  update public.titulo_parcelas set status = 'cancelada' where titulo_id = p_titulo;
end;
$$;

-- Estorno: lançamento inverso; reabre a parcela quando houver
create or replace function public.estornar_movimento(p_movimento uuid, p_motivo text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimentos_financeiros%rowtype;
  v_alvo public.movimentos_financeiros%rowtype;
  v_sessao uuid;
  v_n int := 0;
  v_conta_tipo public.tipo_conta_financeira;
begin
  if not (public.tem_permissao('financeiro', 'cancelar') or public.tem_permissao('contas', 'cancelar')) then
    raise exception 'Sem permissão para estornar' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into v_mov from public.movimentos_financeiros where id = p_movimento;
  if not found then raise exception 'Movimento não encontrado' using errcode = 'P0002'; end if;
  if v_mov.natureza = 'estorno' then raise exception 'Estornos não podem ser estornados' using errcode = 'P0001'; end if;

  -- transferências: estorna as duas pontas
  for v_alvo in
    select * from public.movimentos_financeiros
    where (v_mov.transferencia_id is not null and transferencia_id = v_mov.transferencia_id) or id = v_mov.id
  loop
    if exists (select 1 from public.movimentos_financeiros where estorno_de = v_alvo.id) then
      raise exception 'Movimento nº % já estornado', v_alvo.numero using errcode = 'P0001';
    end if;
    if v_alvo.caixa_sessao_id is not null and
       (select status from public.caixa_sessoes where id = v_alvo.caixa_sessao_id) = 'fechado' then
      raise exception 'O caixa do movimento nº % já foi fechado: lance um ajuste', v_alvo.numero using errcode = 'P0001';
    end if;
    select tipo into v_conta_tipo from public.contas_financeiras where id = v_alvo.conta_id;
    v_sessao := v_alvo.caixa_sessao_id;

    insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, titulo_id, parcela_id, caixa_sessao_id,
      categoria_id, centro_custo_id, forma_pagamento, descricao, valor_principal, valor_juros, valor_desconto,
      transferencia_id, estorno_de, created_by_nome)
    values (v_alvo.conta_id, case when v_alvo.tipo = 'entrada' then 'saida' else 'entrada' end, 'estorno', v_alvo.valor,
      current_date, v_alvo.titulo_id, v_alvo.parcela_id, v_sessao, v_alvo.categoria_id, v_alvo.centro_custo_id,
      v_alvo.forma_pagamento, format('Estorno do movimento nº %s: %s', v_alvo.numero, trim(p_motivo)),
      v_alvo.valor_principal, v_alvo.valor_juros, v_alvo.valor_desconto, v_alvo.transferencia_id, v_alvo.id,
      public.nome_usuario_atual());

    if v_alvo.parcela_id is not null then
      update public.titulo_parcelas set
        valor_pago = valor_pago - v_alvo.valor_principal,
        juros_pagos = greatest(juros_pagos - v_alvo.valor_juros, 0),
        descontos = greatest(descontos - v_alvo.valor_desconto, 0),
        status = case when valor_pago - v_alvo.valor_principal = 0 then 'aberta'::public.status_parcela else 'parcial'::public.status_parcela end,
        liquidada_em = null
      where id = v_alvo.parcela_id;
      perform public._atualizar_status_titulo(v_alvo.titulo_id);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.transferir_entre_contas(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origem uuid := (p ->> 'conta_origem_id')::uuid;
  v_destino uuid := (p ->> 'conta_destino_id')::uuid;
  v_valor numeric := (p ->> 'valor')::numeric;
  v_transf uuid := gen_random_uuid();
  v_desc text := coalesce(nullif(trim(p ->> 'descricao'), ''), 'Transferência entre contas');
  v_s1 uuid;
  v_s2 uuid;
begin
  if not public.tem_permissao('financeiro', 'criar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if v_origem = v_destino then raise exception 'Origem e destino devem ser diferentes' using errcode = '22023'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if nullif(p ->> 'chave_idempotencia', '') is not null and exists (
    select 1 from public.movimentos_financeiros where chave_idempotencia = (p ->> 'chave_idempotencia') || ':s') then
    return (select transferencia_id from public.movimentos_financeiros where chave_idempotencia = (p ->> 'chave_idempotencia') || ':s');
  end if;
  if (select tipo from public.contas_financeiras where id = v_origem) = 'caixa' then v_s1 := public._sessao_caixa(v_origem, false); end if;
  if (select tipo from public.contas_financeiras where id = v_destino) = 'caixa' then v_s2 := public._sessao_caixa(v_destino, false); end if;
  if public.saldo_conta(v_origem) < v_valor then
    raise exception 'Saldo insuficiente na conta de origem (R$ %)', public.saldo_conta(v_origem) using errcode = 'P0001';
  end if;

  insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, caixa_sessao_id, descricao, transferencia_id,
    chave_idempotencia, created_by_nome)
  values
    (v_origem, 'saida', 'transferencia', v_valor, coalesce(nullif(p ->> 'data', '')::date, current_date), v_s1, v_desc, v_transf,
     nullif(p ->> 'chave_idempotencia', '') || ':s', public.nome_usuario_atual()),
    (v_destino, 'entrada', 'transferencia', v_valor, coalesce(nullif(p ->> 'data', '')::date, current_date), v_s2, v_desc, v_transf,
     nullif(p ->> 'chave_idempotencia', '') || ':e', public.nome_usuario_atual());
  return v_transf;
end;
$$;

-- ---------------------------------------------------------------------
-- Caixa
-- ---------------------------------------------------------------------
create or replace function public.abrir_caixa(p_conta uuid, p_valor_abertura numeric, p_observacoes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_saldo numeric;
  v_dif numeric;
begin
  if not public.tem_permissao('caixa', 'criar') then raise exception 'Sem permissão para abrir caixa' using errcode = '42501'; end if;
  if (select tipo from public.contas_financeiras where id = p_conta and ativo) is distinct from 'caixa' then
    raise exception 'Selecione uma conta do tipo caixa' using errcode = '22023';
  end if;
  if exists (select 1 from public.caixa_sessoes where conta_id = p_conta and status = 'aberto') then
    raise exception 'Este caixa já está aberto' using errcode = 'P0001';
  end if;
  if p_valor_abertura is null or p_valor_abertura < 0 then raise exception 'Informe o valor contado na abertura' using errcode = '22023'; end if;
  v_saldo := public.saldo_conta(p_conta);

  insert into public.caixa_sessoes (conta_id, operador_nome, valor_abertura, saldo_sistema_abertura, observacoes)
  values (p_conta, public.nome_usuario_atual(), p_valor_abertura, v_saldo, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  -- diferença entre o contado e o sistema na abertura fica registrada como ajuste
  v_dif := p_valor_abertura - v_saldo;
  if v_dif <> 0 then
    insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, caixa_sessao_id, categoria_id, descricao, created_by_nome)
    values (p_conta, case when v_dif > 0 then 'entrada' else 'saida' end, 'ajuste', abs(v_dif), current_date, v_id,
            public.categoria_sistema('Quebra de caixa', 'pagar'),
            format('Diferença na abertura do caixa nº %s (contado R$ %s, sistema R$ %s)', (select numero from public.caixa_sessoes where id = v_id), p_valor_abertura, v_saldo),
            public.nome_usuario_atual());
  end if;
  return v_id;
end;
$$;

-- Suprimento (entrada de troco) ou sangria (retirada); opcionalmente de/para outra conta
create or replace function public.movimentar_caixa(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text := p ->> 'tipo';  -- 'suprimento' | 'sangria'
  v_conta uuid := (p ->> 'conta_id')::uuid;
  v_outra uuid := nullif(p ->> 'outra_conta_id', '')::uuid;
  v_valor numeric := (p ->> 'valor')::numeric;
  v_sessao uuid;
  v_transf uuid;
  v_id uuid;
  v_chave text := nullif(p ->> 'chave_idempotencia', '');
begin
  if not public.tem_permissao('caixa', 'criar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if v_tipo not in ('suprimento', 'sangria') then raise exception 'Operação inválida' using errcode = '22023'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if v_chave is not null then
    select id into v_id from public.movimentos_financeiros where chave_idempotencia = v_chave;
    if found then return v_id; end if;
  end if;
  v_sessao := public._sessao_caixa(v_conta);
  if v_tipo = 'sangria' and public.saldo_conta(v_conta) < v_valor then
    raise exception 'Saldo do caixa insuficiente (R$ %)', public.saldo_conta(v_conta) using errcode = 'P0001';
  end if;
  if v_outra is not null then
    if v_tipo = 'suprimento' and public.saldo_conta(v_outra) < v_valor then
      raise exception 'Saldo insuficiente na conta de origem' using errcode = 'P0001';
    end if;
    v_transf := gen_random_uuid();
  end if;

  insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, caixa_sessao_id, descricao, transferencia_id,
    chave_idempotencia, created_by_nome)
  values (v_conta, case when v_tipo = 'suprimento' then 'entrada' else 'saida' end, v_tipo::public.natureza_movimento, v_valor,
    current_date, v_sessao, coalesce(nullif(trim(p ->> 'descricao'), ''), initcap(v_tipo)), v_transf, v_chave, public.nome_usuario_atual())
  returning id into v_id;

  if v_outra is not null then
    insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, descricao, transferencia_id, created_by_nome)
    values (v_outra, case when v_tipo = 'suprimento' then 'saida' else 'entrada' end, 'transferencia', v_valor, current_date,
      format('%s do caixa: %s', initcap(v_tipo), coalesce(nullif(trim(p ->> 'descricao'), ''), '')), v_transf, public.nome_usuario_atual());
  end if;
  return v_id;
end;
$$;

create or replace function public.fechar_caixa(p_sessao uuid, p_valor_contado numeric, p_observacoes text default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.caixa_sessoes%rowtype;
  v_esperado numeric;
  v_dif numeric;
begin
  if not public.tem_permissao('caixa', 'criar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into v_s from public.caixa_sessoes where id = p_sessao for update;
  if not found then raise exception 'Sessão não encontrada' using errcode = 'P0002'; end if;
  if v_s.status = 'fechado' then return v_s.diferenca; end if;
  if v_s.operador_id <> auth.uid() and not public.tem_permissao('caixa', 'aprovar') then
    raise exception 'Somente o operador ou um gerente pode fechar este caixa' using errcode = '42501';
  end if;
  if p_valor_contado is null or p_valor_contado < 0 then raise exception 'Informe o valor contado' using errcode = '22023'; end if;

  v_esperado := public.saldo_conta(v_s.conta_id);
  v_dif := p_valor_contado - v_esperado;
  if v_dif <> 0 then
    insert into public.movimentos_financeiros (conta_id, tipo, natureza, valor, data, caixa_sessao_id, categoria_id, descricao, created_by_nome)
    values (v_s.conta_id, case when v_dif > 0 then 'entrada' else 'saida' end, 'ajuste', abs(v_dif), current_date, p_sessao,
            public.categoria_sistema('Quebra de caixa', 'pagar'),
            format('%s no fechamento do caixa nº %s', case when v_dif > 0 then 'Sobra' else 'Falta' end, v_s.numero),
            public.nome_usuario_atual());
  end if;

  update public.caixa_sessoes set status = 'fechado', fechado_em = now(), valor_esperado = v_esperado,
    valor_contado = p_valor_contado, diferenca = v_dif,
    observacoes = concat_ws(E'\n', observacoes, nullif(trim(p_observacoes), ''))
  where id = p_sessao;
  return v_dif;
end;
$$;

-- ---------------------------------------------------------------------
-- Integração: vendas → contas a receber
-- ---------------------------------------------------------------------
create or replace function public.gerar_titulo_venda(p_venda uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.vendas%rowtype;
  v_tit uuid;
  v_pg record;
  v_n int;
  v_num int := 0;
  v_base numeric;
  v_resto numeric;
  i int;
begin
  select id into v_tit from public.titulos where documento_tipo = 'venda' and documento_id = p_venda::text and tipo = 'receber';
  if found then return v_tit; end if;
  select * into v_venda from public.vendas where id = p_venda;
  if v_venda.total <= 0 then return null; end if;

  insert into public.titulos (tipo, descricao, cliente_id, categoria_id, documento_tipo, documento_id, competencia, valor_total)
  values ('receber', format('Venda nº %s', v_venda.numero), v_venda.cliente_id,
          public.categoria_sistema('Vendas de mercadorias', 'receber'), 'venda', p_venda::text,
          coalesce(v_venda.confirmada_em::date, current_date), v_venda.total)
  returning id into v_tit;

  for v_pg in select * from public.venda_pagamentos where venda_id = p_venda order by valor desc, id loop
    v_n := case when v_pg.forma in ('cartao_credito', 'boleto', 'crediario') then v_pg.parcelas else 1 end;
    v_base := trunc(v_pg.valor / v_n, 2);
    v_resto := v_pg.valor - v_base * v_n;
    for i in 1..v_n loop
      v_num := v_num + 1;
      insert into public.titulo_parcelas (titulo_id, numero, vencimento, valor, forma_prevista)
      values (v_tit, v_num,
        case
          when v_pg.forma in ('boleto', 'crediario') then coalesce(v_pg.primeiro_vencimento, current_date + 30) + (i - 1) * v_pg.intervalo_dias
          when v_pg.forma = 'cartao_credito' then current_date + 30 * i   -- repasse da operadora
          else current_date
        end,
        v_base + case when i = 1 then v_resto else 0 end, v_pg.forma);
    end loop;
  end loop;
  return v_tit;
end;
$$;

create or replace function public.fn_vendas_financeiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tit uuid;
begin
  if new.status = 'confirmada' and old.status is distinct from 'confirmada' then
    update public.venda_itens vi set custo_unitario = p.custo
    from public.produtos p where p.id = vi.produto_id and vi.venda_id = new.id;
    perform public.gerar_titulo_venda(new.id);
  elsif new.status = 'cancelada' and old.status = 'confirmada' then
    select id into v_tit from public.titulos where documento_tipo = 'venda' and documento_id = new.id::text and tipo = 'receber';
    if v_tit is not null then
      if exists (select 1 from public.titulo_parcelas where titulo_id = v_tit and valor_pago > 0) then
        raise exception 'Venda com recebimentos registrados: estorne os recebimentos antes de cancelar' using errcode = 'P0001';
      end if;
      update public.titulos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = new.motivo_cancelamento where id = v_tit;
      update public.titulo_parcelas set status = 'cancelada' where titulo_id = v_tit;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_vendas_financeiro
  after update of status on public.vendas
  for each row execute function public.fn_vendas_financeiro();

-- ---------------------------------------------------------------------
-- Integração: recebimento de compra → contas a pagar
-- ---------------------------------------------------------------------
create or replace function public.fn_recebimento_financeiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ped public.compras_pedidos%rowtype;
  v_valor numeric;
begin
  if new.status <> 'confirmado' or old.status = 'confirmado' then return new; end if;
  if exists (select 1 from public.titulos where documento_tipo = 'compra' and documento_id = new.id::text) then return new; end if;
  select * into v_ped from public.compras_pedidos where id = new.pedido_id;

  select coalesce(sum(round(ri.quantidade * round(pi.custo_unitario * (1 - pi.desconto_perc / 100), 4), 2)), 0) into v_valor
  from public.compras_recebimento_itens ri
  join public.compras_pedido_itens pi on pi.id = ri.pedido_item_id
  where ri.recebimento_id = new.id;

  -- frete do pedido entra no primeiro recebimento confirmado
  if not exists (select 1 from public.compras_recebimentos r where r.pedido_id = new.pedido_id and r.status = 'confirmado' and r.id <> new.id) then
    v_valor := v_valor + v_ped.frete;
  end if;
  if v_valor <= 0 then return new; end if;

  perform public._criar_titulo(
    'pagar', format('Compra — pedido nº %s / recebimento nº %s%s', v_ped.numero, new.numero, coalesce(' / NF ' || new.nota_fiscal, '')),
    null, v_ped.fornecedor_id, public.categoria_sistema('Compras de mercadorias', 'pagar'), null,
    'compra', new.id::text, new.data_recebimento, v_valor, v_ped.parcelas,
    new.data_recebimento + v_ped.primeiro_vencimento_dias, v_ped.intervalo_dias, 'boleto', v_ped.condicao_pagamento);
  return new;
end;
$$;

create trigger trg_recebimento_financeiro
  after update of status on public.compras_recebimentos
  for each row execute function public.fn_recebimento_financeiro();

-- ---------------------------------------------------------------------
-- Relatórios: resumo, fluxo de caixa e DRE gerencial
-- ---------------------------------------------------------------------
create or replace function public.resumo_financeiro(p_de date, p_ate date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.tem_permissao('financeiro', 'ler') then jsonb_build_object(
    'faturamento', (select coalesce(sum(total), 0) from public.vendas
                    where status in ('confirmada', 'concluida') and confirmada_em::date between p_de and p_ate),
    'recebido', (select coalesce(sum(case when m.tipo = 'entrada' then m.valor else -m.valor end), 0) from public.movimentos_financeiros m
                 where m.natureza in ('recebimento', 'estorno') and m.data between p_de and p_ate
                   and (m.natureza = 'recebimento' or exists (select 1 from public.movimentos_financeiros o where o.id = m.estorno_de and o.natureza = 'recebimento'))),
    'pago', (select coalesce(sum(case when m.tipo = 'saida' then m.valor else -m.valor end), 0) from public.movimentos_financeiros m
             where m.natureza in ('pagamento', 'estorno') and m.data between p_de and p_ate
               and (m.natureza = 'pagamento' or exists (select 1 from public.movimentos_financeiros o where o.id = m.estorno_de and o.natureza = 'pagamento'))),
    'saldo_contas', (select coalesce(sum(public.saldo_conta(id)), 0) from public.contas_financeiras where ativo),
    'receber_aberto', (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id
                       where t.tipo = 'receber' and p.status in ('aberta', 'parcial')),
    'receber_vencido', (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id
                        where t.tipo = 'receber' and p.status in ('aberta', 'parcial') and p.vencimento < current_date),
    'pagar_aberto', (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id
                     where t.tipo = 'pagar' and p.status in ('aberta', 'parcial')),
    'pagar_7_dias', (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id
                     where t.tipo = 'pagar' and p.status in ('aberta', 'parcial') and p.vencimento <= current_date + 7)
  ) end;
$$;

create or replace function public.fluxo_caixa(p_de date, p_ate date)
returns table (data date, entradas_realizadas numeric, saidas_realizadas numeric, entradas_previstas numeric, saidas_previstas numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with dias as (select generate_series(p_de, p_ate, interval '1 day')::date as data),
  realizado as (
    select m.data,
      sum(case when m.tipo = 'entrada' then m.valor else 0 end) as ent,
      sum(case when m.tipo = 'saida' then m.valor else 0 end) as sai
    from public.movimentos_financeiros m
    where m.data between p_de and p_ate and m.natureza <> 'transferencia'
      and not (m.natureza = 'estorno' and m.transferencia_id is not null)
    group by m.data
  ),
  previsto as (
    select greatest(p.vencimento, current_date) as data,
      sum(case when t.tipo = 'receber' then p.valor - p.valor_pago else 0 end) as ent,
      sum(case when t.tipo = 'pagar' then p.valor - p.valor_pago else 0 end) as sai
    from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id
    where p.status in ('aberta', 'parcial') and p.vencimento <= p_ate
    group by 1
  )
  select d.data, coalesce(r.ent, 0), coalesce(r.sai, 0), coalesce(pv.ent, 0), coalesce(pv.sai, 0)
  from dias d
  left join realizado r on r.data = d.data
  left join previsto pv on pv.data = d.data
  where public.tem_permissao('financeiro', 'ler')
  order by d.data;
$$;

create or replace function public.dre_gerencial(p_de date, p_ate date)
returns table (ordem int, tipo text, descricao text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receita numeric; v_desc numeric; v_frete numeric; v_cmv numeric; v_outras numeric;
  v_despesas numeric; v_fin numeric; v_quebras numeric;
begin
  if not public.tem_permissao('financeiro', 'ler') then raise exception 'Sem permissão' using errcode = '42501'; end if;

  select coalesce(sum(v.subtotal), 0), coalesce(sum(v.desconto_total), 0), coalesce(sum(v.frete), 0)
  into v_receita, v_desc, v_frete
  from public.vendas v where v.status in ('confirmada', 'concluida') and v.confirmada_em::date between p_de and p_ate;

  select coalesce(sum(round(i.quantidade * coalesce(i.custo_unitario, 0), 2)), 0) into v_cmv
  from public.venda_itens i join public.vendas v on v.id = i.venda_id
  where v.status in ('confirmada', 'concluida') and v.confirmada_em::date between p_de and p_ate;

  select coalesce(sum(t.valor_total), 0) into v_outras
  from public.titulos t join public.categorias_financeiras c on c.id = t.categoria_id
  where t.tipo = 'receber' and t.status <> 'cancelado' and t.documento_tipo = 'manual'
    and c.grupo_dre = 'outras_receitas' and t.competencia between p_de and p_ate;

  -- resultado financeiro: juros e descontos de liquidações (exceto movimentos estornados)
  select coalesce(sum(case when m.tipo = 'entrada' then m.valor_juros - m.valor_desconto else m.valor_desconto - m.valor_juros end), 0)
  into v_fin
  from public.movimentos_financeiros m
  where m.natureza in ('recebimento', 'pagamento') and m.data between p_de and p_ate
    and not exists (select 1 from public.movimentos_financeiros e where e.estorno_de = m.id);

  select coalesce(sum(case when m.tipo = 'entrada' then m.valor else -m.valor end), 0) into v_quebras
  from public.movimentos_financeiros m where m.natureza = 'ajuste' and m.data between p_de and p_ate;

  return query select 10, 'linha', 'Receita bruta de vendas', v_receita;
  return query select 20, 'linha', '(−) Descontos concedidos', -v_desc;
  return query select 30, 'linha', '(+) Fretes cobrados', v_frete;
  return query select 40, 'total', 'Receita líquida', v_receita - v_desc + v_frete;
  return query select 50, 'linha', '(−) Custo das mercadorias vendidas (CMV)', -v_cmv;
  return query select 60, 'total', 'Lucro bruto', v_receita - v_desc + v_frete - v_cmv;

  return query
    select 70, 'despesa',
      '(−) ' || case c.grupo_dre
        when 'despesas_vendas' then 'Despesas com vendas' when 'despesas_pessoal' then 'Despesas com pessoal'
        when 'despesas_ocupacao' then 'Ocupação (aluguel, energia, água)' when 'despesas_administrativas' then 'Despesas administrativas'
        when 'despesas_financeiras' then 'Despesas financeiras e tarifas' when 'impostos' then 'Impostos e taxas'
        else 'Outras despesas' end || ': ' || c.nome,
      -sum(t.valor_total)
    from public.titulos t join public.categorias_financeiras c on c.id = t.categoria_id
    where t.tipo = 'pagar' and t.status <> 'cancelado' and c.grupo_dre not in ('estoque', 'nao_operacional')
      and t.competencia between p_de and p_ate
    group by c.grupo_dre, c.nome
    order by c.grupo_dre, c.nome;

  select coalesce(sum(t.valor_total), 0) into v_despesas
  from public.titulos t join public.categorias_financeiras c on c.id = t.categoria_id
  where t.tipo = 'pagar' and t.status <> 'cancelado' and c.grupo_dre not in ('estoque', 'nao_operacional')
    and t.competencia between p_de and p_ate;

  return query select 80, 'linha', '(+) Outras receitas operacionais', v_outras;
  return query select 90, 'total', 'Resultado operacional', v_receita - v_desc + v_frete - v_cmv - v_despesas + v_outras;
  return query select 100, 'linha', '(±) Resultado financeiro (juros e descontos em liquidações)', v_fin;
  return query select 110, 'linha', '(±) Quebras de caixa', v_quebras;
  return query select 120, 'resultado', 'Resultado líquido do período', v_receita - v_desc + v_frete - v_cmv - v_despesas + v_outras + v_fin + v_quebras;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.saldo_conta(uuid)',
    'public.categoria_sistema(text, public.tipo_titulo)',
    'public.liquidar_parcela(jsonb)',
    'public.criar_titulo(jsonb)',
    'public.cancelar_titulo(uuid, text)',
    'public.estornar_movimento(uuid, text)',
    'public.transferir_entre_contas(jsonb)',
    'public.abrir_caixa(uuid, numeric, text)',
    'public.movimentar_caixa(jsonb)',
    'public.fechar_caixa(uuid, numeric, text)',
    'public.gerar_titulo_venda(uuid)',
    'public.resumo_financeiro(date, date)',
    'public.fluxo_caixa(date, date)',
    'public.dre_gerencial(date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.gerar_titulo_venda(uuid) from authenticated;

-- ---------------------------------------------------------------------
-- Visões
-- ---------------------------------------------------------------------
create view public.vw_contas_financeiras with (security_invoker = true) as
select c.*, public.saldo_conta(c.id) as saldo_atual,
       (select s.id from public.caixa_sessoes s where s.conta_id = c.id and s.status = 'aberto') as sessao_aberta_id
from public.contas_financeiras c;

create view public.vw_parcelas with (security_invoker = true) as
select p.*, p.valor - p.valor_pago as valor_aberto,
       case when p.status in ('aberta', 'parcial') and p.vencimento < current_date then current_date - p.vencimento else 0 end as dias_atraso,
       t.numero as titulo_numero, t.tipo, t.descricao, t.cliente_id, t.fornecedor_id, t.categoria_id, t.centro_custo_id,
       t.documento_tipo, t.documento_id, t.competencia, t.status as titulo_status, t.valor_total as titulo_valor,
       (select count(*) from public.titulo_parcelas x where x.titulo_id = t.id) as total_parcelas,
       coalesce(cl.nome, f.nome_fantasia, f.razao_social) as pessoa_nome,
       cat.nome as categoria_nome, cc.nome as centro_custo_nome
from public.titulo_parcelas p
join public.titulos t on t.id = p.titulo_id
left join public.clientes cl on cl.id = t.cliente_id
left join public.fornecedores f on f.id = t.fornecedor_id
left join public.categorias_financeiras cat on cat.id = t.categoria_id
left join public.centros_custo cc on cc.id = t.centro_custo_id;

create view public.vw_movimentos_financeiros with (security_invoker = true) as
select m.*, c.nome as conta_nome, c.tipo as conta_tipo, cat.nome as categoria_nome,
       t.numero as titulo_numero, p.numero as parcela_numero, s.numero as sessao_numero,
       exists (select 1 from public.movimentos_financeiros e where e.estorno_de = m.id) as estornado
from public.movimentos_financeiros m
join public.contas_financeiras c on c.id = m.conta_id
left join public.categorias_financeiras cat on cat.id = m.categoria_id
left join public.titulos t on t.id = m.titulo_id
left join public.titulo_parcelas p on p.id = m.parcela_id
left join public.caixa_sessoes s on s.id = m.caixa_sessao_id;

-- ---------------------------------------------------------------------
-- Carimbos, auditoria e RLS
-- ---------------------------------------------------------------------
create trigger trg_carimbo before insert or update on public.contas_financeiras for each row execute function public.fn_carimbo();
create trigger trg_carimbo before insert or update on public.titulos for each row execute function public.fn_carimbo();
do $$
declare t text;
begin
  foreach t in array array['parametros_financeiros', 'contas_financeiras', 'categorias_financeiras', 'centros_custo',
                           'titulos', 'titulo_parcelas', 'caixa_sessoes'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

alter table public.parametros_financeiros enable row level security;
alter table public.contas_financeiras enable row level security;
alter table public.categorias_financeiras enable row level security;
alter table public.centros_custo enable row level security;
alter table public.titulos enable row level security;
alter table public.titulo_parcelas enable row level security;
alter table public.caixa_sessoes enable row level security;
alter table public.movimentos_financeiros enable row level security;

create or replace function public.pode_ler_financeiro()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.tem_permissao('financeiro', 'ler') or public.tem_permissao('contas', 'ler') or public.tem_permissao('caixa', 'ler');
$$;
grant execute on function public.pode_ler_financeiro() to authenticated;

create policy parametros_fin_select on public.parametros_financeiros for select to authenticated using (public.pode_ler_financeiro());
create policy parametros_fin_update on public.parametros_financeiros for update to authenticated
  using (public.tem_permissao('financeiro', 'editar')) with check (public.tem_permissao('financeiro', 'editar'));

create policy contas_fin_select on public.contas_financeiras for select to authenticated using (public.pode_ler_financeiro());
create policy contas_fin_insert on public.contas_financeiras for insert to authenticated with check (public.tem_permissao('financeiro', 'criar'));
create policy contas_fin_update on public.contas_financeiras for update to authenticated
  using (public.tem_permissao('financeiro', 'editar')) with check (public.tem_permissao('financeiro', 'editar'));

create policy categorias_fin_select on public.categorias_financeiras for select to authenticated using (public.pode_ler_financeiro());
create policy categorias_fin_insert on public.categorias_financeiras for insert to authenticated with check (public.tem_permissao('financeiro', 'criar') and not sistema);
create policy categorias_fin_update on public.categorias_financeiras for update to authenticated
  using (public.tem_permissao('financeiro', 'editar') and not sistema) with check (public.tem_permissao('financeiro', 'editar') and not sistema);

create policy centros_select on public.centros_custo for select to authenticated using (public.pode_ler_financeiro());
create policy centros_insert on public.centros_custo for insert to authenticated with check (public.tem_permissao('financeiro', 'criar'));
create policy centros_update on public.centros_custo for update to authenticated
  using (public.tem_permissao('financeiro', 'editar')) with check (public.tem_permissao('financeiro', 'editar'));

create policy titulos_select on public.titulos for select to authenticated using (public.pode_ler_financeiro());
create policy parcelas_select on public.titulo_parcelas for select to authenticated using (public.pode_ler_financeiro());
create policy sessoes_select on public.caixa_sessoes for select to authenticated using (public.pode_ler_financeiro());
create policy movimentos_fin_select on public.movimentos_financeiros for select to authenticated using (public.pode_ler_financeiro());

-- ---------------------------------------------------------------------
-- Dados de referência (plano de contas gerencial — editável)
-- ---------------------------------------------------------------------
insert into public.categorias_financeiras (nome, tipo, grupo_dre, sistema) values
  ('Vendas de mercadorias', 'receber', 'receita_vendas', true),
  ('Outras receitas', 'receber', 'outras_receitas', false),
  ('Receitas financeiras', 'receber', 'receitas_financeiras', false),
  ('Compras de mercadorias', 'pagar', 'estoque', true),
  ('Quebra de caixa', 'pagar', 'nao_operacional', true),
  ('Fretes sobre compras', 'pagar', 'estoque', false),
  ('Salários e encargos', 'pagar', 'despesas_pessoal', false),
  ('Pró-labore', 'pagar', 'despesas_pessoal', false),
  ('Aluguel', 'pagar', 'despesas_ocupacao', false),
  ('Energia, água e telefone', 'pagar', 'despesas_ocupacao', false),
  ('Comissões de vendedores', 'pagar', 'despesas_vendas', false),
  ('Marketing e publicidade', 'pagar', 'despesas_vendas', false),
  ('Combustível e manutenção de veículos', 'pagar', 'despesas_vendas', false),
  ('Material de expediente e limpeza', 'pagar', 'despesas_administrativas', false),
  ('Serviços de terceiros (contabilidade, TI)', 'pagar', 'despesas_administrativas', false),
  ('Tarifas bancárias e taxas de cartão', 'pagar', 'despesas_financeiras', false),
  ('Impostos e taxas', 'pagar', 'impostos', false),
  ('Outras despesas', 'pagar', 'despesas_administrativas', false);

insert into public.centros_custo (nome) values ('Loja'), ('Administrativo'), ('Logística e entregas');
insert into public.contas_financeiras (nome, tipo) values ('Caixa da loja', 'caixa');
