-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 2: estoque
-- Depósitos, localizações, lotes (tonalidade/calibre), saldos, movimentações,
-- reservas e inventários.
--
-- Princípios:
--  * Saldos só mudam por funções do servidor (sem INSERT/UPDATE direto do cliente).
--  * Movimentações são imutáveis (correções por novo lançamento).
--  * Reserva não reduz o físico; a saída com reserva consome a reserva e
--    reduz o físico na MESMA transação.
--  * Estoque nunca fica negativo (CHECK) e operações aceitam chave de idempotência.
--  * Depósito com inventário em andamento fica bloqueado para movimentações.
-- =====================================================================

-- Revestimentos são controlados em m² derivados de caixas (ex.: 3 × 1,7258 = 5,1774).
update public.unidades set casas_decimais = 4 where codigo = 'M2';

create type public.tipo_movimentacao as enum (
  'entrada', 'saida', 'transferencia', 'ajuste_entrada', 'ajuste_saida',
  'devolucao', 'avaria', 'baixa_avaria', 'recuperacao_avaria'
);
create type public.status_reserva as enum ('ativa', 'consumida', 'liberada');
create type public.status_inventario as enum ('em_contagem', 'em_revisao', 'aprovado', 'cancelado');

-- ---------------------------------------------------------------------
-- Depósitos e localizações
-- ---------------------------------------------------------------------
create table public.depositos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z0-9_-]{1,12}$'),
  nome text not null check (length(trim(nome)) >= 2),
  endereco text,
  padrao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create unique index depositos_padrao_uk on public.depositos(padrao) where padrao;

create table public.localizacoes (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.depositos(id) on delete restrict,
  codigo text not null check (codigo ~ '^[A-Z0-9._/-]{1,20}$'),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (deposito_id, codigo),
  unique (id, deposito_id)
);

-- ---------------------------------------------------------------------
-- Lotes (tonalidade e calibre)
-- ---------------------------------------------------------------------
create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  codigo text not null check (length(trim(codigo)) between 1 and 40),
  tonalidade text,
  calibre text,
  data_fabricacao date,
  fornecedor_id uuid references public.fornecedores(id) on delete restrict,
  bloqueado boolean not null default false,
  motivo_bloqueio text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint lotes_identidade_uk unique nulls not distinct (produto_id, codigo, tonalidade, calibre),
  constraint lotes_id_produto_uk unique (id, produto_id),
  constraint lotes_bloqueio_motivo check (not bloqueado or nullif(trim(motivo_bloqueio), '') is not null)
);
create index lotes_produto_idx on public.lotes(produto_id);

-- ---------------------------------------------------------------------
-- Saldos (físico, reservado, avariado; disponível é calculado)
-- ---------------------------------------------------------------------
create table public.estoque_saldos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  lote_id uuid,
  deposito_id uuid not null references public.depositos(id) on delete restrict,
  localizacao_id uuid,
  quantidade_fisica numeric(14,4) not null default 0 check (quantidade_fisica >= 0),
  quantidade_reservada numeric(14,4) not null default 0 check (quantidade_reservada >= 0),
  quantidade_avariada numeric(14,4) not null default 0 check (quantidade_avariada >= 0),
  quantidade_disponivel numeric(14,4)
    generated always as (quantidade_fisica - quantidade_reservada - quantidade_avariada) stored,
  updated_at timestamptz not null default now(),
  constraint saldo_consistente check (quantidade_reservada + quantidade_avariada <= quantidade_fisica),
  constraint saldo_lote_fk foreign key (lote_id, produto_id) references public.lotes(id, produto_id),
  constraint saldo_local_fk foreign key (localizacao_id, deposito_id) references public.localizacoes(id, deposito_id),
  constraint saldo_uk unique nulls not distinct (produto_id, deposito_id, localizacao_id, lote_id)
);
create index estoque_saldos_produto_idx on public.estoque_saldos(produto_id);
create index estoque_saldos_lote_idx on public.estoque_saldos(lote_id);
create index estoque_saldos_deposito_idx on public.estoque_saldos(deposito_id);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create sequence public.estoque_reservas_numero_seq start 1;

create table public.estoque_reservas (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.estoque_reservas_numero_seq'),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  lote_id uuid,
  deposito_id uuid not null references public.depositos(id) on delete restrict,
  localizacao_id uuid,
  quantidade numeric(14,4) not null check (quantidade > 0),
  quantidade_consumida numeric(14,4) not null default 0,
  status public.status_reserva not null default 'ativa',
  cliente_id uuid references public.clientes(id) on delete restrict,
  documento_tipo text not null default 'manual',
  documento_id text,
  validade timestamptz,
  observacoes text,
  chave_idempotencia text unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_nome text,
  encerrada_em timestamptz,
  encerrada_por uuid references auth.users(id) on delete set null,
  motivo_encerramento text,
  constraint reserva_consumo check (quantidade_consumida >= 0 and quantidade_consumida <= quantidade),
  constraint reserva_lote_fk foreign key (lote_id, produto_id) references public.lotes(id, produto_id),
  constraint reserva_local_fk foreign key (localizacao_id, deposito_id) references public.localizacoes(id, deposito_id)
);
create index estoque_reservas_produto_idx on public.estoque_reservas(produto_id, status);
create index estoque_reservas_documento_idx on public.estoque_reservas(documento_tipo, documento_id);

-- ---------------------------------------------------------------------
-- Movimentações (imutáveis)
-- ---------------------------------------------------------------------
create sequence public.estoque_movimentacoes_numero_seq start 1;

create table public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.estoque_movimentacoes_numero_seq'),
  tipo public.tipo_movimentacao not null,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  lote_id uuid,
  deposito_origem_id uuid references public.depositos(id) on delete restrict,
  localizacao_origem_id uuid,
  deposito_destino_id uuid references public.depositos(id) on delete restrict,
  localizacao_destino_id uuid,
  quantidade numeric(14,4) not null check (quantidade > 0),
  custo_unitario numeric(14,4) check (custo_unitario is null or custo_unitario >= 0),
  saldo_origem_apos numeric(14,4),
  saldo_destino_apos numeric(14,4),
  reserva_id uuid references public.estoque_reservas(id) on delete restrict,
  motivo text,
  documento_tipo text not null default 'manual',
  documento_id text,
  observacoes text,
  chave_idempotencia text unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_nome text,
  constraint mov_lote_fk foreign key (lote_id, produto_id) references public.lotes(id, produto_id),
  constraint mov_local_origem_fk foreign key (localizacao_origem_id, deposito_origem_id)
    references public.localizacoes(id, deposito_id),
  constraint mov_local_destino_fk foreign key (localizacao_destino_id, deposito_destino_id)
    references public.localizacoes(id, deposito_id),
  constraint mov_origem_destino check (
    (tipo in ('entrada', 'ajuste_entrada', 'devolucao')
      and deposito_destino_id is not null and deposito_origem_id is null)
    or (tipo in ('saida', 'ajuste_saida', 'avaria', 'baixa_avaria', 'recuperacao_avaria')
      and deposito_origem_id is not null and deposito_destino_id is null)
    or (tipo = 'transferencia'
      and deposito_origem_id is not null and deposito_destino_id is not null
      and (deposito_origem_id, localizacao_origem_id) is distinct from (deposito_destino_id, localizacao_destino_id))
  )
);
create index estoque_mov_produto_idx on public.estoque_movimentacoes(produto_id, created_at desc);
create index estoque_mov_data_idx on public.estoque_movimentacoes(created_at desc);
create index estoque_mov_lote_idx on public.estoque_movimentacoes(lote_id);
create index estoque_mov_documento_idx on public.estoque_movimentacoes(documento_tipo, documento_id);

create or replace function public.fn_bloqueia_alteracao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de % são imutáveis. Faça um novo lançamento de correção.', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger trg_movimentacoes_imutaveis
  before update or delete on public.estoque_movimentacoes
  for each row execute function public.fn_bloqueia_alteracao();

-- ---------------------------------------------------------------------
-- Inventários
-- ---------------------------------------------------------------------
create sequence public.inventarios_numero_seq start 1;

create table public.inventarios (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.inventarios_numero_seq'),
  deposito_id uuid not null references public.depositos(id) on delete restrict,
  categoria_id uuid references public.categorias(id) on delete restrict,
  descricao text not null check (length(trim(descricao)) >= 3),
  status public.status_inventario not null default 'em_contagem',
  enviado_revisao_em timestamptz,
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id) on delete set null,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
-- Apenas um inventário aberto por depósito
create unique index inventarios_deposito_aberto_uk on public.inventarios(deposito_id)
  where status in ('em_contagem', 'em_revisao');

create table public.inventario_itens (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.inventarios(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  lote_id uuid,
  localizacao_id uuid references public.localizacoes(id) on delete restrict,
  quantidade_sistema numeric(14,4) not null default 0,
  contagem_1 numeric(14,4) check (contagem_1 is null or contagem_1 >= 0),
  contado_1_por text,
  contado_1_em timestamptz,
  contagem_2 numeric(14,4) check (contagem_2 is null or contagem_2 >= 0),
  contado_2_por text,
  contado_2_em timestamptz,
  recontagem_solicitada boolean not null default false,
  incluido_na_contagem boolean not null default false,
  ajuste_movimentacao_id uuid references public.estoque_movimentacoes(id) on delete restrict,
  observacao text,
  constraint inv_item_lote_fk foreign key (lote_id, produto_id) references public.lotes(id, produto_id),
  constraint inv_item_uk unique nulls not distinct (inventario_id, produto_id, lote_id, localizacao_id)
);
create index inventario_itens_inv_idx on public.inventario_itens(inventario_id);

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public.deposito_em_inventario(p_deposito uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inventarios
    where deposito_id = p_deposito and status in ('em_contagem', 'em_revisao')
  );
$$;

create or replace function public.pode_ler_estoque()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.tem_permissao('estoque', 'ler') or public.tem_permissao('movimentacoes', 'ler')
      or public.tem_permissao('lotes', 'ler') or public.tem_permissao('inventario', 'ler')
      or public.tem_permissao('vendas', 'ler');
$$;

create or replace function public.nome_usuario_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nome from public.usuarios where id = auth.uid();
$$;

-- Valida quantidade conforme as casas decimais da unidade do produto
create or replace function public.validar_quantidade_produto(p_produto uuid, p_quantidade numeric)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_casas int;
  v_unidade text;
begin
  select u.casas_decimais, u.codigo into v_casas, v_unidade
  from public.produtos p join public.unidades u on u.codigo = p.unidade
  where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero' using errcode = '22023';
  end if;
  if p_quantidade <> round(p_quantidade, v_casas) then
    raise exception 'A unidade % aceita no máximo % casa(s) decimal(is)', v_unidade, v_casas using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Núcleo de movimentação (uso interno — NÃO exposto ao cliente)
-- ---------------------------------------------------------------------
create or replace function public._movimentar(
  p_tipo public.tipo_movimentacao,
  p_produto_id uuid,
  p_quantidade numeric,
  p_lote_id uuid default null,
  p_deposito_origem_id uuid default null,
  p_localizacao_origem_id uuid default null,
  p_deposito_destino_id uuid default null,
  p_localizacao_destino_id uuid default null,
  p_custo_unitario numeric default null,
  p_motivo text default null,
  p_documento_tipo text default 'manual',
  p_documento_id text default null,
  p_reserva_id uuid default null,
  p_chave text default null,
  p_observacoes text default null,
  p_ignorar_bloqueio_inventario boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prod record;
  v_lote record;
  v_saldo public.estoque_saldos%rowtype;
  v_reserva public.estoque_reservas%rowtype;
  v_saldo_origem numeric;
  v_saldo_destino numeric;
  v_sai boolean := p_tipo in ('saida', 'ajuste_saida', 'transferencia', 'avaria', 'baixa_avaria', 'recuperacao_avaria');
  v_entra boolean := p_tipo in ('entrada', 'ajuste_entrada', 'devolucao', 'transferencia');
  v_restante numeric;
  v_constraint text;
begin
  -- Idempotência: mesma chave devolve o lançamento já existente
  if p_chave is not null then
    select id into v_id from public.estoque_movimentacoes where chave_idempotencia = p_chave;
    if found then return v_id; end if;
  end if;

  perform public.validar_quantidade_produto(p_produto_id, p_quantidade);

  if not v_sai then p_deposito_origem_id := null; p_localizacao_origem_id := null; end if;
  if not v_entra then p_deposito_destino_id := null; p_localizacao_destino_id := null; end if;
  if v_sai and p_deposito_origem_id is null then
    raise exception 'Informe o depósito de origem' using errcode = '22023';
  end if;
  if v_entra and p_deposito_destino_id is null then
    raise exception 'Informe o depósito de destino' using errcode = '22023';
  end if;
  if p_reserva_id is not null and p_tipo <> 'saida' then
    raise exception 'Somente saídas podem consumir reservas' using errcode = '22023';
  end if;

  select id, eh_revestimento, status into v_prod from public.produtos where id = p_produto_id;
  if v_prod.eh_revestimento and p_lote_id is null then
    raise exception 'Revestimentos exigem lote (tonalidade e calibre)' using errcode = '22023';
  end if;
  if p_tipo = 'entrada' and v_prod.status <> 'ativo' then
    raise exception 'Produto inativo não pode receber entradas' using errcode = 'P0001';
  end if;

  if p_lote_id is not null then
    select * into v_lote from public.lotes where id = p_lote_id and produto_id = p_produto_id;
    if not found then
      raise exception 'O lote informado não pertence ao produto' using errcode = '22023';
    end if;
    if v_lote.bloqueado and p_tipo = 'saida' and p_reserva_id is null then
      raise exception 'Lote % bloqueado: %', v_lote.codigo, v_lote.motivo_bloqueio using errcode = 'P0001';
    end if;
  end if;

  if p_localizacao_origem_id is not null and not exists (
    select 1 from public.localizacoes where id = p_localizacao_origem_id and deposito_id = p_deposito_origem_id
  ) then
    raise exception 'A localização de origem não pertence ao depósito' using errcode = '22023';
  end if;
  if v_entra then
    if not exists (select 1 from public.depositos where id = p_deposito_destino_id and ativo) then
      raise exception 'Depósito de destino inexistente ou inativo' using errcode = '22023';
    end if;
    if p_localizacao_destino_id is not null and not exists (
      select 1 from public.localizacoes
      where id = p_localizacao_destino_id and deposito_id = p_deposito_destino_id and ativo
    ) then
      raise exception 'Localização de destino inválida ou inativa' using errcode = '22023';
    end if;
  end if;

  if not p_ignorar_bloqueio_inventario and (
       (v_sai and public.deposito_em_inventario(p_deposito_origem_id))
    or (v_entra and public.deposito_em_inventario(p_deposito_destino_id))
  ) then
    raise exception 'Depósito com inventário em andamento: movimentações bloqueadas até a aprovação ou cancelamento'
      using errcode = 'P0001';
  end if;

  begin
    -- ---------------- Origem ----------------
    if v_sai then
      select * into v_saldo from public.estoque_saldos
      where produto_id = p_produto_id
        and deposito_id = p_deposito_origem_id
        and localizacao_id is not distinct from p_localizacao_origem_id
        and lote_id is not distinct from p_lote_id
      for update;
      if not found then
        raise exception 'Não há saldo deste produto/lote no local de origem' using errcode = 'P0001';
      end if;

      if p_reserva_id is not null then
        select * into v_reserva from public.estoque_reservas where id = p_reserva_id for update;
        if not found or v_reserva.status <> 'ativa' then
          raise exception 'Reserva inexistente ou já encerrada' using errcode = 'P0001';
        end if;
        if v_reserva.produto_id <> p_produto_id
           or v_reserva.lote_id is distinct from p_lote_id
           or v_reserva.deposito_id <> p_deposito_origem_id
           or v_reserva.localizacao_id is distinct from p_localizacao_origem_id then
          raise exception 'A saída não corresponde ao produto/lote/local da reserva' using errcode = 'P0001';
        end if;
        v_restante := v_reserva.quantidade - v_reserva.quantidade_consumida;
        if p_quantidade > v_restante then
          raise exception 'Quantidade maior que o saldo da reserva (%)', v_restante using errcode = 'P0001';
        end if;

        update public.estoque_reservas set
          quantidade_consumida = quantidade_consumida + p_quantidade,
          status = case when p_quantidade = v_restante then 'consumida'::public.status_reserva else status end,
          encerrada_em = case when p_quantidade = v_restante then now() else encerrada_em end,
          encerrada_por = case when p_quantidade = v_restante then auth.uid() else encerrada_por end
        where id = p_reserva_id;

        -- Consome a reserva e baixa o físico na mesma transação
        update public.estoque_saldos set
          quantidade_reservada = quantidade_reservada - p_quantidade,
          quantidade_fisica = quantidade_fisica - p_quantidade,
          updated_at = now()
        where id = v_saldo.id
        returning quantidade_fisica into v_saldo_origem;

      elsif p_tipo in ('baixa_avaria', 'recuperacao_avaria') then
        if v_saldo.quantidade_avariada < p_quantidade then
          raise exception 'Quantidade avariada insuficiente (avariado: %)', v_saldo.quantidade_avariada
            using errcode = 'P0001';
        end if;
        update public.estoque_saldos set
          quantidade_avariada = quantidade_avariada - p_quantidade,
          quantidade_fisica = quantidade_fisica - case when p_tipo = 'baixa_avaria' then p_quantidade else 0 end,
          updated_at = now()
        where id = v_saldo.id
        returning quantidade_fisica into v_saldo_origem;

      else
        if v_saldo.quantidade_disponivel < p_quantidade then
          raise exception 'Saldo disponível insuficiente: disponível %, solicitado %',
            v_saldo.quantidade_disponivel, p_quantidade using errcode = 'P0001';
        end if;
        if p_tipo = 'avaria' then
          update public.estoque_saldos set quantidade_avariada = quantidade_avariada + p_quantidade, updated_at = now()
          where id = v_saldo.id returning quantidade_fisica into v_saldo_origem;
        else
          update public.estoque_saldos set quantidade_fisica = quantidade_fisica - p_quantidade, updated_at = now()
          where id = v_saldo.id returning quantidade_fisica into v_saldo_origem;
        end if;
      end if;
    end if;

    -- ---------------- Destino ----------------
    if v_entra then
      insert into public.estoque_saldos (produto_id, lote_id, deposito_id, localizacao_id, quantidade_fisica)
      values (p_produto_id, p_lote_id, p_deposito_destino_id, p_localizacao_destino_id, p_quantidade)
      on conflict on constraint saldo_uk do update
        set quantidade_fisica = public.estoque_saldos.quantidade_fisica + excluded.quantidade_fisica,
            updated_at = now()
      returning quantidade_fisica into v_saldo_destino;
    end if;

    insert into public.estoque_movimentacoes (
      tipo, produto_id, lote_id, deposito_origem_id, localizacao_origem_id, deposito_destino_id,
      localizacao_destino_id, quantidade, custo_unitario, saldo_origem_apos, saldo_destino_apos, reserva_id,
      motivo, documento_tipo, documento_id, observacoes, chave_idempotencia, created_by_nome
    ) values (
      p_tipo, p_produto_id, p_lote_id, p_deposito_origem_id, p_localizacao_origem_id, p_deposito_destino_id,
      p_localizacao_destino_id, p_quantidade, p_custo_unitario, v_saldo_origem, v_saldo_destino, p_reserva_id,
      nullif(trim(p_motivo), ''), coalesce(p_documento_tipo, 'manual'), nullif(trim(p_documento_id), ''),
      nullif(trim(p_observacoes), ''), p_chave, public.nome_usuario_atual()
    )
    returning id into v_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- Requisição concorrente com a mesma chave: tudo acima é desfeito e devolvemos o lançamento existente
      if v_constraint = 'estoque_movimentacoes_chave_idempotencia_key' then
        select id into v_id from public.estoque_movimentacoes where chave_idempotencia = p_chave;
        return v_id;
      end if;
      raise;
  end;

  return v_id;
end;
$$;

revoke execute on function public._movimentar(
  public.tipo_movimentacao, uuid, numeric, uuid, uuid, uuid, uuid, uuid, numeric, text, text, text, uuid, text, text, boolean
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- API pública: movimentação manual
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimentacao(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.tipo_movimentacao := (p ->> 'tipo')::public.tipo_movimentacao;
begin
  if not public.tem_permissao('movimentacoes', 'criar') then
    raise exception 'Sem permissão para registrar movimentações' using errcode = '42501';
  end if;
  if v_tipo in ('ajuste_entrada', 'ajuste_saida', 'avaria', 'baixa_avaria', 'recuperacao_avaria', 'devolucao')
     and nullif(trim(p ->> 'motivo'), '') is null then
    raise exception 'Informe o motivo da movimentação' using errcode = '22023';
  end if;

  return public._movimentar(
    p_tipo => v_tipo,
    p_produto_id => (p ->> 'produto_id')::uuid,
    p_quantidade => (p ->> 'quantidade')::numeric,
    p_lote_id => nullif(p ->> 'lote_id', '')::uuid,
    p_deposito_origem_id => nullif(p ->> 'deposito_origem_id', '')::uuid,
    p_localizacao_origem_id => nullif(p ->> 'localizacao_origem_id', '')::uuid,
    p_deposito_destino_id => nullif(p ->> 'deposito_destino_id', '')::uuid,
    p_localizacao_destino_id => nullif(p ->> 'localizacao_destino_id', '')::uuid,
    p_custo_unitario => nullif(p ->> 'custo_unitario', '')::numeric,
    p_motivo => p ->> 'motivo',
    p_documento_tipo => 'manual',            -- documentos de sistema (venda, compra, inventário) não podem ser forjados
    p_documento_id => p ->> 'documento',
    p_reserva_id => nullif(p ->> 'reserva_id', '')::uuid,
    p_chave => nullif(p ->> 'chave_idempotencia', ''),
    p_observacoes => p ->> 'observacoes'
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create or replace function public.reservar_estoque(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_chave text := nullif(p ->> 'chave_idempotencia', '');
  v_produto uuid := (p ->> 'produto_id')::uuid;
  v_lote uuid := nullif(p ->> 'lote_id', '')::uuid;
  v_deposito uuid := (p ->> 'deposito_id')::uuid;
  v_local uuid := nullif(p ->> 'localizacao_id', '')::uuid;
  v_qtd numeric := (p ->> 'quantidade')::numeric;
  v_saldo public.estoque_saldos%rowtype;
  v_bloq boolean;
begin
  if not (public.tem_permissao('estoque', 'criar') or public.tem_permissao('vendas', 'criar')) then
    raise exception 'Sem permissão para reservar estoque' using errcode = '42501';
  end if;
  if v_chave is not null then
    select id into v_id from public.estoque_reservas where chave_idempotencia = v_chave;
    if found then return v_id; end if;
  end if;

  perform public.validar_quantidade_produto(v_produto, v_qtd);

  if v_lote is not null then
    select bloqueado into v_bloq from public.lotes where id = v_lote and produto_id = v_produto;
    if not found then raise exception 'O lote informado não pertence ao produto' using errcode = '22023'; end if;
    if v_bloq then raise exception 'Lote bloqueado não pode ser reservado' using errcode = 'P0001'; end if;
  end if;

  select * into v_saldo from public.estoque_saldos
  where produto_id = v_produto and deposito_id = v_deposito
    and localizacao_id is not distinct from v_local and lote_id is not distinct from v_lote
  for update;
  if not found or v_saldo.quantidade_disponivel < v_qtd then
    raise exception 'Saldo disponível insuficiente para reservar (disponível: %)',
      coalesce(v_saldo.quantidade_disponivel, 0) using errcode = 'P0001';
  end if;

  update public.estoque_saldos set quantidade_reservada = quantidade_reservada + v_qtd, updated_at = now()
  where id = v_saldo.id;

  insert into public.estoque_reservas (
    produto_id, lote_id, deposito_id, localizacao_id, quantidade, cliente_id, documento_tipo, documento_id,
    validade, observacoes, chave_idempotencia, created_by_nome
  ) values (
    v_produto, v_lote, v_deposito, v_local, v_qtd, nullif(p ->> 'cliente_id', '')::uuid,
    coalesce(nullif(p ->> 'documento_tipo', ''), 'manual'), nullif(trim(p ->> 'documento_id'), ''),
    nullif(p ->> 'validade', '')::timestamptz, nullif(trim(p ->> 'observacoes'), ''), v_chave,
    public.nome_usuario_atual()
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    select id into v_id from public.estoque_reservas where chave_idempotencia = v_chave;
    if v_id is not null then return v_id; end if;
    raise;
end;
$$;

create or replace function public.liberar_reserva(p_reserva_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.estoque_reservas%rowtype;
  v_restante numeric;
begin
  if not (public.tem_permissao('estoque', 'editar') or public.tem_permissao('vendas', 'editar')) then
    raise exception 'Sem permissão para liberar reservas' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo da liberação' using errcode = '22023';
  end if;

  select * into v_res from public.estoque_reservas where id = p_reserva_id for update;
  if not found then raise exception 'Reserva não encontrada' using errcode = 'P0002'; end if;
  if v_res.status <> 'ativa' then
    raise exception 'A reserva já está encerrada' using errcode = 'P0001';
  end if;

  v_restante := v_res.quantidade - v_res.quantidade_consumida;
  update public.estoque_saldos set quantidade_reservada = quantidade_reservada - v_restante, updated_at = now()
  where produto_id = v_res.produto_id and deposito_id = v_res.deposito_id
    and localizacao_id is not distinct from v_res.localizacao_id and lote_id is not distinct from v_res.lote_id;

  update public.estoque_reservas set
    status = 'liberada', encerrada_em = now(), encerrada_por = auth.uid(), motivo_encerramento = trim(p_motivo)
  where id = p_reserva_id;
end;
$$;

-- Lotes que atendem a quantidade SEM misturar lotes (usado na venda/separação)
create or replace function public.lotes_disponiveis(
  p_produto uuid, p_deposito uuid default null, p_quantidade numeric default null
)
returns table (
  lote_id uuid, codigo text, tonalidade text, calibre text, disponivel numeric, atende_sozinho boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.codigo, l.tonalidade, l.calibre, sum(s.quantidade_disponivel),
         sum(s.quantidade_disponivel) >= coalesce(p_quantidade, 0)
  from public.estoque_saldos s
  join public.lotes l on l.id = s.lote_id
  where s.produto_id = p_produto
    and (p_deposito is null or s.deposito_id = p_deposito)
    and not l.bloqueado
  group by l.id
  having sum(s.quantidade_disponivel) > 0
  -- primeiro os lotes que atendem sozinhos, do menor para o maior (reduz sobras de lote)
  order by 6 desc, 5 asc;
$$;

-- ---------------------------------------------------------------------
-- Inventário
-- ---------------------------------------------------------------------
create or replace function public.abrir_inventario(p_deposito uuid, p_descricao text, p_categoria uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.tem_permissao('inventario', 'criar') then
    raise exception 'Sem permissão para abrir inventário' using errcode = '42501';
  end if;
  if public.deposito_em_inventario(p_deposito) then
    raise exception 'Já existe inventário em andamento neste depósito' using errcode = 'P0001';
  end if;

  insert into public.inventarios (deposito_id, categoria_id, descricao)
  values (p_deposito, p_categoria, trim(p_descricao))
  returning id into v_id;

  -- Fotografia do saldo físico no momento da abertura (o depósito fica bloqueado)
  insert into public.inventario_itens (inventario_id, produto_id, lote_id, localizacao_id, quantidade_sistema)
  select v_id, s.produto_id, s.lote_id, s.localizacao_id, s.quantidade_fisica
  from public.estoque_saldos s
  join public.produtos pr on pr.id = s.produto_id
  where s.deposito_id = p_deposito
    and (p_categoria is null or pr.categoria_id = p_categoria)
    and (s.quantidade_fisica > 0 or s.quantidade_reservada > 0);

  return v_id;
end;
$$;

create or replace function public.registrar_contagem(p_item uuid, p_quantidade numeric, p_observacao text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventario_itens%rowtype;
  v_status public.status_inventario;
begin
  if not public.tem_permissao('inventario', 'editar') then
    raise exception 'Sem permissão para registrar contagens' using errcode = '42501';
  end if;
  select * into v_item from public.inventario_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  select status into v_status from public.inventarios where id = v_item.inventario_id;
  if v_status <> 'em_contagem' then
    raise exception 'O inventário não está em contagem' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade contada inválida' using errcode = '22023';
  end if;
  if p_quantidade > 0 then perform public.validar_quantidade_produto(v_item.produto_id, p_quantidade); end if;

  if v_item.recontagem_solicitada or v_item.contagem_2 is not null then
    update public.inventario_itens set
      contagem_2 = p_quantidade, contado_2_por = public.nome_usuario_atual(), contado_2_em = now(),
      recontagem_solicitada = false, observacao = coalesce(nullif(trim(p_observacao), ''), observacao)
    where id = p_item;
  else
    update public.inventario_itens set
      contagem_1 = p_quantidade, contado_1_por = public.nome_usuario_atual(), contado_1_em = now(),
      observacao = coalesce(nullif(trim(p_observacao), ''), observacao)
    where id = p_item;
  end if;
end;
$$;

-- Item encontrado fisicamente mas sem saldo no sistema
create or replace function public.adicionar_item_inventario(
  p_inventario uuid, p_produto uuid, p_lote uuid, p_localizacao uuid, p_quantidade numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.inventarios%rowtype;
  v_id uuid;
  v_rev boolean;
begin
  if not public.tem_permissao('inventario', 'editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into v_inv from public.inventarios where id = p_inventario;
  if not found or v_inv.status <> 'em_contagem' then
    raise exception 'O inventário não está em contagem' using errcode = 'P0001';
  end if;
  select eh_revestimento into v_rev from public.produtos where id = p_produto;
  if v_rev and p_lote is null then
    raise exception 'Revestimentos exigem lote' using errcode = '22023';
  end if;
  if p_localizacao is not null and not exists (
    select 1 from public.localizacoes where id = p_localizacao and deposito_id = v_inv.deposito_id
  ) then
    raise exception 'Localização não pertence ao depósito do inventário' using errcode = '22023';
  end if;
  perform public.validar_quantidade_produto(p_produto, p_quantidade);

  insert into public.inventario_itens (
    inventario_id, produto_id, lote_id, localizacao_id, quantidade_sistema, contagem_1, contado_1_por,
    contado_1_em, incluido_na_contagem
  )
  select p_inventario, p_produto, p_lote, p_localizacao,
         coalesce((select s.quantidade_fisica from public.estoque_saldos s
                   where s.produto_id = p_produto and s.deposito_id = v_inv.deposito_id
                     and s.lote_id is not distinct from p_lote
                     and s.localizacao_id is not distinct from p_localizacao), 0),
         p_quantidade, public.nome_usuario_atual(), now(), true
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Este produto/lote/localização já está na lista do inventário' using errcode = '23505';
end;
$$;

create or replace function public.solicitar_recontagem(p_inventario uuid, p_itens uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('inventario', 'editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inventarios where id = p_inventario and status in ('em_contagem', 'em_revisao')) then
    raise exception 'Inventário encerrado' using errcode = 'P0001';
  end if;
  update public.inventario_itens set recontagem_solicitada = true, contagem_2 = null, contado_2_por = null, contado_2_em = null
  where inventario_id = p_inventario and id = any (p_itens);
  update public.inventarios set status = 'em_contagem' where id = p_inventario;
end;
$$;

create or replace function public.enviar_inventario_revisao(p_inventario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendentes int;
begin
  if not public.tem_permissao('inventario', 'editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select count(*) into v_pendentes from public.inventario_itens
  where inventario_id = p_inventario and (contagem_1 is null or recontagem_solicitada);
  if v_pendentes > 0 then
    raise exception 'Existem % item(ns) sem contagem ou aguardando recontagem', v_pendentes using errcode = 'P0001';
  end if;
  update public.inventarios set status = 'em_revisao', enviado_revisao_em = now()
  where id = p_inventario and status = 'em_contagem';
  if not found then raise exception 'O inventário não está em contagem' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.aprovar_inventario(p_inventario uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.inventarios%rowtype;
  v_item record;
  v_final numeric;
  v_dif numeric;
  v_mov uuid;
  v_ajustes int := 0;
begin
  if not public.tem_permissao('inventario', 'aprovar') then
    raise exception 'Sem permissão para aprovar inventários' using errcode = '42501';
  end if;
  select * into v_inv from public.inventarios where id = p_inventario for update;
  if not found then raise exception 'Inventário não encontrado' using errcode = 'P0002'; end if;
  if v_inv.status <> 'em_revisao' then
    raise exception 'Somente inventários em revisão podem ser aprovados' using errcode = 'P0001';
  end if;

  for v_item in select * from public.inventario_itens where inventario_id = p_inventario loop
    v_final := coalesce(v_item.contagem_2, v_item.contagem_1);
    v_dif := v_final - v_item.quantidade_sistema;
    if v_dif = 0 then continue; end if;

    v_mov := public._movimentar(
      p_tipo => case when v_dif > 0 then 'ajuste_entrada'::public.tipo_movimentacao else 'ajuste_saida'::public.tipo_movimentacao end,
      p_produto_id => v_item.produto_id,
      p_quantidade => abs(v_dif),
      p_lote_id => v_item.lote_id,
      p_deposito_origem_id => case when v_dif < 0 then v_inv.deposito_id end,
      p_localizacao_origem_id => case when v_dif < 0 then v_item.localizacao_id end,
      p_deposito_destino_id => case when v_dif > 0 then v_inv.deposito_id end,
      p_localizacao_destino_id => case when v_dif > 0 then v_item.localizacao_id end,
      p_motivo => format('Ajuste do inventário nº %s', v_inv.numero),
      p_documento_tipo => 'inventario',
      p_documento_id => p_inventario::text,
      p_chave => 'inventario:' || v_item.id,
      p_ignorar_bloqueio_inventario => true
    );
    update public.inventario_itens set ajuste_movimentacao_id = v_mov where id = v_item.id;
    v_ajustes := v_ajustes + 1;
  end loop;

  update public.inventarios set status = 'aprovado', aprovado_em = now(), aprovado_por = auth.uid()
  where id = p_inventario;
  return v_ajustes;
end;
$$;

create or replace function public.cancelar_inventario(p_inventario uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('inventario', 'cancelar') then
    raise exception 'Sem permissão para cancelar inventários' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo do cancelamento' using errcode = '22023';
  end if;
  update public.inventarios set
    status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = trim(p_motivo)
  where id = p_inventario and status in ('em_contagem', 'em_revisao');
  if not found then raise exception 'Inventário inexistente ou já encerrado' using errcode = 'P0001'; end if;
end;
$$;

-- Permissões de execução das funções públicas
do $$
declare f text;
begin
  foreach f in array array[
    'public.deposito_em_inventario(uuid)',
    'public.pode_ler_estoque()',
    'public.nome_usuario_atual()',
    'public.validar_quantidade_produto(uuid, numeric)',
    'public.registrar_movimentacao(jsonb)',
    'public.reservar_estoque(jsonb)',
    'public.liberar_reserva(uuid, text)',
    'public.lotes_disponiveis(uuid, uuid, numeric)',
    'public.abrir_inventario(uuid, text, uuid)',
    'public.registrar_contagem(uuid, numeric, text)',
    'public.adicionar_item_inventario(uuid, uuid, uuid, uuid, numeric)',
    'public.solicitar_recontagem(uuid, uuid[])',
    'public.enviar_inventario_revisao(uuid)',
    'public.aprovar_inventario(uuid)',
    'public.cancelar_inventario(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Visões (security_invoker: respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------
create view public.vw_estoque_saldos with (security_invoker = true) as
select
  s.id, s.produto_id, s.lote_id, s.deposito_id, s.localizacao_id,
  s.quantidade_fisica, s.quantidade_reservada, s.quantidade_avariada, s.quantidade_disponivel, s.updated_at,
  p.sku, p.descricao as produto_descricao, p.unidade, p.eh_revestimento, p.m2_por_caixa, p.estoque_minimo,
  p.categoria_id, p.status as produto_status,
  l.codigo as lote_codigo, l.tonalidade, l.calibre, coalesce(l.bloqueado, false) as lote_bloqueado,
  d.codigo as deposito_codigo, d.nome as deposito_nome,
  lc.codigo as localizacao_codigo
from public.estoque_saldos s
join public.produtos p on p.id = s.produto_id
join public.depositos d on d.id = s.deposito_id
left join public.lotes l on l.id = s.lote_id
left join public.localizacoes lc on lc.id = s.localizacao_id;

create view public.vw_estoque_produtos with (security_invoker = true) as
select
  p.id as produto_id, p.sku, p.descricao, p.unidade, p.eh_revestimento, p.m2_por_caixa, p.estoque_minimo,
  p.categoria_id, p.status,
  coalesce(sum(s.quantidade_fisica), 0) as fisico,
  coalesce(sum(s.quantidade_reservada), 0) as reservado,
  coalesce(sum(s.quantidade_avariada), 0) as avariado,
  coalesce(sum(s.quantidade_disponivel), 0) as disponivel,
  (p.estoque_minimo > 0 and coalesce(sum(s.quantidade_disponivel), 0) < p.estoque_minimo) as critico,
  count(distinct s.lote_id) filter (where s.quantidade_fisica > 0) as lotes_com_saldo
from public.produtos p
left join public.estoque_saldos s on s.produto_id = p.id
group by p.id;

create view public.vw_lotes with (security_invoker = true) as
select
  l.id, l.produto_id, l.codigo, l.tonalidade, l.calibre, l.data_fabricacao, l.fornecedor_id,
  l.bloqueado, l.motivo_bloqueio, l.observacoes, l.created_at,
  p.sku, p.descricao as produto_descricao, p.unidade, p.m2_por_caixa,
  coalesce(sum(s.quantidade_fisica), 0) as fisico,
  coalesce(sum(s.quantidade_reservada), 0) as reservado,
  coalesce(sum(s.quantidade_avariada), 0) as avariado,
  coalesce(sum(s.quantidade_disponivel), 0) as disponivel
from public.lotes l
join public.produtos p on p.id = l.produto_id
left join public.estoque_saldos s on s.lote_id = l.id
group by l.id, p.id;

create view public.vw_estoque_movimentacoes with (security_invoker = true) as
select
  m.*,
  p.sku, p.descricao as produto_descricao, p.unidade, p.m2_por_caixa,
  l.codigo as lote_codigo, l.tonalidade, l.calibre,
  dorig.nome as deposito_origem_nome, lorig.codigo as localizacao_origem_codigo,
  ddest.nome as deposito_destino_nome, ldest.codigo as localizacao_destino_codigo
from public.estoque_movimentacoes m
join public.produtos p on p.id = m.produto_id
left join public.lotes l on l.id = m.lote_id
left join public.depositos dorig on dorig.id = m.deposito_origem_id
left join public.localizacoes lorig on lorig.id = m.localizacao_origem_id
left join public.depositos ddest on ddest.id = m.deposito_destino_id
left join public.localizacoes ldest on ldest.id = m.localizacao_destino_id;

create view public.vw_estoque_reservas with (security_invoker = true) as
select
  r.*, r.quantidade - r.quantidade_consumida as quantidade_restante,
  (r.status = 'ativa' and r.validade is not null and r.validade < now()) as vencida,
  p.sku, p.descricao as produto_descricao, p.unidade, p.m2_por_caixa,
  l.codigo as lote_codigo, l.tonalidade, l.calibre,
  d.nome as deposito_nome, lc.codigo as localizacao_codigo,
  c.nome as cliente_nome
from public.estoque_reservas r
join public.produtos p on p.id = r.produto_id
join public.depositos d on d.id = r.deposito_id
left join public.lotes l on l.id = r.lote_id
left join public.localizacoes lc on lc.id = r.localizacao_id
left join public.clientes c on c.id = r.cliente_id;

create view public.vw_inventario_itens with (security_invoker = true) as
select
  i.*, coalesce(i.contagem_2, i.contagem_1) as contagem_final,
  coalesce(i.contagem_2, i.contagem_1) - i.quantidade_sistema as diferenca,
  p.sku, p.descricao as produto_descricao, p.unidade, p.eh_revestimento, p.m2_por_caixa, p.custo,
  l.codigo as lote_codigo, l.tonalidade, l.calibre,
  lc.codigo as localizacao_codigo
from public.inventario_itens i
join public.produtos p on p.id = i.produto_id
left join public.lotes l on l.id = i.lote_id
left join public.localizacoes lc on lc.id = i.localizacao_id;

-- ---------------------------------------------------------------------
-- Carimbos e auditoria
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['depositos','localizacoes','lotes','inventarios'] loop
    execute format('create trigger trg_carimbo before insert or update on public.%I
                    for each row execute function public.fn_carimbo()', t);
  end loop;
  foreach t in array array['depositos','localizacoes','lotes','estoque_reservas','inventarios','inventario_itens'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- Escrita em saldos, movimentações, reservas e inventários: SOMENTE pelas funções acima.
-- ---------------------------------------------------------------------
alter table public.depositos enable row level security;
alter table public.localizacoes enable row level security;
alter table public.lotes enable row level security;
alter table public.estoque_saldos enable row level security;
alter table public.estoque_reservas enable row level security;
alter table public.estoque_movimentacoes enable row level security;
alter table public.inventarios enable row level security;
alter table public.inventario_itens enable row level security;

create policy depositos_select on public.depositos for select to authenticated using (true);
create policy depositos_insert on public.depositos for insert to authenticated
  with check (public.tem_permissao('estoque', 'criar'));
create policy depositos_update on public.depositos for update to authenticated
  using (public.tem_permissao('estoque', 'editar')) with check (public.tem_permissao('estoque', 'editar'));

create policy localizacoes_select on public.localizacoes for select to authenticated using (true);
create policy localizacoes_insert on public.localizacoes for insert to authenticated
  with check (public.tem_permissao('estoque', 'criar'));
create policy localizacoes_update on public.localizacoes for update to authenticated
  using (public.tem_permissao('estoque', 'editar')) with check (public.tem_permissao('estoque', 'editar'));

create policy lotes_select on public.lotes for select to authenticated using (public.pode_ler_estoque());
create policy lotes_insert on public.lotes for insert to authenticated
  with check (public.tem_permissao('lotes', 'criar') or public.tem_permissao('movimentacoes', 'criar'));
create policy lotes_update on public.lotes for update to authenticated
  using (public.tem_permissao('lotes', 'editar')) with check (public.tem_permissao('lotes', 'editar'));

create policy estoque_saldos_select on public.estoque_saldos for select to authenticated
  using (public.pode_ler_estoque());
create policy estoque_reservas_select on public.estoque_reservas for select to authenticated
  using (public.pode_ler_estoque());
create policy estoque_mov_select on public.estoque_movimentacoes for select to authenticated
  using (public.tem_permissao('movimentacoes', 'ler') or public.tem_permissao('estoque', 'ler'));
create policy inventarios_select on public.inventarios for select to authenticated
  using (public.tem_permissao('inventario', 'ler'));
create policy inventario_itens_select on public.inventario_itens for select to authenticated
  using (public.tem_permissao('inventario', 'ler'));

-- ---------------------------------------------------------------------
-- Dado de referência: depósito principal da loja (pode ser renomeado)
-- ---------------------------------------------------------------------
insert into public.depositos (codigo, nome, padrao) values ('LOJA', 'Depósito da loja', true);
