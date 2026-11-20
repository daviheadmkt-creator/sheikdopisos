-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 6: separação de pedidos, entregas e logística
--
-- Fluxo: venda confirmada → entrega (aguardando separação) → separação/conferência
--        → BAIXA FÍSICA (consome a reserva) → agendamento → em rota → entregue/devolvido
--
-- Princípios:
--  * Baixa física ocorre SOMENTE na conclusão da separação (uma vez; chave de idempotência
--    por item) e consome a reserva da venda na mesma transação.
--  * Separação parcial cria automaticamente nova entrega com o saldo (entrega parcial).
--  * Sempre o lote reservado na venda (sem mistura automática de lotes).
--  * Devolução retorna a mercadoria ao estoque (movimentação 'devolucao').
-- =====================================================================

create type public.status_entrega as enum (
  'aguardando_separacao', 'separado', 'agendado', 'em_rota', 'entregue', 'devolvido', 'cancelado'
);

alter table public.venda_itens
  add column quantidade_separada numeric(14,4) not null default 0,
  add column quantidade_entregue numeric(14,4) not null default 0,
  add constraint venda_item_logistica check (quantidade_separada >= 0 and quantidade_entregue >= 0
                                             and quantidade_entregue <= quantidade_separada and quantidade_separada <= quantidade);

-- ---------------------------------------------------------------------
-- Cadastros de logística
-- ---------------------------------------------------------------------
create table public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  descricao text not null,
  capacidade_kg numeric(10,2) check (capacidade_kg is null or capacidade_kg > 0),
  ativo boolean not null default true
);

create table public.motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) >= 2),
  telefone text check (telefone is null or telefone ~ '^\d{10,11}$'),
  cnh text,
  ativo boolean not null default true
);

create table public.transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) >= 2),
  cnpj text unique check (cnpj is null or public.valida_cnpj(cnpj)),
  telefone text,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  ativo boolean not null default true
);

-- ---------------------------------------------------------------------
-- Entregas
-- ---------------------------------------------------------------------
create sequence public.entregas_numero_seq start 1;

create table public.entregas (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.entregas_numero_seq'),
  venda_id uuid not null references public.vendas(id) on delete restrict,
  entrega_origem_id uuid references public.entregas(id) on delete restrict,  -- saldo de separação parcial
  tipo text not null check (tipo in ('entrega', 'retirada')),
  status public.status_entrega not null default 'aguardando_separacao',
  -- endereço (cópia no momento da venda)
  cep text, logradouro text, numero_endereco text, complemento text, bairro text, cidade text, uf char(2), referencia text,
  -- agenda
  data_agendada date,
  janela text check (janela is null or janela in ('manha', 'tarde', 'comercial')),
  motorista_id uuid references public.motoristas(id) on delete restrict,
  veiculo_id uuid references public.veiculos(id) on delete restrict,
  transportadora_id uuid references public.transportadoras(id) on delete restrict,
  frete_custo numeric(14,2) not null default 0 check (frete_custo >= 0),
  -- separação
  separador_nome text,
  separado_em timestamptz,
  -- execução
  saiu_em timestamptz,
  entregue_em timestamptz,
  recebedor_nome text,
  recebedor_documento text,
  comprovante_path text,
  motivo_ocorrencia text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index entregas_status_idx on public.entregas(status, data_agendada);
create index entregas_venda_idx on public.entregas(venda_id);

create table public.entrega_itens (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.entregas(id) on delete cascade,
  venda_item_id uuid not null references public.venda_itens(id) on delete restrict,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  lote_id uuid,
  deposito_id uuid references public.depositos(id) on delete restrict,
  localizacao_id uuid,
  quantidade numeric(14,4) not null check (quantidade > 0),
  quantidade_separada numeric(14,4) not null default 0,
  quantidade_devolvida numeric(14,4) not null default 0,
  conferido boolean not null default false,
  divergencia text,
  movimentacao_id uuid references public.estoque_movimentacoes(id) on delete restrict,
  constraint entrega_item_qtds check (quantidade_separada >= 0 and quantidade_separada <= quantidade
                                      and quantidade_devolvida >= 0 and quantidade_devolvida <= quantidade_separada)
);
create index entrega_itens_entrega_idx on public.entrega_itens(entrega_id);

-- ---------------------------------------------------------------------
-- Geração da entrega na confirmação da venda
-- ---------------------------------------------------------------------
create or replace function public.gerar_entrega_venda(p_venda uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.entregas where venda_id = p_venda limit 1;
  if found then return v_id; end if;

  insert into public.entregas (venda_id, tipo, cep, logradouro, numero_endereco, complemento, bairro, cidade, uf, referencia, observacoes)
  select v.id, v.tipo_entrega, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf, e.referencia, v.observacoes
  from public.vendas v
  left join public.cliente_enderecos e on e.id = v.endereco_entrega_id
  where v.id = p_venda
  returning id into v_id;

  insert into public.entrega_itens (entrega_id, venda_item_id, produto_id, lote_id, deposito_id, localizacao_id, quantidade)
  select v_id, i.id, i.produto_id, i.lote_id, i.deposito_id, i.localizacao_id, i.quantidade - i.quantidade_separada
  from public.venda_itens i where i.venda_id = p_venda and i.quantidade > i.quantidade_separada;
  return v_id;
end;
$$;
revoke execute on function public.gerar_entrega_venda(uuid) from public, anon, authenticated;

create or replace function public.fn_vendas_logistica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmada' and old.status is distinct from 'confirmada' then
    perform public.gerar_entrega_venda(new.id);
  elsif new.status = 'cancelada' and old.status = 'confirmada' then
    if exists (select 1 from public.entregas where venda_id = new.id and status not in ('aguardando_separacao', 'cancelado')) then
      raise exception 'Venda com mercadoria já separada/entregue: registre a devolução' using errcode = 'P0001';
    end if;
    update public.entregas set status = 'cancelado', motivo_ocorrencia = 'Venda cancelada'
    where venda_id = new.id and status = 'aguardando_separacao';
  end if;
  return new;
end;
$$;

create trigger trg_vendas_logistica
  after update of status on public.vendas
  for each row execute function public.fn_vendas_logistica();

-- ---------------------------------------------------------------------
-- Separação: concluir (baixa física consumindo a reserva)
-- p_itens: [{ "item_id": uuid, "quantidade_separada": "12.96", "conferido": true, "divergencia": "" }]
-- ---------------------------------------------------------------------
create or replace function public.concluir_separacao(p_entrega uuid, p_itens jsonb)
returns uuid  -- id da nova entrega com o saldo (quando separação parcial), senão null
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entregas%rowtype;
  v_item record;
  v_x jsonb;
  v_q numeric;
  v_res public.estoque_reservas%rowtype;
  v_reserva uuid;
  v_mov uuid;
  v_saldo uuid;
  v_venda_num bigint;
begin
  if not (public.tem_permissao('separacao', 'editar') or public.tem_permissao('separacao', 'criar')) then
    raise exception 'Sem permissão para separar pedidos' using errcode = '42501';
  end if;
  select * into v_ent from public.entregas where id = p_entrega for update;
  if not found then raise exception 'Entrega não encontrada' using errcode = 'P0002'; end if;
  if v_ent.status <> 'aguardando_separacao' then
    if v_ent.separado_em is not null then
      return (select id from public.entregas where entrega_origem_id = p_entrega and created_at >= v_ent.separado_em limit 1);
    end if;
    raise exception 'Entrega % não está aguardando separação', v_ent.status using errcode = 'P0001';
  end if;
  select numero into v_venda_num from public.vendas where id = v_ent.venda_id;

  for v_item in
    select ei.*, vi.reserva_id, vi.quantidade as qtd_venda, vi.quantidade_separada as sep_venda, vi.descricao
    from public.entrega_itens ei join public.venda_itens vi on vi.id = ei.venda_item_id
    where ei.entrega_id = p_entrega
    for update of ei, vi
  loop
    select x into v_x from jsonb_array_elements(p_itens) x where (x ->> 'item_id')::uuid = v_item.id;
    v_q := coalesce(nullif(v_x ->> 'quantidade_separada', '')::numeric, 0);
    if v_q < 0 or v_q > v_item.quantidade then
      raise exception '%: quantidade separada inválida (máximo %)', v_item.descricao, v_item.quantidade using errcode = '22023';
    end if;

    -- saldo não separado vai para nova entrega
    if v_q < v_item.quantidade then
      if v_saldo is null then
        insert into public.entregas (venda_id, entrega_origem_id, tipo, cep, logradouro, numero_endereco, complemento, bairro,
          cidade, uf, referencia, observacoes)
        values (v_ent.venda_id, p_entrega, v_ent.tipo, v_ent.cep, v_ent.logradouro, v_ent.numero_endereco, v_ent.complemento,
          v_ent.bairro, v_ent.cidade, v_ent.uf, v_ent.referencia, 'Saldo da entrega nº ' || v_ent.numero)
        returning id into v_saldo;
      end if;
      insert into public.entrega_itens (entrega_id, venda_item_id, produto_id, lote_id, deposito_id, localizacao_id, quantidade)
      values (v_saldo, v_item.venda_item_id, v_item.produto_id, v_item.lote_id, v_item.deposito_id, v_item.localizacao_id,
              v_item.quantidade - v_q);
    end if;

    if v_q = 0 then
      delete from public.entrega_itens where id = v_item.id;
      continue;
    end if;

    -- consome a reserva da venda quando ativa e suficiente
    v_reserva := null;
    if v_item.reserva_id is not null then
      select * into v_res from public.estoque_reservas where id = v_item.reserva_id;
      if v_res.status = 'ativa' and v_res.quantidade - v_res.quantidade_consumida >= v_q then
        v_reserva := v_res.id;
      end if;
    end if;

    v_mov := public._movimentar(
      p_tipo => 'saida',
      p_produto_id => v_item.produto_id,
      p_quantidade => v_q,
      p_lote_id => v_item.lote_id,
      p_deposito_origem_id => v_item.deposito_id,
      p_localizacao_origem_id => v_item.localizacao_id,
      p_motivo => format('Separação da entrega nº %s (venda nº %s)', v_ent.numero, v_venda_num),
      p_documento_tipo => 'venda',
      p_documento_id => v_ent.venda_id::text,
      p_reserva_id => v_reserva,
      p_chave => 'separacao-item:' || v_item.id
    );

    update public.entrega_itens set quantidade = v_q, quantidade_separada = v_q, movimentacao_id = v_mov,
      conferido = coalesce((v_x ->> 'conferido')::boolean, false), divergencia = nullif(trim(v_x ->> 'divergencia'), '')
    where id = v_item.id;
    update public.venda_itens set quantidade_separada = quantidade_separada + v_q where id = v_item.venda_item_id;
  end loop;

  if not exists (select 1 from public.entrega_itens where entrega_id = p_entrega) then
    raise exception 'Nenhum item foi separado' using errcode = 'P0001';
  end if;

  update public.entregas set status = case when data_agendada is not null and tipo = 'entrega' then 'agendado'::public.status_entrega else 'separado'::public.status_entrega end,
    separador_nome = public.nome_usuario_atual(), separado_em = now()
  where id = p_entrega;
  return v_saldo;
end;
$$;

-- ---------------------------------------------------------------------
-- Agenda, rota, entrega, devolução, cancelamento
-- ---------------------------------------------------------------------
create or replace function public.agendar_entrega(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entregas%rowtype;
begin
  if not public.tem_permissao('entregas', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into v_ent from public.entregas where id = (p ->> 'entrega_id')::uuid for update;
  if not found then raise exception 'Entrega não encontrada' using errcode = 'P0002'; end if;
  if v_ent.status not in ('aguardando_separacao', 'separado', 'agendado') then
    raise exception 'Entrega % não pode ser agendada', v_ent.status using errcode = 'P0001';
  end if;
  if v_ent.tipo = 'retirada' then raise exception 'Retiradas na loja não são agendadas' using errcode = 'P0001'; end if;
  if nullif(p ->> 'data_agendada', '') is null then raise exception 'Informe a data' using errcode = '22023'; end if;

  update public.entregas set
    data_agendada = (p ->> 'data_agendada')::date,
    janela = nullif(p ->> 'janela', ''),
    motorista_id = nullif(p ->> 'motorista_id', '')::uuid,
    veiculo_id = nullif(p ->> 'veiculo_id', '')::uuid,
    transportadora_id = nullif(p ->> 'transportadora_id', '')::uuid,
    frete_custo = coalesce(nullif(p ->> 'frete_custo', '')::numeric, 0),
    observacoes = coalesce(nullif(trim(p ->> 'observacoes'), ''), observacoes),
    status = case when status = 'separado' then 'agendado'::public.status_entrega else status end
  where id = v_ent.id;
end;
$$;

create or replace function public.iniciar_rota(p_entregas uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not public.tem_permissao('entregas', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if exists (select 1 from public.entregas where id = any (p_entregas)
             and (status <> 'agendado' or (transportadora_id is null and (motorista_id is null or veiculo_id is null)))) then
    raise exception 'Somente entregas agendadas, com motorista e veículo (ou transportadora), podem sair para rota' using errcode = 'P0001';
  end if;
  update public.entregas set status = 'em_rota', saiu_em = now() where id = any (p_entregas);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Atualiza quantidade entregue da venda e conclui a venda quando tudo foi entregue
create or replace function public._atualizar_venda_entregue(p_venda uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venda_itens vi set quantidade_entregue = coalesce((
    select sum(ei.quantidade_separada - ei.quantidade_devolvida)
    from public.entrega_itens ei join public.entregas e on e.id = ei.entrega_id
    where ei.venda_item_id = vi.id and e.status = 'entregue'), 0)
  where vi.venda_id = p_venda;

  if not exists (select 1 from public.venda_itens where venda_id = p_venda and quantidade_entregue < quantidade) then
    update public.vendas set status = 'concluida' where id = p_venda and status = 'confirmada';
  end if;
end;
$$;
revoke execute on function public._atualizar_venda_entregue(uuid) from public, anon, authenticated;

-- Retorno de mercadoria ao estoque (devolução)
create or replace function public._devolver_itens(p_entrega uuid, p_itens jsonb, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_q numeric;
  v_ent public.entregas%rowtype;
begin
  select * into v_ent from public.entregas where id = p_entrega;
  for v_item in select * from public.entrega_itens where entrega_id = p_entrega for update loop
    v_q := coalesce((select nullif(x ->> 'quantidade_devolvida', '')::numeric from jsonb_array_elements(p_itens) x
                     where (x ->> 'item_id')::uuid = v_item.id), 0);
    if v_q <= 0 then continue; end if;
    if v_q > v_item.quantidade_separada - v_item.quantidade_devolvida then
      raise exception 'Devolução maior que a quantidade entregue' using errcode = '22023';
    end if;
    perform public._movimentar(
      p_tipo => 'devolucao', p_produto_id => v_item.produto_id, p_quantidade => v_q, p_lote_id => v_item.lote_id,
      p_deposito_destino_id => v_item.deposito_id, p_localizacao_destino_id => v_item.localizacao_id,
      p_motivo => format('Devolução na entrega nº %s: %s', v_ent.numero, p_motivo),
      p_documento_tipo => 'venda', p_documento_id => v_ent.venda_id::text,
      p_chave => format('devolucao:%s:%s', v_item.id, v_item.quantidade_devolvida + v_q),
      p_ignorar_bloqueio_inventario => true);
    update public.entrega_itens set quantidade_devolvida = quantidade_devolvida + v_q where id = v_item.id;
    update public.venda_itens set quantidade_separada = quantidade_separada - v_q where id = v_item.venda_item_id;
  end loop;
end;
$$;
revoke execute on function public._devolver_itens(uuid, jsonb, text) from public, anon, authenticated;

-- Confirma entrega (ou retirada). Devolução parcial opcional por item.
create or replace function public.confirmar_entrega(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entregas%rowtype;
begin
  if not public.tem_permissao('entregas', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into v_ent from public.entregas where id = (p ->> 'entrega_id')::uuid for update;
  if not found then raise exception 'Entrega não encontrada' using errcode = 'P0002'; end if;
  if v_ent.status = 'entregue' then return; end if;
  if (v_ent.tipo = 'entrega' and v_ent.status <> 'em_rota') or (v_ent.tipo = 'retirada' and v_ent.status <> 'separado') then
    raise exception 'Entrega % não pode ser confirmada', v_ent.status using errcode = 'P0001';
  end if;
  if nullif(trim(p ->> 'recebedor_nome'), '') is null then
    raise exception 'Informe quem recebeu a mercadoria' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p -> 'devolucoes', '[]'::jsonb)) > 0 then
    if nullif(trim(p ->> 'motivo_devolucao'), '') is null then raise exception 'Informe o motivo da devolução' using errcode = '22023'; end if;
    perform public._devolver_itens(v_ent.id, p -> 'devolucoes', p ->> 'motivo_devolucao');
  end if;

  update public.entregas set status = 'entregue', entregue_em = now(),
    recebedor_nome = trim(p ->> 'recebedor_nome'), recebedor_documento = nullif(trim(p ->> 'recebedor_documento'), ''),
    comprovante_path = coalesce(nullif(p ->> 'comprovante_path', ''), comprovante_path),
    motivo_ocorrencia = nullif(trim(p ->> 'motivo_devolucao'), '')
  where id = v_ent.id;
  perform public._atualizar_venda_entregue(v_ent.venda_id);
end;
$$;

-- Devolução total (cliente ausente, recusa, avaria). Opcionalmente cria nova entrega para reentregar.
create or replace function public.registrar_devolucao_entrega(p_entrega uuid, p_motivo text, p_reentregar boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entregas%rowtype;
  v_itens jsonb;
  v_nova uuid;
begin
  if not public.tem_permissao('entregas', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into v_ent from public.entregas where id = p_entrega for update;
  if v_ent.status not in ('em_rota', 'separado', 'agendado') then
    raise exception 'Entrega % não pode ser devolvida', v_ent.status using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object('item_id', id, 'quantidade_devolvida', quantidade_separada - quantidade_devolvida)) into v_itens
  from public.entrega_itens where entrega_id = p_entrega and quantidade_separada > quantidade_devolvida;
  perform public._devolver_itens(p_entrega, coalesce(v_itens, '[]'::jsonb), p_motivo);

  update public.entregas set status = 'devolvido', motivo_ocorrencia = trim(p_motivo) where id = p_entrega;

  if p_reentregar then
    insert into public.entregas (venda_id, entrega_origem_id, tipo, cep, logradouro, numero_endereco, complemento, bairro, cidade, uf,
      referencia, observacoes)
    values (v_ent.venda_id, p_entrega, v_ent.tipo, v_ent.cep, v_ent.logradouro, v_ent.numero_endereco, v_ent.complemento,
      v_ent.bairro, v_ent.cidade, v_ent.uf, v_ent.referencia, 'Reentrega da entrega nº ' || v_ent.numero || ': ' || trim(p_motivo))
    returning id into v_nova;
    insert into public.entrega_itens (entrega_id, venda_item_id, produto_id, lote_id, deposito_id, localizacao_id, quantidade)
    select v_nova, venda_item_id, produto_id, lote_id, deposito_id, localizacao_id, quantidade_devolvida
    from public.entrega_itens where entrega_id = p_entrega and quantidade_devolvida > 0;
  end if;
  return v_nova;
end;
$$;

create or replace function public.cancelar_entrega(p_entrega uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entregas%rowtype;
begin
  if not public.tem_permissao('entregas', 'cancelar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into v_ent from public.entregas where id = p_entrega for update;
  if v_ent.status <> 'aguardando_separacao' then
    raise exception 'Somente entregas não separadas podem ser canceladas; para mercadoria separada, registre devolução' using errcode = 'P0001';
  end if;
  update public.entregas set status = 'cancelado', motivo_ocorrencia = trim(p_motivo) where id = p_entrega;
end;
$$;

-- Altera para retirada na loja ou para entrega (antes de sair)
create or replace function public.alterar_tipo_entrega(p_entrega uuid, p_tipo text, p_endereco uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entregas%rowtype;
  v_end public.cliente_enderecos%rowtype;
begin
  if not public.tem_permissao('entregas', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into v_ent from public.entregas where id = p_entrega for update;
  if v_ent.status not in ('aguardando_separacao', 'separado', 'agendado') then
    raise exception 'Não é possível alterar após a saída' using errcode = 'P0001';
  end if;
  if p_tipo = 'entrega' then
    select e.* into v_end from public.cliente_enderecos e join public.vendas v on v.cliente_id = e.cliente_id
    where e.id = p_endereco and v.id = v_ent.venda_id;
    if not found then raise exception 'Selecione um endereço do cliente' using errcode = '22023'; end if;
    update public.entregas set tipo = 'entrega', cep = v_end.cep, logradouro = v_end.logradouro, numero_endereco = v_end.numero,
      complemento = v_end.complemento, bairro = v_end.bairro, cidade = v_end.cidade, uf = v_end.uf, referencia = v_end.referencia
    where id = p_entrega;
  elsif p_tipo = 'retirada' then
    update public.entregas set tipo = 'retirada', data_agendada = null, janela = null, motorista_id = null, veiculo_id = null,
      transportadora_id = null, status = case when status = 'agendado' then 'separado'::public.status_entrega else status end
    where id = p_entrega;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.concluir_separacao(uuid, jsonb)',
    'public.agendar_entrega(jsonb)',
    'public.iniciar_rota(uuid[])',
    'public.confirmar_entrega(jsonb)',
    'public.registrar_devolucao_entrega(uuid, text, boolean)',
    'public.cancelar_entrega(uuid, text)',
    'public.alterar_tipo_entrega(uuid, text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Visões
-- ---------------------------------------------------------------------
create view public.vw_entregas with (security_invoker = true) as
select e.*, v.numero as venda_numero, v.cliente_id, c.nome as cliente_nome, c.telefone as cliente_telefone,
       c.whatsapp as cliente_whatsapp, m.nome as motorista_nome, ve.placa as veiculo_placa, ve.descricao as veiculo_descricao,
       t.nome as transportadora_nome,
       (select count(*) from public.entrega_itens i where i.entrega_id = e.id) as qtd_itens,
       (select coalesce(sum(i.quantidade * coalesce(p.peso_kg, 0) / case when p.eh_revestimento and p.m2_por_caixa > 0 and p.unidade = 'M2' then p.m2_por_caixa else 1 end), 0)
          from public.entrega_itens i join public.produtos p on p.id = i.produto_id where i.entrega_id = e.id) as peso_estimado_kg
from public.entregas e
join public.vendas v on v.id = e.venda_id
join public.clientes c on c.id = v.cliente_id
left join public.motoristas m on m.id = e.motorista_id
left join public.veiculos ve on ve.id = e.veiculo_id
left join public.transportadoras t on t.id = e.transportadora_id;

create view public.vw_entrega_itens with (security_invoker = true) as
select i.*, p.sku, p.descricao as produto_descricao, p.unidade, p.eh_revestimento, p.m2_por_caixa,
       l.codigo as lote_codigo, l.tonalidade, l.calibre, d.nome as deposito_nome, lc.codigo as localizacao_codigo
from public.entrega_itens i
join public.produtos p on p.id = i.produto_id
left join public.lotes l on l.id = i.lote_id
left join public.depositos d on d.id = i.deposito_id
left join public.localizacoes lc on lc.id = i.localizacao_id;

-- ---------------------------------------------------------------------
-- Storage: comprovantes de entrega (privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy comprovantes_select on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and (public.tem_permissao('entregas', 'ler') or public.tem_permissao('vendas', 'ler')));
create policy comprovantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.tem_permissao('entregas', 'editar'));

-- ---------------------------------------------------------------------
-- Carimbos, auditoria e RLS
-- ---------------------------------------------------------------------
create trigger trg_carimbo before insert or update on public.entregas for each row execute function public.fn_carimbo();
do $$
declare t text;
begin
  foreach t in array array['veiculos', 'motoristas', 'transportadoras', 'entregas', 'entrega_itens'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

alter table public.veiculos enable row level security;
alter table public.motoristas enable row level security;
alter table public.transportadoras enable row level security;
alter table public.entregas enable row level security;
alter table public.entrega_itens enable row level security;

create or replace function public.pode_ler_logistica()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.tem_permissao('entregas', 'ler') or public.tem_permissao('separacao', 'ler') or public.tem_permissao('vendas', 'ler');
$$;
grant execute on function public.pode_ler_logistica() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['veiculos', 'motoristas', 'transportadoras'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.pode_ler_logistica())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.tem_permissao(''entregas'', ''criar''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.tem_permissao(''entregas'', ''editar'')) with check (public.tem_permissao(''entregas'', ''editar''))', t || '_update', t);
  end loop;
end $$;

create policy entregas_select on public.entregas for select to authenticated using (public.pode_ler_logistica());
create policy entrega_itens_select on public.entrega_itens for select to authenticated using (public.pode_ler_logistica());

-- Vendas já confirmadas antes desta fase recebem sua entrega
select public.gerar_entrega_venda(id) from public.vendas where status = 'confirmada';
