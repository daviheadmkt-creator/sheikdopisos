-- =====================================================================
-- Testes de logística (Fase 6). Executar após as migrações e após criar o
-- primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "FASE 6: TODOS OS TESTES PASSARAM".
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
  v_end uuid;
  v_venda uuid;
  v_ent uuid;
  v_saldo_ent uuid;
  v_item uuid;
  v_item2 uuid;
  v_mot uuid;
  v_vei uuid;
  v_s public.estoque_saldos%rowtype;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id into v_cat from public.categorias where nome = 'Porcelanato';
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa, peso_kg)
  values ('T6-PORC', 'Porcelanato F6', v_cat, 'M2', 80, true, 4, 1.44, 30) returning id into v_prod;
  insert into public.lotes (produto_id, codigo, tonalidade, calibre) values (v_prod, 'F6L', 'A', '1') returning id into v_lote;
  select id into v_dep from public.depositos where padrao;
  perform public.registrar_movimentacao(jsonb_build_object('tipo', 'entrada', 'produto_id', v_prod, 'lote_id', v_lote, 'quantidade', '28.8', 'deposito_destino_id', v_dep));
  insert into public.clientes (tipo_pessoa, nome) values ('PF', 'Cliente F6') returning id into v_cli;
  insert into public.cliente_enderecos (cliente_id, cep, logradouro, numero, bairro, cidade, uf, principal)
  values (v_cli, '01310100', 'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', true) returning id into v_end;

  -- 1. Venda confirmada (entrega) gera entrega aguardando separação; reserva sem baixar físico
  v_venda := public.salvar_venda(jsonb_build_object('cliente_id', v_cli, 'tipo_entrega', 'entrega', 'endereco_entrega_id', v_end),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '14.4', 'preco_unitario', '80', 'lote_id', v_lote, 'deposito_id', v_dep)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', '1152')));
  perform public.confirmar_venda(v_venda);
  select id into v_ent from public.entregas where venda_id = v_venda;
  assert v_ent is not null and (select status from public.entregas where id = v_ent) = 'aguardando_separacao', 'FALHA 1a';
  assert (select cidade from public.entregas where id = v_ent) = 'São Paulo', 'FALHA 1b: endereço copiado';
  select * into v_s from public.estoque_saldos where lote_id = v_lote;
  assert v_s.quantidade_fisica = 28.8 and v_s.quantidade_reservada = 14.4, 'FALHA 1c';

  -- 2. Separação parcial: baixa 7,2 consumindo a reserva e cria entrega com o saldo
  select id into v_item from public.entrega_itens where entrega_id = v_ent;
  v_saldo_ent := public.concluir_separacao(v_ent, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_separada', '7.2', 'conferido', true)));
  assert v_saldo_ent is not null, 'FALHA 2a: saldo não gerou nova entrega';
  select * into v_s from public.estoque_saldos where lote_id = v_lote;
  assert v_s.quantidade_fisica = 21.6 and v_s.quantidade_reservada = 7.2, 'FALHA 2b: baixa/reserva';
  assert (select quantidade from public.entrega_itens where entrega_id = v_saldo_ent) = 7.2, 'FALHA 2c';

  -- 3. Concluir de novo não baixa em dobro
  perform public.concluir_separacao(v_ent, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_separada', '7.2')));
  select * into v_s from public.estoque_saldos where lote_id = v_lote;
  assert v_s.quantidade_fisica = 21.6, 'FALHA 3: baixa duplicada';

  -- 4. Venda com mercadoria separada não pode ser cancelada
  begin
    perform public.cancelar_venda(v_venda, 'teste');
    raise exception 'FALHA 4';
  exception when sqlstate 'P0001' then null;
  end;

  -- 5. Agendar, rota (exige motorista+veículo), entregar
  insert into public.motoristas (nome) values ('Motorista F6') returning id into v_mot;
  insert into public.veiculos (placa, descricao) values ('BRA2E19', 'Caminhão F6') returning id into v_vei;
  perform public.agendar_entrega(jsonb_build_object('entrega_id', v_ent, 'data_agendada', current_date::text));
  begin
    perform public.iniciar_rota(array[v_ent]);
    raise exception 'FALHA 5a';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.agendar_entrega(jsonb_build_object('entrega_id', v_ent, 'data_agendada', current_date::text, 'motorista_id', v_mot, 'veiculo_id', v_vei));
  perform public.iniciar_rota(array[v_ent]);
  perform public.confirmar_entrega(jsonb_build_object('entrega_id', v_ent, 'recebedor_nome', 'Fulano'));
  assert (select status from public.entregas where id = v_ent) = 'entregue', 'FALHA 5b';
  assert (select quantidade_entregue from public.venda_itens where venda_id = v_venda) = 7.2, 'FALHA 5c';
  assert (select status from public.vendas where id = v_venda) = 'confirmada', 'FALHA 5d: ainda há saldo a entregar';

  -- 6. Saldo: separa, entrega com devolução parcial de 1 caixa (volta ao estoque)
  select id into v_item2 from public.entrega_itens where entrega_id = v_saldo_ent;
  perform public.concluir_separacao(v_saldo_ent, jsonb_build_array(jsonb_build_object('item_id', v_item2, 'quantidade_separada', '7.2', 'conferido', true)));
  perform public.agendar_entrega(jsonb_build_object('entrega_id', v_saldo_ent, 'data_agendada', current_date::text, 'motorista_id', v_mot, 'veiculo_id', v_vei));
  perform public.iniciar_rota(array[v_saldo_ent]);
  perform public.confirmar_entrega(jsonb_build_object('entrega_id', v_saldo_ent, 'recebedor_nome', 'Fulano',
    'devolucoes', jsonb_build_array(jsonb_build_object('item_id', v_item2, 'quantidade_devolvida', '1.44')), 'motivo_devolucao', 'Caixa quebrada'));
  select * into v_s from public.estoque_saldos where lote_id = v_lote;
  assert v_s.quantidade_fisica = 15.84 and v_s.quantidade_reservada = 0, 'FALHA 6a: devolução ao estoque';
  assert (select quantidade_entregue from public.venda_itens where venda_id = v_venda) = 12.96, 'FALHA 6b';

  raise notice 'FASE 6: TODOS OS TESTES PASSARAM';
end $$;

rollback;
