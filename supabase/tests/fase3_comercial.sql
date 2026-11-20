-- =====================================================================
-- Testes comerciais (Fase 3). Executar após as migrações e após criar o
-- primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "FASE 3: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_cat uuid;
  v_prod uuid;
  v_lote uuid;
  v_dep uuid;
  v_cli uuid;
  v_orc uuid;
  v_venda uuid;
  v_item record;
  v_saldo public.estoque_saldos%rowtype;
  r record;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id into v_cat from public.categorias where nome = 'Porcelanato';
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa)
  values ('T3-PORC', 'Porcelanato teste F3', v_cat, 'M2', 89.90, true, 4, 1.44) returning id into v_prod;
  insert into public.lotes (produto_id, codigo, tonalidade, calibre) values (v_prod, 'F3L1', 'A', '1') returning id into v_lote;
  select id into v_dep from public.depositos where padrao;
  perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_prod,'lote_id',v_lote,
    'quantidade','28.8','deposito_destino_id',v_dep));
  insert into public.clientes (tipo_pessoa, nome) values ('PF', 'Cliente teste F3') returning id into v_cli;

  -- 1. Cálculo: 20 m² + 10% sobra, caixa 1,44 → 16 cx, 23,04 m², R$ 2071,30 − 5% = 1967,73
  select * into r from public.calcular_item_comercial(jsonb_build_object(
    'produto_id', v_prod, 'area_m2', '20', 'perc_sobra', '10', 'preco_unitario', '89.90', 'desconto_perc', '5'));
  assert r.caixas = 16 and r.quantidade = 23.04, 'FALHA 1: caixas/m²';
  assert r.valor_bruto = 2071.30 and r.valor_desconto = 103.57 and r.valor_total = 1967.73, 'FALHA 1: valores';

  -- 2. Orçamento: totais recalculados no servidor
  v_orc := public.salvar_orcamento(
    jsonb_build_object('cliente_id', v_cli, 'frete', '50'),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'area_m2', '20', 'perc_sobra', '10',
                                         'preco_unitario', '89.90', 'desconto_perc', '0', 'valor_total', '1')));
  assert (select total from public.orcamentos where id = v_orc) = 2121.30, 'FALHA 2: total do orçamento';

  -- 3. Orçamento sem cliente cadastrado não pode ser aprovado
  begin
    perform public.alterar_status_orcamento(public.salvar_orcamento(
      jsonb_build_object('cliente_nome', 'Avulso'),
      jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '1.44', 'preco_unitario', '10'))), 'aprovado');
    raise exception 'FALHA 3';
  exception when sqlstate 'P0001' then null;
  end;

  -- 4. Aprovar e converter (idempotente)
  perform public.alterar_status_orcamento(v_orc, 'aprovado');
  v_venda := public.converter_orcamento_em_venda(v_orc);
  assert public.converter_orcamento_em_venda(v_orc) = v_venda, 'FALHA 4: conversão duplicada';

  -- 5. Confirmar sem pagamento fechando o total falha
  update public.venda_itens set lote_id = v_lote, deposito_id = v_dep where venda_id = v_venda;
  begin
    perform public.confirmar_venda(v_venda);
    raise exception 'FALHA 5';
  exception when sqlstate 'P0001' then null;
  end;

  -- 6. Pagamento misto fechando o total → confirma e reserva o lote
  insert into public.venda_pagamentos (venda_id, forma, valor) values (v_venda, 'pix', 1000), (v_venda, 'cartao_credito', 1121.30);
  update public.venda_pagamentos set parcelas = 3 where venda_id = v_venda and forma = 'cartao_credito';
  perform public.confirmar_venda(v_venda);
  perform public.confirmar_venda(v_venda); -- idempotente
  select * into v_saldo from public.estoque_saldos where lote_id = v_lote and deposito_id = v_dep;
  assert v_saldo.quantidade_fisica = 28.8 and v_saldo.quantidade_reservada = 23.04, 'FALHA 6: reserva';
  assert (select count(*) from public.estoque_reservas where documento_id = v_venda::text and status = 'ativa') = 1,
    'FALHA 6: reserva duplicada';

  -- 7. Venda confirmada não pode ser editada
  begin
    perform public.salvar_venda(jsonb_build_object('id', v_venda, 'cliente_id', v_cli),
      jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '1.44', 'preco_unitario', '1')), '[]');
    raise exception 'FALHA 7';
  exception when sqlstate 'P0001' then null;
  end;

  -- 8. Cancelar libera a reserva
  perform public.cancelar_venda(v_venda, 'Teste de cancelamento');
  select * into v_saldo from public.estoque_saldos where lote_id = v_lote and deposito_id = v_dep;
  assert v_saldo.quantidade_reservada = 0, 'FALHA 8: reserva não liberada';

  raise notice 'FASE 3: TODOS OS TESTES PASSARAM';
end $$;

rollback;
