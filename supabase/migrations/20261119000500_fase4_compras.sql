-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 4: fornecedores, compras e recebimentos
--
-- Fluxo: Solicitação → Cotação → Pedido de compra → Aprovação →
--        Recebimento (conferência) → Confirmação → Entrada no estoque
--
-- Princípios:
--  * Estoque só é atualizado na CONFIRMAÇÃO do recebimento (parcial ou total).
--  * Recebimento nunca excede o saldo pendente do pedido.
--  * Entrada via núcleo _movimentar (idempotente, auditável, lote obrigatório p/ revestimento).
--  * Custo médio ponderado do produto atualizado a cada recebimento.
--  * Condições de pagamento do pedido ficam prontas para gerar Contas a Pagar (Fase 5).
-- =====================================================================

create type public.status_solicitacao_compra as enum ('pendente', 'em_cotacao', 'em_pedido', 'atendida', 'cancelada');
create type public.status_cotacao as enum ('aberta', 'finalizada', 'cancelada');
create type public.status_pedido_compra as enum ('rascunho', 'aprovado', 'parcialmente_recebido', 'recebido', 'encerrado', 'cancelado');
create type public.status_recebimento as enum ('em_conferencia', 'confirmado', 'cancelado');

-- ---------------------------------------------------------------------
-- Fornecedores: contatos e produtos fornecidos
-- ---------------------------------------------------------------------
create table public.fornecedor_contatos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  cargo text,
  telefone text check (telefone is null or telefone ~ '^\d{10,11}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\d{10,13}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  principal boolean not null default false
);
create index fornecedor_contatos_forn_idx on public.fornecedor_contatos(fornecedor_id);
create unique index fornecedor_contatos_principal_uk on public.fornecedor_contatos(fornecedor_id) where principal;

create table public.produto_fornecedores (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  codigo_fornecedor text,
  ultimo_custo numeric(14,4) check (ultimo_custo is null or ultimo_custo >= 0),
  prazo_entrega_dias int check (prazo_entrega_dias is null or prazo_entrega_dias >= 0),
  ultima_compra_em timestamptz,
  observacao text,
  primary key (produto_id, fornecedor_id)
);
create index produto_fornecedores_forn_idx on public.produto_fornecedores(fornecedor_id);

-- validações adicionais em fornecedores (Fase 1 criou a estrutura base)
alter table public.fornecedores
  add constraint fornecedores_email_valido check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint fornecedores_telefone_valido check (telefone is null or telefone ~ '^\d{10,11}$');
create index if not exists fornecedores_razao_trgm on public.fornecedores using gin (razao_social extensions.gin_trgm_ops);

create or replace function public.salvar_fornecedor(p jsonb, p_contatos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  if (select count(*) from jsonb_array_elements(p_contatos) c where coalesce((c ->> 'principal')::boolean, false)) > 1 then
    raise exception 'Apenas um contato pode ser o principal' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.fornecedores (razao_social, nome_fantasia, cnpj, inscricao_estadual, telefone, whatsapp, email,
      contato_nome, cep, logradouro, numero, complemento, bairro, cidade, uf, condicoes_pagamento, prazo_entrega_dias,
      observacoes, status)
    values (
      trim(p ->> 'razao_social'), nullif(trim(p ->> 'nome_fantasia'), ''), nullif(p ->> 'cnpj', ''),
      nullif(trim(p ->> 'inscricao_estadual'), ''), nullif(p ->> 'telefone', ''), nullif(p ->> 'whatsapp', ''),
      nullif(lower(trim(p ->> 'email')), ''), nullif(trim(p ->> 'contato_nome'), ''), nullif(p ->> 'cep', ''),
      nullif(trim(p ->> 'logradouro'), ''), nullif(trim(p ->> 'numero'), ''), nullif(trim(p ->> 'complemento'), ''),
      nullif(trim(p ->> 'bairro'), ''), nullif(trim(p ->> 'cidade'), ''), nullif(upper(p ->> 'uf'), ''),
      nullif(trim(p ->> 'condicoes_pagamento'), ''), nullif(p ->> 'prazo_entrega_dias', '')::int,
      nullif(trim(p ->> 'observacoes'), ''), coalesce(nullif(p ->> 'status', ''), 'ativo')
    ) returning id into v_id;
  else
    update public.fornecedores set
      razao_social = trim(p ->> 'razao_social'),
      nome_fantasia = nullif(trim(p ->> 'nome_fantasia'), ''),
      cnpj = nullif(p ->> 'cnpj', ''),
      inscricao_estadual = nullif(trim(p ->> 'inscricao_estadual'), ''),
      telefone = nullif(p ->> 'telefone', ''),
      whatsapp = nullif(p ->> 'whatsapp', ''),
      email = nullif(lower(trim(p ->> 'email')), ''),
      contato_nome = nullif(trim(p ->> 'contato_nome'), ''),
      cep = nullif(p ->> 'cep', ''),
      logradouro = nullif(trim(p ->> 'logradouro'), ''),
      numero = nullif(trim(p ->> 'numero'), ''),
      complemento = nullif(trim(p ->> 'complemento'), ''),
      bairro = nullif(trim(p ->> 'bairro'), ''),
      cidade = nullif(trim(p ->> 'cidade'), ''),
      uf = nullif(upper(p ->> 'uf'), ''),
      condicoes_pagamento = nullif(trim(p ->> 'condicoes_pagamento'), ''),
      prazo_entrega_dias = nullif(p ->> 'prazo_entrega_dias', '')::int,
      observacoes = nullif(trim(p ->> 'observacoes'), ''),
      status = coalesce(nullif(p ->> 'status', ''), 'ativo')
    where id = v_id;
    if not found then raise exception 'Fornecedor não encontrado ou sem permissão' using errcode = 'P0002'; end if;
  end if;

  delete from public.fornecedor_contatos where fornecedor_id = v_id;
  insert into public.fornecedor_contatos (fornecedor_id, nome, cargo, telefone, whatsapp, email, principal)
  select v_id, trim(c ->> 'nome'), nullif(trim(c ->> 'cargo'), ''), nullif(c ->> 'telefone', ''),
         nullif(c ->> 'whatsapp', ''), nullif(lower(trim(c ->> 'email')), ''), coalesce((c ->> 'principal')::boolean, false)
  from jsonb_array_elements(p_contatos) c;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Solicitações de compra
-- ---------------------------------------------------------------------
create sequence public.compras_solicitacoes_numero_seq start 1;

create table public.compras_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.compras_solicitacoes_numero_seq'),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(14,4) not null check (quantidade > 0),
  motivo text,
  urgencia text not null default 'normal' check (urgencia in ('baixa', 'normal', 'alta')),
  necessario_ate date,
  status public.status_solicitacao_compra not null default 'pendente',
  pedido_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_nome text default public.nome_usuario_atual(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index compras_solicitacoes_status_idx on public.compras_solicitacoes(status, created_at desc);

create or replace function public.gerar_solicitacoes_estoque_critico()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not (public.tem_permissao('compras', 'criar') or public.tem_permissao('estoque', 'criar')) then
    raise exception 'Sem permissão para solicitar compras' using errcode = '42501';
  end if;
  insert into public.compras_solicitacoes (produto_id, quantidade, motivo, urgencia, created_by_nome)
  select v.produto_id,
         greatest(v.estoque_minimo - v.disponivel, 0) + v.estoque_minimo,  -- repõe ao mínimo + 1 ciclo
         'Estoque abaixo do mínimo (gerado automaticamente)', 'alta', public.nome_usuario_atual()
  from public.vw_estoque_produtos v
  where v.critico and v.status = 'ativo'
    and not exists (select 1 from public.compras_solicitacoes s
                    where s.produto_id = v.produto_id and s.status in ('pendente', 'em_cotacao', 'em_pedido'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Cotações
-- ---------------------------------------------------------------------
create sequence public.compras_cotacoes_numero_seq start 1;

create table public.compras_cotacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.compras_cotacoes_numero_seq'),
  descricao text not null check (length(trim(descricao)) >= 3),
  prazo_resposta date,
  status public.status_cotacao not null default 'aberta',
  observacoes text,
  finalizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.compras_cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.compras_cotacoes(id) on delete cascade,
  ordem int not null,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(14,4) not null check (quantidade > 0),
  solicitacao_id uuid references public.compras_solicitacoes(id) on delete set null,
  fornecedor_vencedor_id uuid references public.fornecedores(id) on delete restrict,
  unique (cotacao_id, ordem)
);

create table public.compras_cotacao_fornecedores (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.compras_cotacoes(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete restrict,
  prazo_entrega_dias int check (prazo_entrega_dias is null or prazo_entrega_dias >= 0),
  frete numeric(14,2) not null default 0 check (frete >= 0),
  condicao_pagamento text,
  observacao text,
  unique (cotacao_id, fornecedor_id)
);

create table public.compras_cotacao_precos (
  cotacao_fornecedor_id uuid not null references public.compras_cotacao_fornecedores(id) on delete cascade,
  cotacao_item_id uuid not null references public.compras_cotacao_itens(id) on delete cascade,
  custo_unitario numeric(14,4) not null check (custo_unitario >= 0),
  primary key (cotacao_fornecedor_id, cotacao_item_id)
);

-- ---------------------------------------------------------------------
-- Pedidos de compra
-- ---------------------------------------------------------------------
create sequence public.compras_pedidos_numero_seq start 1;

create table public.compras_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.compras_pedidos_numero_seq'),
  fornecedor_id uuid not null references public.fornecedores(id) on delete restrict,
  cotacao_id uuid references public.compras_cotacoes(id) on delete restrict,
  status public.status_pedido_compra not null default 'rascunho',
  previsao_entrega date,
  deposito_destino_id uuid references public.depositos(id) on delete restrict,
  -- condições de pagamento (base para Contas a Pagar na Fase 5)
  condicao_pagamento text,
  parcelas int not null default 1 check (parcelas between 1 and 48),
  primeiro_vencimento_dias int not null default 30 check (primeiro_vencimento_dias between 0 and 365),
  intervalo_dias int not null default 30 check (intervalo_dias between 1 and 120),
  subtotal numeric(14,2) not null default 0,
  desconto_total numeric(14,2) not null default 0,
  frete numeric(14,2) not null default 0 check (frete >= 0),
  total numeric(14,2) not null default 0,
  observacoes text,
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id) on delete set null,
  encerrado_em timestamptz,
  motivo_encerramento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index compras_pedidos_fornecedor_idx on public.compras_pedidos(fornecedor_id, created_at desc);
create index compras_pedidos_status_idx on public.compras_pedidos(status, created_at desc);

alter table public.compras_solicitacoes
  add constraint compras_solicitacoes_pedido_fk foreign key (pedido_id) references public.compras_pedidos(id) on delete set null;

create table public.compras_pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.compras_pedidos(id) on delete cascade,
  ordem int not null,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  descricao text not null,
  unidade text not null,
  codigo_fornecedor text,
  quantidade numeric(14,4) not null check (quantidade > 0),
  quantidade_recebida numeric(14,4) not null default 0,
  custo_unitario numeric(14,4) not null check (custo_unitario >= 0),
  desconto_perc numeric(5,2) not null default 0 check (desconto_perc between 0 and 100),
  valor_bruto numeric(14,2) not null,
  valor_desconto numeric(14,2) not null,
  valor_total numeric(14,2) not null,
  solicitacao_id uuid references public.compras_solicitacoes(id) on delete set null,
  constraint pedido_item_recebido check (quantidade_recebida >= 0 and quantidade_recebida <= quantidade)
);
create index compras_pedido_itens_pedido_idx on public.compras_pedido_itens(pedido_id, ordem);
create index compras_pedido_itens_produto_idx on public.compras_pedido_itens(produto_id);

-- ---------------------------------------------------------------------
-- Recebimentos
-- ---------------------------------------------------------------------
create sequence public.compras_recebimentos_numero_seq start 1;

create table public.compras_recebimentos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.compras_recebimentos_numero_seq'),
  pedido_id uuid not null references public.compras_pedidos(id) on delete restrict,
  status public.status_recebimento not null default 'em_conferencia',
  nota_fiscal text,            -- referência da NF do fornecedor (não é emissão fiscal)
  data_recebimento date not null default current_date,
  deposito_id uuid not null references public.depositos(id) on delete restrict,
  observacoes text,
  conferido_por_nome text,
  confirmado_em timestamptz,
  confirmado_por uuid references auth.users(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index compras_recebimentos_pedido_idx on public.compras_recebimentos(pedido_id);

create table public.compras_recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references public.compras_recebimentos(id) on delete cascade,
  pedido_item_id uuid not null references public.compras_pedido_itens(id) on delete restrict,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(14,4) not null check (quantidade > 0),
  lote_id uuid references public.lotes(id) on delete restrict,
  lote_codigo text,           -- lote novo informado na conferência (criado na confirmação)
  tonalidade text,
  calibre text,
  localizacao_id uuid references public.localizacoes(id) on delete restrict,
  divergencia text,
  movimentacao_id uuid references public.estoque_movimentacoes(id) on delete restrict,
  unique (recebimento_id, pedido_item_id, lote_id, lote_codigo, tonalidade, calibre)
);
create index compras_recebimento_itens_rec_idx on public.compras_recebimento_itens(recebimento_id);

-- ---------------------------------------------------------------------
-- Cálculo de item de compra (custo com 4 casas; valores com 2)
-- ---------------------------------------------------------------------
create or replace function public.salvar_pedido_compra(p jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_status public.status_pedido_compra;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua ao menos um item no pedido' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.compras_pedidos (fornecedor_id, previsao_entrega, deposito_destino_id, condicao_pagamento, parcelas,
      primeiro_vencimento_dias, intervalo_dias, frete, observacoes)
    values ((p ->> 'fornecedor_id')::uuid, nullif(p ->> 'previsao_entrega', '')::date,
      nullif(p ->> 'deposito_destino_id', '')::uuid, nullif(trim(p ->> 'condicao_pagamento'), ''),
      coalesce(nullif(p ->> 'parcelas', '')::int, 1), coalesce(nullif(p ->> 'primeiro_vencimento_dias', '')::int, 30),
      coalesce(nullif(p ->> 'intervalo_dias', '')::int, 30), coalesce(nullif(p ->> 'frete', '')::numeric, 0),
      nullif(trim(p ->> 'observacoes'), ''))
    returning id into v_id;
  else
    select status into v_status from public.compras_pedidos where id = v_id for update;
    if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
    if v_status <> 'rascunho' then
      raise exception 'Pedido % não pode ser alterado', v_status using errcode = 'P0001';
    end if;
    update public.compras_pedidos set
      fornecedor_id = (p ->> 'fornecedor_id')::uuid,
      previsao_entrega = nullif(p ->> 'previsao_entrega', '')::date,
      deposito_destino_id = nullif(p ->> 'deposito_destino_id', '')::uuid,
      condicao_pagamento = nullif(trim(p ->> 'condicao_pagamento'), ''),
      parcelas = coalesce(nullif(p ->> 'parcelas', '')::int, 1),
      primeiro_vencimento_dias = coalesce(nullif(p ->> 'primeiro_vencimento_dias', '')::int, 30),
      intervalo_dias = coalesce(nullif(p ->> 'intervalo_dias', '')::int, 30),
      frete = coalesce(nullif(p ->> 'frete', '')::numeric, 0),
      observacoes = nullif(trim(p ->> 'observacoes'), '')
    where id = v_id;
    delete from public.compras_pedido_itens where pedido_id = v_id;
  end if;

  insert into public.compras_pedido_itens (pedido_id, ordem, produto_id, descricao, unidade, codigo_fornecedor, quantidade,
    custo_unitario, desconto_perc, valor_bruto, valor_desconto, valor_total, solicitacao_id)
  select v_id, e.ordem, pr.id, pr.descricao, pr.unidade, nullif(trim(e.item ->> 'codigo_fornecedor'), ''), q.qtd,
         q.custo, q.descp, b.bruto, d.vdesc, b.bruto - d.vdesc, nullif(e.item ->> 'solicitacao_id', '')::uuid
  from jsonb_array_elements(p_itens) with ordinality as e(item, ordem)
  join public.produtos pr on pr.id = (e.item ->> 'produto_id')::uuid
  cross join lateral (select (e.item ->> 'quantidade')::numeric as qtd,
                             (e.item ->> 'custo_unitario')::numeric as custo,
                             coalesce(nullif(e.item ->> 'desconto_perc', '')::numeric, 0) as descp) q
  cross join lateral (select round(q.qtd * q.custo, 2) as bruto) b
  cross join lateral (select round(b.bruto * q.descp / 100, 2) as vdesc) d;

  if (select count(*) from public.compras_pedido_itens where pedido_id = v_id) <> jsonb_array_length(p_itens) then
    raise exception 'Produto inexistente na lista de itens' using errcode = '22023';
  end if;
  perform public.validar_quantidade_produto(produto_id, quantidade) from public.compras_pedido_itens where pedido_id = v_id;

  update public.compras_pedidos c set subtotal = s.bruto, desconto_total = s.vdesc, total = s.bruto - s.vdesc + c.frete
  from (select coalesce(sum(valor_bruto), 0) bruto, coalesce(sum(valor_desconto), 0) vdesc
        from public.compras_pedido_itens where pedido_id = v_id) s
  where c.id = v_id;

  update public.compras_solicitacoes set status = 'em_pedido', pedido_id = v_id
  where id in (select solicitacao_id from public.compras_pedido_itens where pedido_id = v_id and solicitacao_id is not null)
    and status in ('pendente', 'em_cotacao');

  return v_id;
end;
$$;

create or replace function public.aprovar_pedido_compra(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('compras', 'aprovar') then
    raise exception 'Sem permissão para aprovar pedidos de compra' using errcode = '42501';
  end if;
  update public.compras_pedidos set status = 'aprovado', aprovado_em = now(), aprovado_por = auth.uid()
  where id = p_id and status = 'rascunho';
  if not found then raise exception 'Somente pedidos em rascunho podem ser aprovados' using errcode = 'P0001'; end if;
end;
$$;

-- Cancela (nada recebido) ou encerra o saldo pendente (recebimento parcial)
create or replace function public.encerrar_pedido_compra(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ped public.compras_pedidos%rowtype;
begin
  if not public.tem_permissao('compras', 'cancelar') then
    raise exception 'Sem permissão para cancelar pedidos de compra' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into v_ped from public.compras_pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_ped.status not in ('rascunho', 'aprovado', 'parcialmente_recebido') then
    raise exception 'Pedido % não pode ser cancelado', v_ped.status using errcode = 'P0001';
  end if;
  if exists (select 1 from public.compras_recebimentos where pedido_id = p_id and status = 'em_conferencia') then
    raise exception 'Existe recebimento em conferência: confirme ou cancele antes' using errcode = 'P0001';
  end if;

  update public.compras_pedidos set
    status = case when v_ped.status = 'parcialmente_recebido' then 'encerrado'::public.status_pedido_compra else 'cancelado' end,
    encerrado_em = now(), motivo_encerramento = trim(p_motivo)
  where id = p_id;

  update public.compras_solicitacoes set status = 'pendente', pedido_id = null
  where pedido_id = p_id and status = 'em_pedido' and v_ped.status <> 'parcialmente_recebido';
end;
$$;

-- ---------------------------------------------------------------------
-- Cotação: salvar e finalizar (gera pedidos por fornecedor vencedor)
-- ---------------------------------------------------------------------
create or replace function public.salvar_cotacao(p jsonb, p_itens jsonb, p_fornecedores jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_f jsonb;
  v_cf uuid;
begin
  if jsonb_array_length(p_itens) = 0 then raise exception 'Inclua ao menos um item' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.compras_cotacoes (descricao, prazo_resposta, observacoes)
    values (trim(p ->> 'descricao'), nullif(p ->> 'prazo_resposta', '')::date, nullif(trim(p ->> 'observacoes'), ''))
    returning id into v_id;
  else
    if (select status from public.compras_cotacoes where id = v_id for update) <> 'aberta' then
      raise exception 'Cotação encerrada não pode ser alterada' using errcode = 'P0001';
    end if;
    update public.compras_cotacoes set descricao = trim(p ->> 'descricao'),
      prazo_resposta = nullif(p ->> 'prazo_resposta', '')::date, observacoes = nullif(trim(p ->> 'observacoes'), '')
    where id = v_id;
    delete from public.compras_cotacao_fornecedores where cotacao_id = v_id;
    delete from public.compras_cotacao_itens where cotacao_id = v_id;
  end if;

  insert into public.compras_cotacao_itens (cotacao_id, ordem, produto_id, quantidade, solicitacao_id, fornecedor_vencedor_id)
  select v_id, e.ordem, (e.item ->> 'produto_id')::uuid, (e.item ->> 'quantidade')::numeric,
         nullif(e.item ->> 'solicitacao_id', '')::uuid, nullif(e.item ->> 'fornecedor_vencedor_id', '')::uuid
  from jsonb_array_elements(p_itens) with ordinality as e(item, ordem);

  for v_f in select * from jsonb_array_elements(coalesce(p_fornecedores, '[]'::jsonb)) loop
    insert into public.compras_cotacao_fornecedores (cotacao_id, fornecedor_id, prazo_entrega_dias, frete, condicao_pagamento, observacao)
    values (v_id, (v_f ->> 'fornecedor_id')::uuid, nullif(v_f ->> 'prazo_entrega_dias', '')::int,
            coalesce(nullif(v_f ->> 'frete', '')::numeric, 0), nullif(trim(v_f ->> 'condicao_pagamento'), ''),
            nullif(trim(v_f ->> 'observacao'), ''))
    returning id into v_cf;

    -- precos: { "<ordem do item>": "custo" }
    insert into public.compras_cotacao_precos (cotacao_fornecedor_id, cotacao_item_id, custo_unitario)
    select v_cf, i.id, (pr.value #>> '{}')::numeric
    from jsonb_each(coalesce(v_f -> 'precos', '{}'::jsonb)) pr
    join public.compras_cotacao_itens i on i.cotacao_id = v_id and i.ordem = pr.key::int
    where nullif(pr.value #>> '{}', '') is not null;
  end loop;

  update public.compras_solicitacoes set status = 'em_cotacao'
  where id in (select solicitacao_id from public.compras_cotacao_itens where cotacao_id = v_id) and status = 'pendente';

  return v_id;
end;
$$;

create or replace function public.finalizar_cotacao(p_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forn record;
  v_pedido uuid;
  v_n int := 0;
begin
  if not public.tem_permissao('compras', 'criar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if (select status from public.compras_cotacoes where id = p_id for update) <> 'aberta' then
    raise exception 'Cotação já encerrada' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.compras_cotacao_itens where cotacao_id = p_id and fornecedor_vencedor_id is null) then
    raise exception 'Defina o fornecedor vencedor de todos os itens' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.compras_cotacao_itens i
    where i.cotacao_id = p_id and not exists (
      select 1 from public.compras_cotacao_precos pr
      join public.compras_cotacao_fornecedores cf on cf.id = pr.cotacao_fornecedor_id
      where pr.cotacao_item_id = i.id and cf.fornecedor_id = i.fornecedor_vencedor_id)
  ) then
    raise exception 'O fornecedor vencedor precisa ter preço informado para o item' using errcode = 'P0001';
  end if;

  for v_forn in
    select distinct cf.id as cf_id, cf.fornecedor_id, cf.frete, cf.condicao_pagamento, cf.prazo_entrega_dias
    from public.compras_cotacao_itens i
    join public.compras_cotacao_fornecedores cf on cf.cotacao_id = p_id and cf.fornecedor_id = i.fornecedor_vencedor_id
    where i.cotacao_id = p_id
  loop
    insert into public.compras_pedidos (fornecedor_id, cotacao_id, condicao_pagamento, frete, previsao_entrega)
    values (v_forn.fornecedor_id, p_id, v_forn.condicao_pagamento, v_forn.frete,
            current_date + coalesce(v_forn.prazo_entrega_dias, 0))
    returning id into v_pedido;

    insert into public.compras_pedido_itens (pedido_id, ordem, produto_id, descricao, unidade, quantidade, custo_unitario,
      valor_bruto, valor_desconto, valor_total, solicitacao_id, codigo_fornecedor)
    select v_pedido, row_number() over (order by i.ordem), i.produto_id, p.descricao, p.unidade, i.quantidade,
           pr.custo_unitario, round(i.quantidade * pr.custo_unitario, 2), 0, round(i.quantidade * pr.custo_unitario, 2),
           i.solicitacao_id, pf.codigo_fornecedor
    from public.compras_cotacao_itens i
    join public.produtos p on p.id = i.produto_id
    join public.compras_cotacao_precos pr on pr.cotacao_item_id = i.id and pr.cotacao_fornecedor_id = v_forn.cf_id
    left join public.produto_fornecedores pf on pf.produto_id = i.produto_id and pf.fornecedor_id = v_forn.fornecedor_id
    where i.cotacao_id = p_id and i.fornecedor_vencedor_id = v_forn.fornecedor_id;

    update public.compras_pedidos c set subtotal = s.t, total = s.t + c.frete
    from (select sum(valor_total) t from public.compras_pedido_itens where pedido_id = v_pedido) s
    where c.id = v_pedido;

    update public.compras_solicitacoes set status = 'em_pedido', pedido_id = v_pedido
    where id in (select solicitacao_id from public.compras_pedido_itens where pedido_id = v_pedido);

    -- registra último preço cotado
    insert into public.produto_fornecedores (produto_id, fornecedor_id, ultimo_custo, prazo_entrega_dias)
    select i.produto_id, v_forn.fornecedor_id, i.custo_unitario, v_forn.prazo_entrega_dias
    from public.compras_pedido_itens i where i.pedido_id = v_pedido
    on conflict (produto_id, fornecedor_id) do update set
      ultimo_custo = excluded.ultimo_custo,
      prazo_entrega_dias = coalesce(excluded.prazo_entrega_dias, public.produto_fornecedores.prazo_entrega_dias);

    v_n := v_n + 1;
  end loop;

  update public.compras_cotacoes set status = 'finalizada', finalizada_em = now() where id = p_id;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Recebimento: salvar conferência e confirmar (entrada no estoque)
-- ---------------------------------------------------------------------
create or replace function public.salvar_recebimento(p jsonb, p_itens jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_pedido uuid := (p ->> 'pedido_id')::uuid;
  v_status public.status_pedido_compra;
begin
  if not (public.tem_permissao('compras', 'editar') or public.tem_permissao('movimentacoes', 'criar')) then
    raise exception 'Sem permissão para registrar recebimentos' using errcode = '42501';
  end if;
  select status into v_status from public.compras_pedidos where id = v_pedido;
  if v_status not in ('aprovado', 'parcialmente_recebido') then
    raise exception 'O pedido precisa estar aprovado para receber mercadorias' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) = 0 then raise exception 'Informe ao menos um item recebido' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.compras_recebimentos (pedido_id, nota_fiscal, data_recebimento, deposito_id, observacoes, conferido_por_nome)
    values (v_pedido, nullif(trim(p ->> 'nota_fiscal'), ''), coalesce(nullif(p ->> 'data_recebimento', '')::date, current_date),
            (p ->> 'deposito_id')::uuid, nullif(trim(p ->> 'observacoes'), ''), public.nome_usuario_atual())
    returning id into v_id;
  else
    if (select status from public.compras_recebimentos where id = v_id for update) <> 'em_conferencia' then
      raise exception 'Recebimento já encerrado' using errcode = 'P0001';
    end if;
    update public.compras_recebimentos set nota_fiscal = nullif(trim(p ->> 'nota_fiscal'), ''),
      data_recebimento = coalesce(nullif(p ->> 'data_recebimento', '')::date, current_date),
      deposito_id = (p ->> 'deposito_id')::uuid, observacoes = nullif(trim(p ->> 'observacoes'), ''),
      conferido_por_nome = public.nome_usuario_atual()
    where id = v_id;
    delete from public.compras_recebimento_itens where recebimento_id = v_id;
  end if;

  insert into public.compras_recebimento_itens (recebimento_id, pedido_item_id, produto_id, quantidade, lote_id, lote_codigo,
    tonalidade, calibre, localizacao_id, divergencia)
  select v_id, pi.id, pi.produto_id, (x ->> 'quantidade')::numeric, nullif(x ->> 'lote_id', '')::uuid,
         nullif(upper(trim(x ->> 'lote_codigo')), ''), nullif(upper(trim(x ->> 'tonalidade')), ''),
         nullif(upper(trim(x ->> 'calibre')), ''), nullif(x ->> 'localizacao_id', '')::uuid, nullif(trim(x ->> 'divergencia'), '')
  from jsonb_array_elements(p_itens) x
  join public.compras_pedido_itens pi on pi.id = (x ->> 'pedido_item_id')::uuid and pi.pedido_id = v_pedido
  where nullif(x ->> 'quantidade', '')::numeric > 0;

  if not exists (select 1 from public.compras_recebimento_itens where recebimento_id = v_id) then
    raise exception 'Informe a quantidade recebida de ao menos um item' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create or replace function public.confirmar_recebimento(p_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.compras_recebimentos%rowtype;
  v_ped public.compras_pedidos%rowtype;
  v_item record;
  v_lote uuid;
  v_pendente numeric;
  v_custo numeric;
  v_fisico numeric;
  v_custo_atual numeric;
  v_mov uuid;
  v_n int := 0;
  v_rev boolean;
begin
  if not (public.tem_permissao('compras', 'editar') or public.tem_permissao('movimentacoes', 'criar')) then
    raise exception 'Sem permissão para confirmar recebimentos' using errcode = '42501';
  end if;
  select * into v_rec from public.compras_recebimentos where id = p_id for update;
  if not found then raise exception 'Recebimento não encontrado' using errcode = 'P0002'; end if;
  if v_rec.status = 'confirmado' then return 0; end if;  -- idempotente
  if v_rec.status <> 'em_conferencia' then raise exception 'Recebimento cancelado' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_rec.pedido_id for update;
  if v_ped.status not in ('aprovado', 'parcialmente_recebido') then
    raise exception 'Pedido % não aceita recebimentos', v_ped.status using errcode = 'P0001';
  end if;

  for v_item in
    select ri.*, pi.quantidade as qtd_pedida, pi.quantidade_recebida, pi.custo_unitario, pi.desconto_perc, pi.descricao
    from public.compras_recebimento_itens ri
    join public.compras_pedido_itens pi on pi.id = ri.pedido_item_id
    where ri.recebimento_id = p_id
    order by pi.ordem
    for update of pi
  loop
    -- pendente considera itens já confirmados neste mesmo loop
    select quantidade - quantidade_recebida into v_pendente from public.compras_pedido_itens where id = v_item.pedido_item_id;
    if v_item.quantidade > v_pendente then
      raise exception '% : quantidade recebida (%) maior que o pendente do pedido (%)', v_item.descricao, v_item.quantidade, v_pendente
        using errcode = 'P0001';
    end if;

    -- lote: existente ou criado na conferência
    v_lote := v_item.lote_id;
    if v_lote is null and v_item.lote_codigo is not null then
      insert into public.lotes (produto_id, codigo, tonalidade, calibre, fornecedor_id)
      values (v_item.produto_id, v_item.lote_codigo, v_item.tonalidade, v_item.calibre, v_ped.fornecedor_id)
      on conflict on constraint lotes_identidade_uk do nothing
      returning id into v_lote;
      if v_lote is null then
        select id into v_lote from public.lotes
        where produto_id = v_item.produto_id and codigo = v_item.lote_codigo
          and tonalidade is not distinct from v_item.tonalidade and calibre is not distinct from v_item.calibre;
      end if;
      update public.compras_recebimento_itens set lote_id = v_lote where id = v_item.id;
    end if;
    select eh_revestimento into v_rev from public.produtos where id = v_item.produto_id;
    if v_rev and v_lote is null then
      raise exception '%: revestimentos exigem lote, tonalidade e calibre', v_item.descricao using errcode = 'P0001';
    end if;

    -- custo líquido unitário (com desconto do item)
    v_custo := round(v_item.custo_unitario * (1 - v_item.desconto_perc / 100), 4);

    -- custo médio ponderado (antes da entrada)
    select coalesce(sum(quantidade_fisica), 0) into v_fisico from public.estoque_saldos where produto_id = v_item.produto_id;
    select custo into v_custo_atual from public.produtos where id = v_item.produto_id for update;
    update public.produtos set custo = case
        when v_fisico <= 0 or v_custo_atual = 0 then v_custo
        else round((v_fisico * v_custo_atual + v_item.quantidade * v_custo) / (v_fisico + v_item.quantidade), 4)
      end
    where id = v_item.produto_id;

    v_mov := public._movimentar(
      p_tipo => 'entrada',
      p_produto_id => v_item.produto_id,
      p_quantidade => v_item.quantidade,
      p_lote_id => v_lote,
      p_deposito_destino_id => v_rec.deposito_id,
      p_localizacao_destino_id => v_item.localizacao_id,
      p_custo_unitario => v_custo,
      p_motivo => format('Recebimento nº %s do pedido de compra nº %s', v_rec.numero, v_ped.numero),
      p_documento_tipo => 'compra',
      p_documento_id => v_ped.id::text,
      p_chave => 'recebimento-item:' || v_item.id,
      p_observacoes => coalesce('NF ' || v_rec.nota_fiscal, null)
    );
    update public.compras_recebimento_itens set movimentacao_id = v_mov where id = v_item.id;
    update public.compras_pedido_itens set quantidade_recebida = quantidade_recebida + v_item.quantidade
    where id = v_item.pedido_item_id;

    insert into public.produto_fornecedores (produto_id, fornecedor_id, ultimo_custo, ultima_compra_em)
    values (v_item.produto_id, v_ped.fornecedor_id, v_custo, now())
    on conflict (produto_id, fornecedor_id) do update set ultimo_custo = excluded.ultimo_custo, ultima_compra_em = now();

    v_n := v_n + 1;
  end loop;

  update public.compras_pedidos set status = case
      when not exists (select 1 from public.compras_pedido_itens where pedido_id = v_ped.id and quantidade_recebida < quantidade)
        then 'recebido'::public.status_pedido_compra
      else 'parcialmente_recebido'::public.status_pedido_compra end
  where id = v_ped.id;

  update public.compras_solicitacoes set status = 'atendida'
  where pedido_id = v_ped.id and status = 'em_pedido'
    and (select status from public.compras_pedidos where id = v_ped.id) = 'recebido';

  update public.compras_recebimentos set status = 'confirmado', confirmado_em = now(), confirmado_por = auth.uid()
  where id = p_id;
  return v_n;
end;
$$;

create or replace function public.cancelar_recebimento(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.tem_permissao('compras', 'editar') or public.tem_permissao('movimentacoes', 'criar')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  update public.compras_recebimentos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = trim(p_motivo)
  where id = p_id and status = 'em_conferencia';
  if not found then
    raise exception 'Somente recebimentos em conferência podem ser cancelados (confirmados exigem devolução)' using errcode = 'P0001';
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.salvar_fornecedor(jsonb, jsonb)',
    'public.gerar_solicitacoes_estoque_critico()',
    'public.salvar_pedido_compra(jsonb, jsonb)',
    'public.aprovar_pedido_compra(uuid)',
    'public.encerrar_pedido_compra(uuid, text)',
    'public.salvar_cotacao(jsonb, jsonb, jsonb)',
    'public.finalizar_cotacao(uuid)',
    'public.salvar_recebimento(jsonb, jsonb)',
    'public.confirmar_recebimento(uuid)',
    'public.cancelar_recebimento(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Visões
-- ---------------------------------------------------------------------
create view public.vw_compras_pedido_itens with (security_invoker = true) as
select i.*, i.quantidade - i.quantidade_recebida as quantidade_pendente,
       p.sku, p.eh_revestimento, p.m2_por_caixa
from public.compras_pedido_itens i
join public.produtos p on p.id = i.produto_id;

create view public.vw_compras_solicitacoes with (security_invoker = true) as
select s.*, p.sku, p.descricao as produto_descricao, p.unidade, p.m2_por_caixa, p.eh_revestimento,
       cp.numero as pedido_numero
from public.compras_solicitacoes s
join public.produtos p on p.id = s.produto_id
left join public.compras_pedidos cp on cp.id = s.pedido_id;

-- ---------------------------------------------------------------------
-- Carimbos, auditoria e RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['compras_solicitacoes', 'compras_cotacoes', 'compras_pedidos', 'compras_recebimentos'] loop
    execute format('create trigger trg_carimbo before insert or update on public.%I
                    for each row execute function public.fn_carimbo()', t);
  end loop;
  foreach t in array array['fornecedor_contatos', 'produto_fornecedores', 'compras_solicitacoes', 'compras_cotacoes',
                           'compras_cotacao_itens', 'compras_cotacao_fornecedores', 'compras_pedidos', 'compras_pedido_itens',
                           'compras_recebimentos', 'compras_recebimento_itens'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

alter table public.fornecedor_contatos enable row level security;
alter table public.produto_fornecedores enable row level security;
alter table public.compras_solicitacoes enable row level security;
alter table public.compras_cotacoes enable row level security;
alter table public.compras_cotacao_itens enable row level security;
alter table public.compras_cotacao_fornecedores enable row level security;
alter table public.compras_cotacao_precos enable row level security;
alter table public.compras_pedidos enable row level security;
alter table public.compras_pedido_itens enable row level security;
alter table public.compras_recebimentos enable row level security;
alter table public.compras_recebimento_itens enable row level security;

create policy fornecedor_contatos_select on public.fornecedor_contatos for select to authenticated
  using (public.tem_permissao('fornecedores', 'ler'));
create policy fornecedor_contatos_write on public.fornecedor_contatos for all to authenticated
  using (public.tem_permissao('fornecedores', 'editar') or public.tem_permissao('fornecedores', 'criar'))
  with check (public.tem_permissao('fornecedores', 'editar') or public.tem_permissao('fornecedores', 'criar'));

create policy produto_fornecedores_select on public.produto_fornecedores for select to authenticated
  using (public.tem_permissao('fornecedores', 'ler') or public.tem_permissao('produtos', 'ler') or public.tem_permissao('compras', 'ler'));
create policy produto_fornecedores_write on public.produto_fornecedores for all to authenticated
  using (public.tem_permissao('fornecedores', 'editar') or public.tem_permissao('produtos', 'editar'))
  with check (public.tem_permissao('fornecedores', 'editar') or public.tem_permissao('produtos', 'editar'));

create policy compras_solicitacoes_select on public.compras_solicitacoes for select to authenticated
  using (public.tem_permissao('compras', 'ler') or public.tem_permissao('estoque', 'ler'));
create policy compras_solicitacoes_insert on public.compras_solicitacoes for insert to authenticated
  with check (public.tem_permissao('compras', 'criar') or public.tem_permissao('estoque', 'criar'));
create policy compras_solicitacoes_update on public.compras_solicitacoes for update to authenticated
  using (public.tem_permissao('compras', 'editar') and status in ('pendente', 'em_cotacao'))
  with check (public.tem_permissao('compras', 'editar'));

do $$
declare t text;
begin
  foreach t in array array['compras_cotacoes', 'compras_cotacao_itens', 'compras_cotacao_fornecedores', 'compras_cotacao_precos',
                           'compras_pedidos', 'compras_pedido_itens', 'compras_recebimentos', 'compras_recebimento_itens'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.tem_permissao(''compras'', ''ler''))',
                   t || '_select', t);
  end loop;
end $$;

-- Escrita direta apenas em cotações/pedidos abertos (pelas funções security invoker)
create policy compras_cotacoes_write on public.compras_cotacoes for all to authenticated
  using ((public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar')) and status = 'aberta')
  with check (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'));
create policy compras_cotacao_itens_write on public.compras_cotacao_itens for all to authenticated
  using (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'))
  with check (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'));
create policy compras_cotacao_forn_write on public.compras_cotacao_fornecedores for all to authenticated
  using (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'))
  with check (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'));
create policy compras_cotacao_precos_write on public.compras_cotacao_precos for all to authenticated
  using (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'))
  with check (public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'));

create policy compras_pedidos_insert on public.compras_pedidos for insert to authenticated
  with check (public.tem_permissao('compras', 'criar'));
create policy compras_pedidos_update on public.compras_pedidos for update to authenticated
  using (public.tem_permissao('compras', 'editar') and status = 'rascunho')
  with check (public.tem_permissao('compras', 'editar'));
create policy compras_pedido_itens_write on public.compras_pedido_itens for all to authenticated
  using ((public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'))
         and exists (select 1 from public.compras_pedidos p where p.id = pedido_id and p.status = 'rascunho'))
  with check ((public.tem_permissao('compras', 'criar') or public.tem_permissao('compras', 'editar'))
         and exists (select 1 from public.compras_pedidos p where p.id = pedido_id and p.status = 'rascunho'));
-- recebimentos: escrita somente pelas funções (security definer)
