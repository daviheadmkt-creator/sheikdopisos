-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 1 / Parte 1: base, segurança e auditoria
-- Empresas, usuários, perfis, permissões, auditoria e funções utilitárias
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------

-- Atualiza updated_at / updated_by e carimba created_by
create or replace function public.fn_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Validação de CPF (somente dígitos)
create or replace function public.valida_cpf(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
begin
  if length(d) <> 11 or d = repeat(substr(d, 1, 1), 11) then
    return false;
  end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end;
$$;

-- Validação de CNPJ numérico e alfanumérico (IN RFB 2.229/2024, vigente desde jul/2026).
-- Formato normalizado: 12 caracteres [0-9A-Z] + 2 dígitos verificadores.
create or replace function public.valida_cnpj(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; i int;
begin
  if d !~ '^[0-9A-Z]{12}[0-9]{2}$' or d = repeat(substr(d, 1, 1), 14) then
    return false;
  end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(d, i, 1)) - 48) * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> substr(d, 13, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(d, i, 1)) - 48) * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = substr(d, 14, 1)::int;
end;
$$;

-- ---------------------------------------------------------------------
-- Empresa (dados cadastrais da loja — configurados na Tela 12)
-- ---------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text unique check (cnpj is null or public.valida_cnpj(cnpj)),
  inscricao_estadual text,
  telefone text,
  whatsapp text,
  email text,
  cep text check (cep is null or cep ~ '^\d{8}$'),
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Usuários, perfis e permissões
-- ---------------------------------------------------------------------
create type public.acao_permissao as enum ('ler', 'criar', 'editar', 'aprovar', 'cancelar', 'exportar');

create table public.modulos (
  codigo text primary key,
  nome text not null,
  ordem int not null default 0
);

create table public.perfis (
  codigo text primary key check (codigo ~ '^[a-z_]{3,30}$'),
  nome text not null,
  descricao text,
  sistema boolean not null default true
);

create table public.perfil_permissoes (
  perfil text not null references public.perfis(codigo) on delete cascade,
  modulo text not null references public.modulos(codigo) on delete cascade,
  acao public.acao_permissao not null,
  primary key (perfil, modulo, acao)
);

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  email text not null unique,
  telefone text,
  ativo boolean not null default true,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.usuario_perfis (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  perfil text not null references public.perfis(codigo) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (usuario_id, perfil)
);
create index usuario_perfis_perfil_idx on public.usuario_perfis(perfil);

-- ---------------------------------------------------------------------
-- Funções de autorização (usadas nas políticas RLS e pelo frontend)
-- ---------------------------------------------------------------------
create or replace function public.usuario_eh_admin(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario_perfis up
    join public.usuarios u on u.id = up.usuario_id
    where up.usuario_id = p_usuario and up.perfil = 'administrador' and u.ativo
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_eh_admin(auth.uid());
$$;

create or replace function public.tem_permissao(p_modulo text, p_acao public.acao_permissao)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.usuario_perfis up
    join public.usuarios u on u.id = up.usuario_id
    join public.perfil_permissoes pp on pp.perfil = up.perfil
    where up.usuario_id = auth.uid()
      and u.ativo
      and pp.modulo = p_modulo
      and pp.acao = p_acao
  );
$$;

create or replace function public.minhas_permissoes()
returns table (modulo text, acao public.acao_permissao)
language sql
stable
security definer
set search_path = ''
as $$
  select m.codigo, a.acao
  from public.modulos m
  cross join unnest(enum_range(null::public.acao_permissao)) as a(acao)
  where public.is_admin()
  union
  select pp.modulo, pp.acao
  from public.perfil_permissoes pp
  join public.usuario_perfis up on up.perfil = pp.perfil
  join public.usuarios u on u.id = up.usuario_id
  where up.usuario_id = auth.uid() and u.ativo;
$$;

-- Registra último acesso do usuário autenticado
create or replace function public.registrar_acesso()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usuarios set ultimo_acesso = now() where id = auth.uid();
$$;

-- Lista mínima (id e nome) de vendedores para o campo "vendedor responsável".
-- Evita expor e-mail/telefone de colaboradores a quem só precisa do nome (LGPD).
create or replace function public.listar_vendedores()
returns table (id uuid, nome text, ativo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.id, u.nome, u.ativo
  from public.usuarios u
  join public.usuario_perfis up on up.usuario_id = u.id
  where up.perfil in ('vendedor', 'gerente', 'administrador')
    and (public.tem_permissao('clientes', 'ler') or public.tem_permissao('usuarios', 'ler'))
  order by u.nome;
$$;

revoke execute on function public.listar_vendedores() from public, anon;
grant execute on function public.listar_vendedores() to authenticated;
revoke execute on function public.usuario_eh_admin(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.tem_permissao(text, public.acao_permissao) from public, anon;
revoke execute on function public.minhas_permissoes() from public, anon;
revoke execute on function public.registrar_acesso() from public, anon;
grant execute on function public.usuario_eh_admin(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.tem_permissao(text, public.acao_permissao) to authenticated;
grant execute on function public.minhas_permissoes() to authenticated;
grant execute on function public.registrar_acesso() to authenticated;

-- ---------------------------------------------------------------------
-- Criação automática do registro em public.usuarios
-- O PRIMEIRO usuário criado no projeto torna-se Administrador.
-- ---------------------------------------------------------------------
create or replace function public.fn_novo_usuario_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tem_admin boolean;
begin
  insert into public.usuarios (id, nome, email, created_by)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    new.id
  )
  on conflict (id) do nothing;

  select exists (select 1 from public.usuario_perfis where perfil = 'administrador') into v_tem_admin;
  if not v_tem_admin then
    insert into public.usuario_perfis (usuario_id, perfil, created_by)
    values (new.id, 'administrador', new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_novo_usuario_auth();

-- Impede remover/desativar o último administrador ativo
create or replace function public.fn_protege_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo uuid;
  v_restantes int;
begin
  if tg_table_name = 'usuario_perfis' then
    if old.perfil <> 'administrador' then return old; end if;
    v_alvo := old.usuario_id;
  else
    if not (old.ativo and not new.ativo) then return new; end if;
    if not public.usuario_eh_admin(old.id) then return new; end if;
    v_alvo := old.id;
  end if;

  select count(*) into v_restantes
  from public.usuario_perfis up
  join public.usuarios u on u.id = up.usuario_id
  where up.perfil = 'administrador' and u.ativo and up.usuario_id <> v_alvo;

  if v_restantes = 0 then
    raise exception 'Não é permitido remover ou desativar o último administrador ativo.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_protege_ultimo_admin_perfil
  before delete on public.usuario_perfis
  for each row execute function public.fn_protege_ultimo_admin();

create trigger trg_protege_ultimo_admin_usuario
  before update of ativo on public.usuarios
  for each row execute function public.fn_protege_ultimo_admin();

-- ---------------------------------------------------------------------
-- Auditoria (imutável: sem políticas de INSERT/UPDATE/DELETE para clientes)
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antigos jsonb,
  dados_novos jsonb,
  alterado_por uuid,
  alterado_em timestamptz not null default now()
);
create index auditoria_registro_idx on public.auditoria(tabela, registro_id, alterado_em desc);
create index auditoria_data_idx on public.auditoria(alterado_em desc);

create or replace function public.fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  -- Ignora UPDATE sem mudança real (exceto carimbos de data)
  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'updated_by' - 'ultimo_acesso')
       = (v_new - 'updated_at' - 'updated_by' - 'ultimo_acesso') then
    return new;
  end if;

  insert into public.auditoria (tabela, registro_id, operacao, dados_antigos, dados_novos, alterado_por)
  values (
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'codigo', v_old ->> 'codigo',
             concat_ws(':', coalesce(v_new, v_old) ->> 'usuario_id', coalesce(v_new, v_old) ->> 'perfil',
                       coalesce(v_new, v_old) ->> 'modulo', coalesce(v_new, v_old) ->> 'acao')),
    tg_op,
    v_old,
    v_new,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers de carimbo e auditoria
-- ---------------------------------------------------------------------
create trigger trg_carimbo before insert or update on public.empresas
  for each row execute function public.fn_carimbo();
create trigger trg_carimbo before insert or update on public.usuarios
  for each row execute function public.fn_carimbo();

create trigger trg_auditoria after insert or update or delete on public.empresas
  for each row execute function public.fn_auditoria();
create trigger trg_auditoria after insert or update or delete on public.usuarios
  for each row execute function public.fn_auditoria();
create trigger trg_auditoria after insert or update or delete on public.usuario_perfis
  for each row execute function public.fn_auditoria();
create trigger trg_auditoria after insert or update or delete on public.perfil_permissoes
  for each row execute function public.fn_auditoria();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.empresas enable row level security;
alter table public.modulos enable row level security;
alter table public.perfis enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuario_perfis enable row level security;
alter table public.auditoria enable row level security;

create policy empresas_select on public.empresas for select to authenticated using (true);
create policy empresas_update on public.empresas for update to authenticated
  using (public.tem_permissao('configuracoes', 'editar'))
  with check (public.tem_permissao('configuracoes', 'editar'));

create policy modulos_select on public.modulos for select to authenticated using (true);
create policy perfis_select on public.perfis for select to authenticated using (true);

create policy perfil_permissoes_select on public.perfil_permissoes for select to authenticated using (true);
create policy perfil_permissoes_insert on public.perfil_permissoes for insert to authenticated
  with check (public.is_admin() and perfil <> 'administrador');
create policy perfil_permissoes_delete on public.perfil_permissoes for delete to authenticated
  using (public.is_admin() and perfil <> 'administrador');

create policy usuarios_select on public.usuarios for select to authenticated
  using (id = auth.uid() or public.tem_permissao('usuarios', 'ler'));
create policy usuarios_update on public.usuarios for update to authenticated
  using (public.tem_permissao('usuarios', 'editar') and (public.is_admin() or not public.usuario_eh_admin(id)))
  with check (public.tem_permissao('usuarios', 'editar'));

create policy usuario_perfis_select on public.usuario_perfis for select to authenticated
  using (usuario_id = auth.uid() or public.tem_permissao('usuarios', 'ler'));
create policy usuario_perfis_insert on public.usuario_perfis for insert to authenticated
  with check (
    public.tem_permissao('usuarios', 'editar')
    and (perfil <> 'administrador' or public.is_admin())
    and (public.is_admin() or not public.usuario_eh_admin(usuario_id))
  );
create policy usuario_perfis_delete on public.usuario_perfis for delete to authenticated
  using (
    public.tem_permissao('usuarios', 'editar')
    and (perfil <> 'administrador' or public.is_admin())
    and (public.is_admin() or not public.usuario_eh_admin(usuario_id))
  );

create policy auditoria_select on public.auditoria for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Dados de referência (não são dados fictícios: são a estrutura do sistema)
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, ordem) values
  ('dashboard', 'Dashboard', 1),
  ('orcamentos', 'Orçamentos', 2),
  ('vendas', 'Vendas', 3),
  ('clientes', 'Clientes', 4),
  ('produtos', 'Produtos', 5),
  ('estoque', 'Estoque', 6),
  ('movimentacoes', 'Movimentações de Estoque', 7),
  ('lotes', 'Lotes e Tonalidades', 8),
  ('inventario', 'Inventário', 9),
  ('fornecedores', 'Fornecedores', 10),
  ('compras', 'Compras', 11),
  ('financeiro', 'Financeiro', 12),
  ('contas', 'Contas a Pagar e Receber', 13),
  ('caixa', 'Caixa', 14),
  ('separacao', 'Separação de Pedidos', 15),
  ('entregas', 'Entregas', 16),
  ('relatorios', 'Relatórios', 17),
  ('usuarios', 'Usuários e Permissões', 18),
  ('configuracoes', 'Configurações', 19);

insert into public.perfis (codigo, nome, descricao) values
  ('administrador', 'Administrador', 'Acesso total ao sistema, incluindo usuários, permissões e auditoria.'),
  ('gerente', 'Gerente', 'Gestão da loja: aprova operações e acessa todos os módulos operacionais.'),
  ('vendedor', 'Vendedor', 'Atendimento, clientes, orçamentos e vendas.'),
  ('estoquista', 'Estoquista', 'Estoque, lotes, inventário e separação.'),
  ('comprador', 'Comprador', 'Fornecedores, cotações, pedidos de compra e recebimentos.'),
  ('financeiro', 'Financeiro', 'Contas a pagar e receber, caixa e fluxo de caixa.'),
  ('logistica', 'Logística', 'Separação, agenda e execução de entregas.');

-- Matriz padrão (editável pelo Administrador na Tela 11)
insert into public.perfil_permissoes (perfil, modulo, acao)
select p.perfil, m.modulo, a.acao::public.acao_permissao
from (values
  ('gerente',
    array['dashboard','orcamentos','vendas','clientes','produtos','estoque','movimentacoes','lotes','inventario',
          'fornecedores','compras','financeiro','contas','caixa','separacao','entregas','relatorios']::text[],
    array['ler','criar','editar','aprovar','cancelar','exportar']::text[]),
  ('gerente', array['usuarios','configuracoes']::text[], array['ler']::text[]),
  ('vendedor', array['dashboard','produtos','estoque','lotes','entregas']::text[], array['ler']::text[]),
  ('vendedor', array['clientes']::text[], array['ler','criar','editar']::text[]),
  ('vendedor', array['orcamentos','vendas']::text[], array['ler','criar','editar','exportar']::text[]),
  ('estoquista', array['dashboard','fornecedores','compras','vendas']::text[], array['ler']::text[]),
  ('estoquista', array['produtos','estoque','movimentacoes','lotes','inventario','separacao']::text[],
    array['ler','criar','editar']::text[]),
  ('comprador', array['dashboard','estoque','lotes','movimentacoes']::text[], array['ler']::text[]),
  ('comprador', array['produtos']::text[], array['ler','criar','editar']::text[]),
  ('comprador', array['fornecedores','compras']::text[], array['ler','criar','editar','cancelar','exportar']::text[]),
  ('comprador', array['relatorios']::text[], array['ler','exportar']::text[]),
  ('financeiro', array['dashboard','clientes','fornecedores','vendas','compras','produtos']::text[], array['ler']::text[]),
  ('financeiro', array['financeiro','contas','caixa']::text[], array['ler','criar','editar','aprovar','cancelar','exportar']::text[]),
  ('financeiro', array['relatorios']::text[], array['ler','exportar']::text[]),
  ('logistica', array['dashboard','clientes','vendas','produtos','estoque','lotes']::text[], array['ler']::text[]),
  ('logistica', array['separacao']::text[], array['ler','editar']::text[]),
  ('logistica', array['entregas']::text[], array['ler','criar','editar','cancelar','exportar']::text[])
) as p(perfil, modulos, acoes)
cross join lateral unnest(p.modulos) as m(modulo)
cross join lateral unnest(p.acoes) as a(acao)
on conflict do nothing;

insert into public.empresas (razao_social, nome_fantasia) values ('SHEIK DOS PISOS', 'SHEIK DOS PISOS');
