-- =====================================================================
-- Fase 8 (complemento): funções do schema public não ficam executáveis via PUBLIC.
-- O PostgreSQL concede EXECUTE a PUBLIC ao criar funções; isso permitia que visitantes
-- (anon) executassem validadores e checagens de permissão. Usuários logados mantêm as
-- concessões explícitas que já possuíam.
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as funcao
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype <> 'trigger'::regtype
      and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  loop
    execute format('revoke execute on function %s from public', r.funcao);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public;
