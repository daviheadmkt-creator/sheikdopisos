-- =====================================================================
-- Testes de compras (Fase 4). Executar após as migrações e após criar o
-- primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "FASE 4: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_cat uuid;
  v_prod uuid;
  v_forn uuid;
  v_forn2 uuid;
  v_dep uuid;
  v_ped uuid;
  v_item uuid;
  v_rec uuid;
  v_rec2 uuid;
  v_cot uuid;
  v_n int;
  v_fisico numeric;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id into v_cat from public.categorias where nome = 'Porcelanato';
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, custo, eh_revestimento, pecas_por_caixa, m2_por_caixa)
  values ('T4-PORC', 'Porcelanato teste F4', v_cat, 'M2', 99.90, 0, true, 4, 1.44) returning id into v_prod;
  v_forn := public.salvar_fornecedor(jsonb_build_object('razao_social', 'Fornecedor Teste A', 'cnpj', '11222333000181'),
    jsonb_build_array(jsonb_build_object('nome', 'Ana', 'principal', true)));
  v_forn2 := public.salvar_fornecedor(jsonb_build_object('razao_social', 'Fornecedor Teste B'), '[]');
  select id into v_dep from public.depositos where padrao;

  -- 1. Pedido: totais calculados no servidor (144 m² × 40,00 − 0% + frete 100)
  v_ped := public.salvar_pedido_compra(
    jsonb_build_object('fornecedor_id', v_forn, 'frete', '100', 'deposito_destino_id', v_dep),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '144', 'custo_unitario', '40')));
  assert (select total from public.compras_pedidos where id = v_ped) = 5860.00, 'FALHA 1: total do pedido';
  select id into v_item from public.compras_pedido_itens where pedido_id = v_ped;

  -- 2. Recebimento exige pedido aprovado
  begin
    perform public.salvar_recebimento(jsonb_build_object('pedido_id', v_ped, 'deposito_id', v_dep),
      jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', '72', 'lote_codigo', 'LA')));
    raise exception 'FALHA 2';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.aprovar_pedido_compra(v_ped);

  -- 3. Conferência NÃO altera estoque
  v_rec := public.salvar_recebimento(jsonb_build_object('pedido_id', v_ped, 'deposito_id', v_dep, 'nota_fiscal', '123'),
    jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', '72', 'lote_codigo', 'LA', 'tonalidade', 'T1', 'calibre', 'C1')));
  select coalesce(sum(quantidade_fisica), 0) into v_fisico from public.estoque_saldos where produto_id = v_prod;
  assert v_fisico = 0, 'FALHA 3: conferência alterou o estoque';

  -- 4. Confirmação: entrada parcial, lote criado, custo médio, idempotência
  v_n := public.confirmar_recebimento(v_rec);
  assert v_n = 1, 'FALHA 4a';
  assert public.confirmar_recebimento(v_rec) = 0, 'FALHA 4b: confirmação duplicada';
  select coalesce(sum(quantidade_fisica), 0) into v_fisico from public.estoque_saldos where produto_id = v_prod;
  assert v_fisico = 72, 'FALHA 4c: entrada no estoque';
  assert (select status from public.compras_pedidos where id = v_ped) = 'parcialmente_recebido', 'FALHA 4d';
  assert (select custo from public.produtos where id = v_prod) = 40, 'FALHA 4e: custo';
  assert exists (select 1 from public.lotes where produto_id = v_prod and codigo = 'LA' and tonalidade = 'T1'), 'FALHA 4f: lote';

  -- 5. Não recebe acima do pendente
  v_rec2 := public.salvar_recebimento(jsonb_build_object('pedido_id', v_ped, 'deposito_id', v_dep),
    jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', '100', 'lote_codigo', 'LB')));
  begin
    perform public.confirmar_recebimento(v_rec2);
    raise exception 'FALHA 5';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.cancelar_recebimento(v_rec2, 'Quantidade incorreta');

  -- 6. Segundo recebimento com custo diferente → custo médio ponderado e pedido recebido
  update public.compras_pedido_itens set custo_unitario = 46 where id = v_item; -- (simula renegociação; via SQL direto)
  v_rec2 := public.salvar_recebimento(jsonb_build_object('pedido_id', v_ped, 'deposito_id', v_dep),
    jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', '72', 'lote_codigo', 'LA', 'tonalidade', 'T1', 'calibre', 'C1')));
  perform public.confirmar_recebimento(v_rec2);
  assert (select custo from public.produtos where id = v_prod) = 43, 'FALHA 6a: custo médio (72×40 + 72×46)/144 = 43';
  assert (select status from public.compras_pedidos where id = v_ped) = 'recebido', 'FALHA 6b';
  assert (select count(*) from public.estoque_movimentacoes where documento_tipo = 'compra' and documento_id = v_ped::text) = 2,
    'FALHA 6c: movimentações de compra';

  -- 7. Cotação: vencedor por item gera pedido
  v_cot := public.salvar_cotacao(jsonb_build_object('descricao', 'Cotação teste'),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '28.8', 'fornecedor_vencedor_id', v_forn2)),
    jsonb_build_array(
      jsonb_build_object('fornecedor_id', v_forn, 'precos', jsonb_build_object('1', '45')),
      jsonb_build_object('fornecedor_id', v_forn2, 'precos', jsonb_build_object('1', '41.5'))));
  v_n := public.finalizar_cotacao(v_cot);
  assert v_n = 1, 'FALHA 7a';
  assert (select total from public.compras_pedidos where cotacao_id = v_cot and fornecedor_id = v_forn2) = 1195.20, 'FALHA 7b';

  raise notice 'FASE 4: TODOS OS TESTES PASSARAM';
end $$;

rollback;
