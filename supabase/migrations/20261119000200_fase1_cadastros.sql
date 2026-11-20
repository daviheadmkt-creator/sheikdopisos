-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 1 / Parte 2: cadastros
-- Clientes, endereços, categorias, marcas, unidades, fornecedores (base),
-- produtos e imagens de produtos.
-- =====================================================================

create type public.tipo_pessoa as enum ('PF', 'PJ');

create or replace function public.uf_valida(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
               'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO');
$$;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create sequence public.clientes_codigo_seq start 1;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  codigo bigint not null unique default nextval('public.clientes_codigo_seq'),
  tipo_pessoa public.tipo_pessoa not null,
  nome text not null check (length(trim(nome)) between 2 and 150),
  razao_social text,
  documento text,
  inscricao_estadual text,
  telefone text check (telefone is null or telefone ~ '^\d{10,11}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\d{10,13}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  vendedor_id uuid references public.usuarios(id) on delete set null,
  limite_credito numeric(14,2) not null default 0 check (limite_credito >= 0),
  observacoes text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'bloqueado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint clientes_documento_valido check (
    (tipo_pessoa = 'PF' and (documento is null or (documento ~ '^\d{11}$' and public.valida_cpf(documento))))
    or (tipo_pessoa = 'PJ' and documento is not null and public.valida_cnpj(documento))
  ),
  constraint clientes_pj_razao_social check (tipo_pessoa = 'PF' or nullif(trim(razao_social), '') is not null)
);
create unique index clientes_documento_uk on public.clientes(documento) where documento is not null;
create index clientes_nome_trgm on public.clientes using gin (nome extensions.gin_trgm_ops);
create index clientes_razao_trgm on public.clientes using gin (razao_social extensions.gin_trgm_ops);
create index clientes_status_idx on public.clientes(status);
create index clientes_vendedor_idx on public.clientes(vendedor_id);

create table public.cliente_enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  descricao text,
  cep text not null check (cep ~ '^\d{8}$'),
  logradouro text not null,
  numero text not null,
  complemento text,
  bairro text not null,
  cidade text not null,
  uf char(2) not null check (public.uf_valida(uf)),
  referencia text,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index cliente_enderecos_cliente_idx on public.cliente_enderecos(cliente_id);
create unique index cliente_enderecos_principal_uk on public.cliente_enderecos(cliente_id) where principal;

-- ---------------------------------------------------------------------
-- Categorias, marcas e unidades
-- ---------------------------------------------------------------------
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) >= 2),
  revestimento boolean not null default false, -- exige peças/caixa e m²/caixa
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) >= 2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.unidades (
  codigo text primary key check (codigo ~ '^[A-Z0-9]{1,6}$'),
  descricao text not null,
  casas_decimais smallint not null default 0 check (casas_decimais between 0 and 4),
  ativo boolean not null default true
);

-- ---------------------------------------------------------------------
-- Fornecedores (estrutura base; a tela completa é entregue na Fase 4)
-- ---------------------------------------------------------------------
create sequence public.fornecedores_codigo_seq start 1;

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  codigo bigint not null unique default nextval('public.fornecedores_codigo_seq'),
  razao_social text not null check (length(trim(razao_social)) >= 2),
  nome_fantasia text,
  cnpj text unique check (cnpj is null or public.valida_cnpj(cnpj)),
  inscricao_estadual text,
  telefone text,
  whatsapp text,
  email text,
  contato_nome text,
  cep text check (cep is null or cep ~ '^\d{8}$'),
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2) check (uf is null or public.uf_valida(uf)),
  condicoes_pagamento text,
  prazo_entrega_dias int check (prazo_entrega_dias is null or prazo_entrega_dias >= 0),
  observacoes text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Za-z0-9._/-]{2,40}$'),
  codigo_barras text unique check (codigo_barras is null or codigo_barras ~ '^(\d{8}|\d{12,14})$'),
  descricao text not null check (length(trim(descricao)) between 3 and 200),
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  marca_id uuid references public.marcas(id) on delete restrict,
  fornecedor_id uuid references public.fornecedores(id) on delete restrict,
  unidade text not null references public.unidades(codigo) on delete restrict,
  custo numeric(14,4) not null default 0 check (custo >= 0),
  preco_venda numeric(14,2) not null check (preco_venda >= 0),
  estoque_minimo numeric(14,3) not null default 0 check (estoque_minimo >= 0),
  peso_kg numeric(10,3) check (peso_kg is null or peso_kg >= 0),
  largura_cm numeric(10,2) check (largura_cm is null or largura_cm > 0),
  comprimento_cm numeric(10,2) check (comprimento_cm is null or comprimento_cm > 0),
  espessura_mm numeric(10,2) check (espessura_mm is null or espessura_mm > 0),
  -- Revestimentos (porcelanatos, cerâmicas etc.)
  eh_revestimento boolean not null default false,
  pecas_por_caixa int check (pecas_por_caixa is null or pecas_por_caixa > 0),
  m2_por_caixa numeric(10,4) check (m2_por_caixa is null or m2_por_caixa > 0),
  acabamento text,
  tonalidade_referencia text, -- tonalidade/calibre reais são controlados por lote (Fase 2)
  calibre_referencia text,
  -- Preparação fiscal (emissão NF-e/NFC-e em fase futura)
  ncm text check (ncm is null or ncm ~ '^\d{8}$'),
  cest text check (cest is null or cest ~ '^\d{7}$'),
  origem_mercadoria smallint check (origem_mercadoria is null or origem_mercadoria between 0 and 8),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint produtos_revestimento_campos check (
    not eh_revestimento or (pecas_por_caixa is not null and m2_por_caixa is not null)
  )
);
create index produtos_descricao_trgm on public.produtos using gin (descricao extensions.gin_trgm_ops);
create index produtos_categoria_idx on public.produtos(categoria_id);
create index produtos_marca_idx on public.produtos(marca_id);
create index produtos_fornecedor_idx on public.produtos(fornecedor_id);
create index produtos_status_idx on public.produtos(status);

create table public.produto_imagens (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  storage_path text not null unique,
  ordem int not null default 0,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index produto_imagens_produto_idx on public.produto_imagens(produto_id, ordem);
create unique index produto_imagens_principal_uk on public.produto_imagens(produto_id) where principal;

-- ---------------------------------------------------------------------
-- Salvamento atômico de cliente + endereços (uma transação)
-- SECURITY INVOKER: as políticas RLS do usuário continuam valendo.
-- ---------------------------------------------------------------------
create or replace function public.salvar_cliente(p_cliente jsonb, p_enderecos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_cliente ->> 'id', '')::uuid;
  v_ids uuid[];
  v_principais int;
begin
  if jsonb_typeof(p_enderecos) <> 'array' then
    raise exception 'Lista de endereços inválida' using errcode = '22023';
  end if;

  select count(*) into v_principais
  from jsonb_array_elements(p_enderecos) e
  where coalesce((e ->> 'principal')::boolean, false);
  if jsonb_array_length(p_enderecos) > 0 and v_principais <> 1 then
    raise exception 'Informe exatamente um endereço principal' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.clientes (
      tipo_pessoa, nome, razao_social, documento, inscricao_estadual, telefone, whatsapp, email,
      vendedor_id, limite_credito, observacoes, status
    ) values (
      (p_cliente ->> 'tipo_pessoa')::public.tipo_pessoa,
      trim(p_cliente ->> 'nome'),
      nullif(trim(p_cliente ->> 'razao_social'), ''),
      nullif(p_cliente ->> 'documento', ''),
      nullif(trim(p_cliente ->> 'inscricao_estadual'), ''),
      nullif(p_cliente ->> 'telefone', ''),
      nullif(p_cliente ->> 'whatsapp', ''),
      nullif(lower(trim(p_cliente ->> 'email')), ''),
      nullif(p_cliente ->> 'vendedor_id', '')::uuid,
      coalesce(nullif(p_cliente ->> 'limite_credito', '')::numeric, 0),
      nullif(trim(p_cliente ->> 'observacoes'), ''),
      coalesce(nullif(p_cliente ->> 'status', ''), 'ativo')
    )
    returning id into v_id;
  else
    update public.clientes set
      tipo_pessoa = (p_cliente ->> 'tipo_pessoa')::public.tipo_pessoa,
      nome = trim(p_cliente ->> 'nome'),
      razao_social = nullif(trim(p_cliente ->> 'razao_social'), ''),
      documento = nullif(p_cliente ->> 'documento', ''),
      inscricao_estadual = nullif(trim(p_cliente ->> 'inscricao_estadual'), ''),
      telefone = nullif(p_cliente ->> 'telefone', ''),
      whatsapp = nullif(p_cliente ->> 'whatsapp', ''),
      email = nullif(lower(trim(p_cliente ->> 'email')), ''),
      vendedor_id = nullif(p_cliente ->> 'vendedor_id', '')::uuid,
      limite_credito = coalesce(nullif(p_cliente ->> 'limite_credito', '')::numeric, 0),
      observacoes = nullif(trim(p_cliente ->> 'observacoes'), ''),
      status = coalesce(nullif(p_cliente ->> 'status', ''), 'ativo')
    where id = v_id;
    if not found then
      raise exception 'Cliente não encontrado ou sem permissão de edição' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}'::uuid[]) into v_ids
  from jsonb_array_elements(p_enderecos) e
  where nullif(e ->> 'id', '') is not null;

  delete from public.cliente_enderecos where cliente_id = v_id and not (id = any (v_ids));
  update public.cliente_enderecos set principal = false where cliente_id = v_id and principal;

  insert into public.cliente_enderecos (
    id, cliente_id, descricao, cep, logradouro, numero, complemento, bairro, cidade, uf, referencia, principal
  )
  select
    coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
    v_id,
    nullif(trim(e ->> 'descricao'), ''),
    regexp_replace(e ->> 'cep', '\D', '', 'g'),
    trim(e ->> 'logradouro'),
    trim(e ->> 'numero'),
    nullif(trim(e ->> 'complemento'), ''),
    trim(e ->> 'bairro'),
    trim(e ->> 'cidade'),
    upper(e ->> 'uf'),
    nullif(trim(e ->> 'referencia'), ''),
    coalesce((e ->> 'principal')::boolean, false)
  from jsonb_array_elements(p_enderecos) e
  on conflict (id) do update set
    descricao = excluded.descricao,
    cep = excluded.cep,
    logradouro = excluded.logradouro,
    numero = excluded.numero,
    complemento = excluded.complemento,
    bairro = excluded.bairro,
    cidade = excluded.cidade,
    uf = excluded.uf,
    referencia = excluded.referencia,
    principal = excluded.principal
  where public.cliente_enderecos.cliente_id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.salvar_cliente(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_cliente(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Carimbos e auditoria
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clientes','cliente_enderecos','categorias','marcas','fornecedores','produtos'] loop
    execute format('create trigger trg_carimbo before insert or update on public.%I
                    for each row execute function public.fn_carimbo()', t);
  end loop;
  foreach t in array array['clientes','cliente_enderecos','categorias','marcas','unidades','fornecedores',
                           'produtos','produto_imagens'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.clientes enable row level security;
alter table public.cliente_enderecos enable row level security;
alter table public.categorias enable row level security;
alter table public.marcas enable row level security;
alter table public.unidades enable row level security;
alter table public.fornecedores enable row level security;
alter table public.produtos enable row level security;
alter table public.produto_imagens enable row level security;

-- Clientes: sem DELETE (LGPD/histórico) — inativação por status
create policy clientes_select on public.clientes for select to authenticated
  using (public.tem_permissao('clientes', 'ler'));
create policy clientes_insert on public.clientes for insert to authenticated
  with check (public.tem_permissao('clientes', 'criar'));
create policy clientes_update on public.clientes for update to authenticated
  using (public.tem_permissao('clientes', 'editar'))
  with check (public.tem_permissao('clientes', 'editar'));

create policy cliente_enderecos_select on public.cliente_enderecos for select to authenticated
  using (public.tem_permissao('clientes', 'ler'));
create policy cliente_enderecos_insert on public.cliente_enderecos for insert to authenticated
  with check (public.tem_permissao('clientes', 'criar') or public.tem_permissao('clientes', 'editar'));
create policy cliente_enderecos_update on public.cliente_enderecos for update to authenticated
  using (public.tem_permissao('clientes', 'editar'))
  with check (public.tem_permissao('clientes', 'editar'));
create policy cliente_enderecos_delete on public.cliente_enderecos for delete to authenticated
  using (public.tem_permissao('clientes', 'editar'));

-- Tabelas auxiliares de produto
create policy categorias_select on public.categorias for select to authenticated using (true);
create policy categorias_insert on public.categorias for insert to authenticated
  with check (public.tem_permissao('produtos', 'criar'));
create policy categorias_update on public.categorias for update to authenticated
  using (public.tem_permissao('produtos', 'editar')) with check (public.tem_permissao('produtos', 'editar'));

create policy marcas_select on public.marcas for select to authenticated using (true);
create policy marcas_insert on public.marcas for insert to authenticated
  with check (public.tem_permissao('produtos', 'criar'));
create policy marcas_update on public.marcas for update to authenticated
  using (public.tem_permissao('produtos', 'editar')) with check (public.tem_permissao('produtos', 'editar'));

create policy unidades_select on public.unidades for select to authenticated using (true);
create policy unidades_write on public.unidades for all to authenticated
  using (public.tem_permissao('configuracoes', 'editar'))
  with check (public.tem_permissao('configuracoes', 'editar'));

create policy fornecedores_select on public.fornecedores for select to authenticated
  using (public.tem_permissao('fornecedores', 'ler') or public.tem_permissao('produtos', 'ler'));
create policy fornecedores_insert on public.fornecedores for insert to authenticated
  with check (public.tem_permissao('fornecedores', 'criar'));
create policy fornecedores_update on public.fornecedores for update to authenticated
  using (public.tem_permissao('fornecedores', 'editar'))
  with check (public.tem_permissao('fornecedores', 'editar'));

create policy produtos_select on public.produtos for select to authenticated
  using (public.tem_permissao('produtos', 'ler'));
create policy produtos_insert on public.produtos for insert to authenticated
  with check (public.tem_permissao('produtos', 'criar'));
create policy produtos_update on public.produtos for update to authenticated
  using (public.tem_permissao('produtos', 'editar'))
  with check (public.tem_permissao('produtos', 'editar'));

create policy produto_imagens_select on public.produto_imagens for select to authenticated
  using (public.tem_permissao('produtos', 'ler'));
create policy produto_imagens_insert on public.produto_imagens for insert to authenticated
  with check (public.tem_permissao('produtos', 'criar') or public.tem_permissao('produtos', 'editar'));
create policy produto_imagens_update on public.produto_imagens for update to authenticated
  using (public.tem_permissao('produtos', 'editar')) with check (public.tem_permissao('produtos', 'editar'));
create policy produto_imagens_delete on public.produto_imagens for delete to authenticated
  using (public.tem_permissao('produtos', 'editar'));

-- ---------------------------------------------------------------------
-- Storage: imagens de produtos (leitura pública, gravação restrita)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy produtos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'produtos');
create policy produtos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos'
              and (public.tem_permissao('produtos', 'criar') or public.tem_permissao('produtos', 'editar')));
create policy produtos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.tem_permissao('produtos', 'editar'));

-- ---------------------------------------------------------------------
-- Dados de referência
-- ---------------------------------------------------------------------
insert into public.unidades (codigo, descricao, casas_decimais) values
  ('M2', 'Metro quadrado', 2),
  ('CX', 'Caixa', 0),
  ('PC', 'Peça', 0),
  ('UN', 'Unidade', 0),
  ('SC', 'Saco', 0),
  ('KG', 'Quilograma', 3),
  ('M', 'Metro linear', 2),
  ('L', 'Litro', 3),
  ('GL', 'Galão', 0),
  ('BD', 'Balde', 0);

insert into public.categorias (nome, revestimento) values
  ('Porcelanato', true),
  ('Cerâmica', true),
  ('Revestimento de parede', true),
  ('Argamassa', false),
  ('Rejunte', false),
  ('Material de construção', false);
