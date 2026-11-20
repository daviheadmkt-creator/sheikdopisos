-- =====================================================================
-- Testes de dashboard e relatórios (Fase 7). Executar após as migrações e
-- após criar o primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "FASE 7: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_cat uuid;
  v_dep uuid;
  v_cli uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_venda uuid;
  v_hoje date := public.hoje();
  v_ind jsonb;
  v_fat_antes numeric;
  v_n int;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_fat_antes := (public.dashboard_indicadores(v_hoje, v_hoje) ->> 'faturamento')::numeric;

  select id into v_cat from public.categorias where nome = 'Argamassa';
  select id into v_dep from public.depositos where padrao;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, custo) values
    ('T7-A', 'Produto A F7', v_cat, 'UN', 100, 60) returning id into v_p1;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, custo) values
    ('T7-B', 'Produto B F7', v_cat, 'UN', 10, 5) returning id into v_p2;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, custo) values
    ('T7-C', 'Produto C F7', v_cat, 'UN', 1, 0.5) returning id into v_p3;
  perform public.registrar_movimentacao(jsonb_build_object('tipo', 'entrada', 'produto_id', p, 'quantidade', '100', 'deposito_destino_id', v_dep))
  from unnest(array[v_p1, v_p2, v_p3]) p;
  insert into public.clientes (tipo_pessoa, nome) values ('PF', 'Cliente F7') returning id into v_cli;

  -- Venda: A = 80 × 100 = 8.000; B = 100 × 15 = 1.500; C = 50 × 1 = 50 → total 9.550
  v_venda := public.salvar_venda(jsonb_build_object('cliente_id', v_cli),
    jsonb_build_array(
      jsonb_build_object('produto_id', v_p1, 'quantidade', '80', 'preco_unitario', '100', 'deposito_id', v_dep),
      jsonb_build_object('produto_id', v_p2, 'quantidade', '100', 'preco_unitario', '15', 'deposito_id', v_dep),
      jsonb_build_object('produto_id', v_p3, 'quantidade', '50', 'preco_unitario', '1', 'deposito_id', v_dep)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', '9550')));
  perform public.confirmar_venda(v_venda);

  -- 1. Dashboard soma a venda de hoje
  v_ind := public.dashboard_indicadores(v_hoje, v_hoje);
  assert (v_ind ->> 'faturamento')::numeric = v_fat_antes + 9550, 'FALHA 1a: faturamento';
  assert (v_ind ->> 'faturamento_hoje')::numeric >= 9550, 'FALHA 1b';
  assert (v_ind ->> 'acesso_financeiro')::boolean, 'FALHA 1c: admin deve ver financeiro';

  -- 2. Curva ABC (válido quando só há estas vendas no dia): A abre com 0% acumulado → classe A;
  --    B abre com 83,8% → classe B; C abre com 99,5% → classe C
  if v_fat_antes = 0 then
    assert (select classe from public.relatorio_curva_abc(v_hoje, v_hoje) where sku = 'T7-A') = 'A', 'FALHA 2a';
    assert (select classe from public.relatorio_curva_abc(v_hoje, v_hoje) where sku = 'T7-B') = 'B', 'FALHA 2b';
    assert (select classe from public.relatorio_curva_abc(v_hoje, v_hoje) where sku = 'T7-C') = 'C', 'FALHA 2c';
  end if;

  -- 3. Produtos: margem calculada com o custo gravado na venda
  assert (select margem from public.relatorio_produtos(v_hoje, v_hoje) where sku = 'T7-A') = 3200, 'FALHA 3: margem (8000 − 80×60)';

  -- 4. Formas de pagamento e aging executam e somam
  select count(*) into v_n from public.relatorio_formas_pagamento(v_hoje, v_hoje) where forma = 'pix';
  assert v_n = 1, 'FALHA 4a';
  assert (select count(*) from public.relatorio_aging('receber')) = 6, 'FALHA 4b: 6 faixas';

  -- 5. Sem sessão não há acesso
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.dashboard_indicadores(v_hoje, v_hoje);
    raise exception 'FALHA 5';
  exception when sqlstate '42501' then null;
  end;

  raise notice 'FASE 7: TODOS OS TESTES PASSARAM';
end $$;

rollback;
