-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 8: segurança, otimização e configurações
-- Correções da auditoria do banco em produção:
--  1. Fuso horário do banco em America/Sao_Paulo (datas, vencimentos e DRE corretos à noite).
--  2. Políticas RLS avaliando funções de permissão UMA vez por consulta: (select fn(...)).
--  3. Visitantes (anon) sem permissão de executar funções do schema public.
--  4. Visão interna com security_invoker.
--  5. Índices em todas as chaves estrangeiras sem índice.
--  6. Proteção de leitura em saldo_conta.
--  7. Condições de pagamento padronizadas (Tela 12 — Configurações).
-- =====================================================================

-- 1. Fuso horário (vale para novas conexões; timestamptz armazenados não mudam)
do $$ begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Sao_Paulo');
end $$;
set timezone to 'America/Sao_Paulo';

-- 2. Políticas: (select fn(...)) é avaliado uma vez por consulta (initPlan), não por linha
do $$
declare
  r record;
  v_qual text;
  v_check text;
  padrao constant text := '(public\.)?(tem_permissao|is_admin|pode_ler_estoque|pode_ler_financeiro|pode_ler_logistica)\(([^()]*)\)';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and policyname in ('produtos_storage_select', 'produtos_storage_insert', 'produtos_storage_delete',
                                                     'comprovantes_select', 'comprovantes_insert'))
  loop
    v_qual := regexp_replace(r.qual, padrao, '(select public.\2(\3))', 'g');
    v_check := regexp_replace(r.with_check, padrao, '(select public.\2(\3))', 'g');
    if v_qual is distinct from r.qual or v_check is distinct from r.with_check then
      execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
        case when r.qual is not null then 'using (' || v_qual || ')' else '' end,
        case when r.with_check is not null then 'with check (' || v_check || ')' else '' end);
    end if;
  end loop;
end $$;

-- 3. Visitantes não executam funções do sistema (login é feito pelo serviço de autenticação)
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 4. Visão interna
alter view public._vendas_faturadas set (security_invoker = true);

-- 5. Índices para chaves estrangeiras sem índice (joins e exclusões mais rápidos)
do $$
declare r record;
begin
  for r in
    select con.conrelid::regclass as tabela, a.attname as coluna, c.relname as nome_tabela
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and con.connamespace = 'public'::regnamespace and array_length(con.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', left('ix_' || r.nome_tabela || '_' || r.coluna, 63), r.tabela, r.coluna);
  end loop;
end $$;

-- 6. Saldo de conta só para quem pode ler o financeiro (ou opera o caixa)
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
  from public.contas_financeiras c
  where c.id = p_conta and (auth.uid() is null or public.pode_ler_financeiro());
$$;

-- 7. Condições de pagamento padronizadas
create table public.condicoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) >= 2),
  parcelas int not null default 1 check (parcelas between 1 and 48),
  primeiro_vencimento_dias int not null default 0 check (primeiro_vencimento_dias between 0 and 365),
  intervalo_dias int not null default 30 check (intervalo_dias between 1 and 120),
  uso text not null default 'ambos' check (uso in ('vendas', 'compras', 'ambos')),
  ativo boolean not null default true
);
create trigger trg_auditoria after insert or update or delete on public.condicoes_pagamento
  for each row execute function public.fn_auditoria();
alter table public.condicoes_pagamento enable row level security;
create policy condicoes_select on public.condicoes_pagamento for select to authenticated using (true);
create policy condicoes_insert on public.condicoes_pagamento for insert to authenticated
  with check ((select public.tem_permissao('configuracoes', 'editar')));
create policy condicoes_update on public.condicoes_pagamento for update to authenticated
  using ((select public.tem_permissao('configuracoes', 'editar'))) with check ((select public.tem_permissao('configuracoes', 'editar')));

insert into public.condicoes_pagamento (nome, parcelas, primeiro_vencimento_dias, intervalo_dias, uso) values
  ('À vista', 1, 0, 30, 'ambos'),
  ('30 dias', 1, 30, 30, 'ambos'),
  ('30/60', 2, 30, 30, 'ambos'),
  ('30/60/90', 3, 30, 30, 'ambos'),
  ('28/56/84', 3, 28, 28, 'compras');
