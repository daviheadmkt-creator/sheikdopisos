-- =====================================================================
-- Testes de regras de estoque (Fase 2). Executar no SQL Editor após as
-- migrações e após criar o primeiro usuário (administrador).
-- Roda em transação com ROLLBACK: nenhum dado permanece.
-- Resultado esperado: "FASE 2: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_cat uuid;
  v_prod uuid;
  v_simples uuid;
  v_lote_a uuid;
  v_lote_b uuid;
  v_dep uuid;
  v_dep2 uuid;
  v_loc uuid;
  v_mov uuid;
  v_mov2 uuid;
  v_res uuid;
  v_inv uuid;
  v_item uuid;
  v_saldo public.estoque_saldos%rowtype;
  v_qtd numeric;
  v_n int;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then
    raise exception 'Crie o primeiro usuário (administrador) antes de rodar este teste';
  end if;
  -- Simula a sessão do administrador (auth.uid())
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id into v_cat from public.categorias where nome = 'Porcelanato';
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa)
  values ('TESTE-PORC', 'Porcelanato teste', v_cat, 'M2', 99.90, true, 4, 1.44) returning id into v_prod;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda)
  select 'TESTE-ARG', 'Argamassa teste', id, 'SC', 30 from public.categorias where nome = 'Argamassa'
  returning id into v_simples;

  insert into public.lotes (produto_id, codigo, tonalidade, calibre) values (v_prod, 'L1', 'T1', 'C1') returning id into v_lote_a;
  insert into public.lotes (produto_id, codigo, tonalidade, calibre) values (v_prod, 'L2', 'T2', 'C1') returning id into v_lote_b;
  insert into public.depositos (codigo, nome) values ('TST1', 'Teste 1') returning id into v_dep;
  insert into public.depositos (codigo, nome) values ('TST2', 'Teste 2') returning id into v_dep2;
  insert into public.localizacoes (deposito_id, codigo) values (v_dep, 'A-01') returning id into v_loc;

  -- 1. Revestimento sem lote é rejeitado
  begin
    perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_prod,'quantidade','14.4','deposito_destino_id',v_dep));
    raise exception 'FALHA 1';
  exception when sqlstate '22023' then null;
  end;

  -- 2. Entrada com lote (10 caixas × 1,44 = 14,4 m²)
  v_mov := public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_prod,'lote_id',v_lote_a,
    'quantidade','14.4','deposito_destino_id',v_dep,'localizacao_destino_id',v_loc,'chave_idempotencia','t-entrada-1'));
  select * into v_saldo from public.estoque_saldos where produto_id = v_prod and lote_id = v_lote_a;
  assert v_saldo.quantidade_fisica = 14.4, 'FALHA 2: físico após entrada';

  -- 3. Idempotência: mesma chave não duplica
  v_mov2 := public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_prod,'lote_id',v_lote_a,
    'quantidade','14.4','deposito_destino_id',v_dep,'localizacao_destino_id',v_loc,'chave_idempotencia','t-entrada-1'));
  assert v_mov = v_mov2, 'FALHA 3: idempotência retornou outro id';
  select quantidade_fisica into v_qtd from public.estoque_saldos where id = v_saldo.id;
  assert v_qtd = 14.4, 'FALHA 3: idempotência duplicou saldo';

  -- 4. Unidade inteira rejeita fração
  begin
    perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_simples,'quantidade','1.5','deposito_destino_id',v_dep));
    raise exception 'FALHA 4';
  exception when sqlstate '22023' then null;
  end;

  -- 5. Reserva não reduz o físico
  v_res := public.reservar_estoque(jsonb_build_object('produto_id',v_prod,'lote_id',v_lote_a,'deposito_id',v_dep,
    'localizacao_id',v_loc,'quantidade','5.76','chave_idempotencia','t-res-1'));
  select * into v_saldo from public.estoque_saldos where id = v_saldo.id;
  assert v_saldo.quantidade_fisica = 14.4 and v_saldo.quantidade_reservada = 5.76
     and v_saldo.quantidade_disponivel = 8.64, 'FALHA 5: reserva alterou físico ou disponível incorreto';

  -- 6. Saída sem reserva acima do disponível é bloqueada (estoque nunca negativo)
  begin
    perform public.registrar_movimentacao(jsonb_build_object('tipo','saida','produto_id',v_prod,'lote_id',v_lote_a,
      'quantidade','10','deposito_origem_id',v_dep,'localizacao_origem_id',v_loc));
    raise exception 'FALHA 6';
  exception when sqlstate 'P0001' then null;
  end;

  -- 7. Saída com reserva consome reserva e físico na mesma transação
  perform public.registrar_movimentacao(jsonb_build_object('tipo','saida','produto_id',v_prod,'lote_id',v_lote_a,
    'quantidade','5.76','deposito_origem_id',v_dep,'localizacao_origem_id',v_loc,'reserva_id',v_res));
  select * into v_saldo from public.estoque_saldos where id = v_saldo.id;
  assert v_saldo.quantidade_fisica = 8.64 and v_saldo.quantidade_reservada = 0, 'FALHA 7: consumo de reserva';
  assert (select status from public.estoque_reservas where id = v_res) = 'consumida', 'FALHA 7: status da reserva';

  -- 8. Transferência entre depósitos
  perform public.registrar_movimentacao(jsonb_build_object('tipo','transferencia','produto_id',v_prod,'lote_id',v_lote_a,
    'quantidade','2.88','deposito_origem_id',v_dep,'localizacao_origem_id',v_loc,'deposito_destino_id',v_dep2));
  select quantidade_fisica into v_qtd from public.estoque_saldos where produto_id = v_prod and deposito_id = v_dep2;
  assert v_qtd = 2.88, 'FALHA 8: transferência';

  -- 9. Avaria reduz o disponível sem reduzir o físico; baixa reduz ambos
  perform public.registrar_movimentacao(jsonb_build_object('tipo','avaria','produto_id',v_prod,'lote_id',v_lote_a,
    'quantidade','1.44','deposito_origem_id',v_dep,'localizacao_origem_id',v_loc,'motivo','Peça quebrada'));
  select * into v_saldo from public.estoque_saldos where id = v_saldo.id;
  assert v_saldo.quantidade_fisica = 5.76 and v_saldo.quantidade_disponivel = 4.32, 'FALHA 9: avaria';
  perform public.registrar_movimentacao(jsonb_build_object('tipo','baixa_avaria','produto_id',v_prod,'lote_id',v_lote_a,
    'quantidade','1.44','deposito_origem_id',v_dep,'localizacao_origem_id',v_loc,'motivo','Descarte'));
  select * into v_saldo from public.estoque_saldos where id = v_saldo.id;
  assert v_saldo.quantidade_fisica = 4.32 and v_saldo.quantidade_avariada = 0, 'FALHA 9: baixa de avaria';

  -- 10. Movimentações são imutáveis
  begin
    update public.estoque_movimentacoes set quantidade = 1 where id = v_mov;
    raise exception 'FALHA 10';
  exception when sqlstate 'P0001' then null;
  end;

  -- 11. Lotes disponíveis: não mistura lotes
  perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_prod,'lote_id',v_lote_b,
    'quantidade','28.8','deposito_destino_id',v_dep));
  select count(*) into v_n from public.lotes_disponiveis(v_prod, v_dep, 20) where atende_sozinho;
  assert v_n = 1, 'FALHA 11: apenas o lote L2 atende 20 m² sozinho';

  -- 12. Inventário: bloqueia o depósito, ajusta divergências na aprovação
  v_inv := public.abrir_inventario(v_dep, 'Inventário de teste');
  begin
    perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_simples,'quantidade','1','deposito_destino_id',v_dep));
    raise exception 'FALHA 12a';
  exception when sqlstate 'P0001' then null;
  end;
  for v_item in select id from public.inventario_itens where inventario_id = v_inv loop
    perform public.registrar_contagem(v_item,
      case when (select lote_id from public.inventario_itens where id = v_item) = v_lote_b then 27.36
           else (select quantidade_sistema from public.inventario_itens where id = v_item) end);
  end loop;
  perform public.enviar_inventario_revisao(v_inv);
  v_n := public.aprovar_inventario(v_inv);
  assert v_n = 1, 'FALHA 12b: deveria haver exatamente 1 ajuste';
  select sum(quantidade_fisica) into v_qtd from public.estoque_saldos where lote_id = v_lote_b and deposito_id = v_dep;
  assert v_qtd = 27.36, 'FALHA 12c: saldo após ajuste de inventário';
  assert not public.deposito_em_inventario(v_dep), 'FALHA 12d: depósito continua bloqueado';

  -- 13. Usuário anônimo não lê saldos
  perform set_config('request.jwt.claims', '{}', true);
  assert not public.pode_ler_estoque(), 'FALHA 13: sessão sem usuário com acesso ao estoque';

  raise notice 'FASE 2: TODOS OS TESTES PASSARAM';
end $$;

rollback;
