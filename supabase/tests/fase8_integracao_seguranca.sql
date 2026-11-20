-- =====================================================================
-- Fase 8: teste INTEGRADO de ponta a ponta + teste de SEGURANÇA com papéis reais.
-- Executar após as migrações e após existir um administrador. Transação com ROLLBACK.
-- Resultado esperado: "FASE 8: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid; v_vend uuid;
  v_cat_porc uuid; v_cat_arg uuid; v_porc uuid; v_arg uuid; v_lote uuid; v_dep uuid;
  v_forn uuid; v_cli uuid; v_end uuid;
  v_ped uuid; v_rec uuid; v_orc uuid; v_venda uuid; v_tit_rec uuid; v_tit_pag uuid;
  v_caixa uuid; v_banco uuid; v_sessao uuid; v_parc uuid; v_ent uuid; v_mot uuid; v_vei uuid;
  v_itens jsonb; v_n numeric; v_ind jsonb;
  v_fisico_porc numeric; v_fisico_arg numeric;
  v_hoje date := public.hoje();
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'É necessário um administrador'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------------ Cadastros
  select id into v_cat_porc from public.categorias where nome = 'Porcelanato';
  select id into v_cat_arg from public.categorias where nome = 'Argamassa';
  select id into v_dep from public.depositos where padrao;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa, peso_kg)
  values ('T8-PORC', 'Porcelanato F8 60x60', v_cat_porc, 'M2', 89.90, true, 4, 1.44, 32) returning id into v_porc;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda)
  values ('T8-ARG', 'Argamassa F8', v_cat_arg, 'SC', 30) returning id into v_arg;
  v_forn := public.salvar_fornecedor(jsonb_build_object('razao_social', 'Fornecedor F8 Ltda'), '[]');
  insert into public.clientes (tipo_pessoa, nome, documento) values ('PF', 'Cliente F8', '52998224725') returning id into v_cli;
  insert into public.cliente_enderecos (cliente_id, cep, logradouro, numero, bairro, cidade, uf, principal)
  values (v_cli, '01310100', 'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', true) returning id into v_end;

  -- ------------------------------------------------------------ Compras → estoque → contas a pagar
  v_ped := public.salvar_pedido_compra(
    jsonb_build_object('fornecedor_id', v_forn, 'deposito_destino_id', v_dep, 'parcelas', '2', 'primeiro_vencimento_dias', '30', 'intervalo_dias', '30'),
    jsonb_build_array(jsonb_build_object('produto_id', v_porc, 'quantidade', '28.8', 'custo_unitario', '40'),
                      jsonb_build_object('produto_id', v_arg, 'quantidade', '10', 'custo_unitario', '18')));
  perform public.aprovar_pedido_compra(v_ped);
  select jsonb_agg(jsonb_build_object('pedido_item_id', i.id, 'quantidade', i.quantidade::text,
           'lote_codigo', case when i.produto_id = v_porc then 'F8L1' end, 'tonalidade', case when i.produto_id = v_porc then 'T1' end,
           'calibre', case when i.produto_id = v_porc then 'C1' end))
  into v_itens from public.compras_pedido_itens i where i.pedido_id = v_ped;
  v_rec := public.salvar_recebimento(jsonb_build_object('pedido_id', v_ped, 'deposito_id', v_dep, 'nota_fiscal', 'NF-F8'), v_itens);
  perform public.confirmar_recebimento(v_rec);
  select id into v_lote from public.lotes where produto_id = v_porc and codigo = 'F8L1';
  assert (select sum(quantidade_fisica) from public.estoque_saldos where produto_id = v_porc) = 28.8, 'INT-1: entrada de compra';
  select id into v_tit_pag from public.titulos where documento_tipo = 'compra' and documento_id = v_rec::text;
  assert (select valor_total from public.titulos where id = v_tit_pag) = 1332, 'INT-2: título a pagar (28,8×40 + 10×18)';
  assert (select count(*) from public.titulo_parcelas where titulo_id = v_tit_pag) = 2, 'INT-3: parcelas da compra';

  -- ------------------------------------------------------------ Orçamento (m²) → venda
  v_orc := public.salvar_orcamento(jsonb_build_object('cliente_id', v_cli),
    jsonb_build_array(jsonb_build_object('produto_id', v_porc, 'area_m2', '20', 'perc_sobra', '10', 'preco_unitario', '89.90'),
                      jsonb_build_object('produto_id', v_arg, 'quantidade', '4', 'preco_unitario', '30')));
  assert (select caixas from public.orcamento_itens where orcamento_id = v_orc and produto_id = v_porc) = 16, 'INT-4: 16 caixas';
  assert (select total from public.orcamentos where id = v_orc) = 2191.30, 'INT-5: total do orçamento';
  perform public.alterar_status_orcamento(v_orc, 'aprovado');
  v_venda := public.converter_orcamento_em_venda(v_orc);
  update public.venda_itens set lote_id = v_lote, deposito_id = v_dep where venda_id = v_venda and produto_id = v_porc;
  update public.venda_itens set deposito_id = v_dep where venda_id = v_venda and produto_id = v_arg;
  update public.vendas set tipo_entrega = 'entrega', endereco_entrega_id = v_end where id = v_venda;
  insert into public.venda_pagamentos (venda_id, forma, valor) values (v_venda, 'pix', 191.30);
  insert into public.venda_pagamentos (venda_id, forma, valor, parcelas, primeiro_vencimento, intervalo_dias)
  values (v_venda, 'boleto', 2000, 2, v_hoje + 30, 30);
  perform public.confirmar_venda(v_venda);
  assert (select sum(quantidade_reservada) from public.estoque_saldos where produto_id = v_porc) = 23.04, 'INT-6: reserva do lote';
  select id into v_tit_rec from public.titulos where documento_tipo = 'venda' and documento_id = v_venda::text;
  assert (select count(*) from public.titulo_parcelas where titulo_id = v_tit_rec) = 3, 'INT-7: PIX + boleto 2x';
  select id into v_ent from public.entregas where venda_id = v_venda;
  assert v_ent is not null, 'INT-8: entrega criada na confirmação';

  -- ------------------------------------------------------------ Caixa: abre e recebe o PIX
  insert into public.contas_financeiras (nome, tipo, saldo_inicial) values ('Caixa teste F8', 'caixa', 0) returning id into v_caixa;
  v_sessao := public.abrir_caixa(v_caixa, public.saldo_conta(v_caixa));
  select id into v_parc from public.titulo_parcelas where titulo_id = v_tit_rec and forma_prevista = 'pix';
  perform public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_caixa, 'principal', '191.30', 'forma', 'pix'));
  assert (select status from public.titulos where id = v_tit_rec) = 'parcial', 'INT-9: título parcialmente recebido';

  -- ------------------------------------------------------------ Separação → entrega → venda concluída
  select jsonb_agg(jsonb_build_object('item_id', id, 'quantidade_separada', quantidade::text, 'conferido', true)) into v_itens
  from public.entrega_itens where entrega_id = v_ent;
  perform public.concluir_separacao(v_ent, v_itens);
  select sum(quantidade_fisica) into v_fisico_porc from public.estoque_saldos where produto_id = v_porc;
  select sum(quantidade_fisica) into v_fisico_arg from public.estoque_saldos where produto_id = v_arg;
  assert v_fisico_porc = 5.76 and v_fisico_arg = 6, 'INT-10: baixa física na separação';
  assert (select sum(quantidade_reservada) from public.estoque_saldos where produto_id = v_porc) = 0, 'INT-11: reserva consumida';
  insert into public.motoristas (nome) values ('Motorista F8') returning id into v_mot;
  insert into public.veiculos (placa, descricao) values ('FFF8A88', 'Caminhão F8') returning id into v_vei;
  perform public.agendar_entrega(jsonb_build_object('entrega_id', v_ent, 'data_agendada', v_hoje::text, 'motorista_id', v_mot, 'veiculo_id', v_vei));
  perform public.iniciar_rota(array[v_ent]);
  perform public.confirmar_entrega(jsonb_build_object('entrega_id', v_ent, 'recebedor_nome', 'Recebedor F8'));
  assert (select status from public.vendas where id = v_venda) = 'concluida', 'INT-12: venda concluída após entrega total';

  -- ------------------------------------------------------------ Pagamento ao fornecedor pelo banco
  insert into public.contas_financeiras (nome, tipo, saldo_inicial) values ('Banco F8', 'banco', 5000) returning id into v_banco;
  select id into v_parc from public.titulo_parcelas where titulo_id = v_tit_pag and numero = 1;
  perform public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_banco, 'principal', '666', 'forma', 'boleto'));
  assert public.saldo_conta(v_banco) = 4334, 'INT-13: saldo do banco';

  -- ------------------------------------------------------------ Fechamento e indicadores
  assert public.fechar_caixa(v_sessao, public.saldo_conta(v_caixa)) = 0, 'INT-14: caixa fecha sem diferença';
  v_ind := public.dashboard_indicadores(v_hoje, v_hoje);
  assert (v_ind ->> 'faturamento')::numeric >= 2191.30, 'INT-15: dashboard reflete a venda';
  select valor into v_n from public.dre_gerencial(v_hoje, v_hoje) where ordem = 50;
  assert v_n <= -993.60, 'INT-16: CMV (23,04×40 + 4×18)';
  assert not exists (select 1 from public.estoque_saldos where quantidade_fisica < 0 or quantidade_disponivel < 0), 'INT-17: estoque negativo';
  assert (select count(*) from public.estoque_movimentacoes where documento_tipo = 'venda' and documento_id = v_venda::text) = 2,
    'INT-18: exatamente uma baixa por item (sem duplicidade)';

  -- ================================================================ SEGURANÇA (papéis reais)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-f8@sheik.invalid', '',
          '{}', '{"nome":"Vendedor F8"}', now(), now())
  returning id into v_vend;
  insert into public.usuario_perfis (usuario_id, perfil) values (v_vend, 'vendedor');

  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  set local role authenticated;

  assert (select count(*) from public.clientes) >= 1, 'SEG-1: vendedor lê clientes';
  assert (select count(*) from public.titulos) = 0, 'SEG-2: vendedor NÃO lê títulos financeiros';
  assert (select count(*) from public.movimentos_financeiros) = 0, 'SEG-3: vendedor NÃO lê movimentos financeiros';
  assert (select count(*) from public.auditoria) = 0, 'SEG-4: vendedor NÃO lê auditoria';
  assert (public.dashboard_indicadores(v_hoje, v_hoje) ->> 'receber_aberto') is null, 'SEG-5: dashboard oculta valores financeiros';
  begin
    insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda) values ('T8-X', 'Proibido', v_cat_arg, 'UN', 1);
    raise exception 'SEG-6 FALHOU: vendedor cadastrou produto';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_banco, 'principal', '1'));
    raise exception 'SEG-7 FALHOU: vendedor liquidou título';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.registrar_movimentacao(jsonb_build_object('tipo', 'entrada', 'produto_id', v_arg, 'quantidade', '1', 'deposito_destino_id', v_dep));
    raise exception 'SEG-8 FALHOU: vendedor movimentou estoque';
  exception when insufficient_privilege then null;
  end;
  update public.estoque_saldos set quantidade_fisica = 9999 where produto_id = v_arg;
  begin
    insert into public.usuario_perfis (usuario_id, perfil) values (v_vend, 'administrador');
    raise exception 'SEG-9 FALHOU: vendedor se promoveu a administrador';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._movimentar('entrada', v_arg, 1, null, null, null, v_dep);
    raise exception 'SEG-10 FALHOU: função interna acessível';
  exception when insufficient_privilege then null;
  end;
  reset role;
  assert (select sum(quantidade_fisica) from public.estoque_saldos where produto_id = v_arg) = 6, 'SEG-11: saldo não pode ser alterado diretamente';

  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.clientes limit 1;
    raise exception 'SEG-12 FALHOU: visitante lê clientes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.produtos limit 1;
    raise exception 'SEG-13 FALHOU: visitante lê produtos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.tem_permissao('clientes', 'ler');
    raise exception 'SEG-14 FALHOU: visitante executa funções';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'FASE 8: TODOS OS TESTES PASSARAM';
end $$;

rollback;
