-- =====================================================================
-- Integração com a loja virtual (WooCommerce). Executar após as migrações e
-- após criar o primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "INTEGRAÇÃO LOJA: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_cat uuid;
  v_piso uuid;
  v_arg uuid;
  v_cli uuid;
  v_erp uuid;
  v_r jsonb;
  v_lp public.loja_pedidos%rowtype;
  v_v public.vendas%rowtype;
  v_c public.clientes%rowtype;
  v_ped jsonb;
  v_end jsonb := jsonb_build_object('cep', '07776-000', 'logradouro', 'Av. Antônio João Abdalla', 'numero', '1500',
                                    'bairro', 'Empresarial Anhanguera', 'cidade', 'Cajamar', 'uf', 'SP');
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;

  select id into v_cat from public.categorias order by nome limit 1;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa)
  values ('LJ-PISO-01', 'Porcelanato teste loja', v_cat, 'M2', 89.90, true, 4, 1.44) returning id into v_piso;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda)
  values ('LJ-ARG-01', 'Argamassa teste loja', v_cat, 'UN', 25.00) returning id into v_arg;

  -- 1. Cadastro feito no site → cliente no ERP (telefone com +55, data dd/mm/aaaa, endereço principal)
  v_r := public.loja_receber_cliente(jsonb_build_object('loja_id', 9001, 'tipo', 'PF', 'nome', 'Maria Loja Teste',
    'cpf', '529.982.247-25', 'email', 'Maria.Loja@Exemplo.com', 'celular', '+55 (11) 98765-4321', 'nascimento', '14/07/1985',
    'endereco', v_end));
  v_cli := (v_r ->> 'cliente_id')::uuid;
  select * into v_c from public.clientes where id = v_cli;
  assert v_c.origem = 'loja' and v_c.loja_cliente_id = 9001 and v_c.documento = '52998224725', 'FALHA 1: cliente';
  assert v_c.whatsapp = '11987654321' and v_c.email = 'maria.loja@exemplo.com' and v_c.data_nascimento = date '1985-07-14', 'FALHA 1: dados';
  assert (select count(*) from public.cliente_enderecos where cliente_id = v_cli and principal and cep = '07776000') = 1, 'FALHA 1: endereço';

  -- 2. Reenvio não duplica; cliente da loja recebe o telefone novo
  perform public.loja_receber_cliente(jsonb_build_object('loja_id', 9001, 'tipo', 'PF', 'nome', 'Maria Loja Teste',
    'cpf', '52998224725', 'email', 'maria.loja@exemplo.com', 'celular', '11912345678', 'endereco', v_end));
  assert (select count(*) from public.clientes where documento = '52998224725') = 1, 'FALHA 2: duplicou';
  assert (select whatsapp from public.clientes where id = v_cli) = '11912345678', 'FALHA 2: telefone';
  assert (select count(*) from public.cliente_enderecos where cliente_id = v_cli) = 1, 'FALHA 2: endereço duplicado';

  -- 3. Cliente já cadastrado no balcão (e-mail único): é vinculado, sem trocar o nome do ERP
  insert into public.clientes (tipo_pessoa, nome, email) values ('PF', 'João do Balcão', 'joao.balcao@exemplo.com') returning id into v_erp;
  v_r := public.loja_receber_cliente(jsonb_build_object('loja_id', 9002, 'tipo', 'PF', 'nome', 'Joao B', 'email', 'JOAO.BALCAO@exemplo.com',
    'telefone', '1144445555'));
  assert (v_r ->> 'cliente_id')::uuid = v_erp, 'FALHA 3: não vinculou pelo e-mail';
  select * into v_c from public.clientes where id = v_erp;
  assert v_c.nome = 'João do Balcão' and v_c.loja_cliente_id = 9002 and v_c.telefone = '1144445555' and v_c.origem = 'erp', 'FALHA 3: dados';

  -- 4. PJ sem CNPJ válido vira PF com observação; PJ com CNPJ válido guarda razão social e contato
  v_r := public.loja_receber_cliente(jsonb_build_object('tipo', 'PJ', 'nome', 'Fulano', 'razao_social', 'Empresa X', 'cnpj', '123'));
  assert (select tipo_pessoa from public.clientes where id = (v_r ->> 'cliente_id')::uuid) = 'PF', 'FALHA 4: PJ inválida';
  v_r := public.loja_receber_cliente(jsonb_build_object('tipo', 'PJ', 'nome', 'Carlos Comprador', 'razao_social', 'Construtora Loja Ltda',
    'cnpj', '11.222.333/0001-81', 'ie', '123.456.789.110'));
  select * into v_c from public.clientes where id = (v_r ->> 'cliente_id')::uuid;
  assert v_c.tipo_pessoa = 'PJ' and v_c.razao_social = 'Construtora Loja Ltda' and v_c.contato_nome = 'Carlos Comprador', 'FALHA 4: PJ';

  -- 5. Pedido aguardando pagamento: registrado, sem venda
  v_ped := jsonb_build_object(
    'id', 5001, 'numero', '5001', 'status', 'pending', 'modificado_em', '2026-11-24T10:00:00-03:00',
    'total', '468.28', 'frete', '29.90',
    'pagamento', jsonb_build_object('metodo', 'woo-mercado-pago-pix', 'titulo', 'Pix'),
    'entrega', jsonb_build_object('retirada', false, 'metodo_titulo', 'Entrega Cajamar', 'endereco', v_end),
    'cupons', jsonb_build_array('BEMVINDO'), 'observacao_cliente', 'Entregar à tarde',
    'cliente', jsonb_build_object('loja_id', 9001, 'tipo', 'PF', 'nome', 'Maria Loja Teste', 'cpf', '52998224725', 'email', 'maria.loja@exemplo.com'),
    'itens', jsonb_build_array(
      jsonb_build_object('sku', 'LJ-PISO-01', 'nome', 'Porcelanato teste', 'quantidade', 3, 'm2_caixa', '1.44', 'valor_total', '388.38'),
      jsonb_build_object('sku', 'lj-arg-01', 'nome', 'Argamassa', 'quantidade', 2, 'valor_total', '50.00')));
  v_r := public.loja_receber_pedido(v_ped);
  assert v_r ->> 'situacao' = 'aguardando_pagamento', 'FALHA 5: situação ' || (v_r ->> 'situacao');
  assert (select venda_id from public.loja_pedidos where pedido_loja_id = 5001) is null, 'FALHA 5: criou venda';

  -- 6. Pago → venda em rascunho com preços da loja, m² convertido, entrega e pagamento Pix
  v_ped := v_ped || jsonb_build_object('status', 'processing', 'pago_em', '2026-11-24T10:05:00-03:00', 'modificado_em', '2026-11-24T10:05:00-03:00');
  v_r := public.loja_receber_pedido(v_ped);
  select * into v_lp from public.loja_pedidos where pedido_loja_id = 5001;
  assert v_lp.situacao = 'integrado', 'FALHA 6: situação ' || v_lp.situacao || ' ' || coalesce(v_lp.mensagem, '');
  select * into v_v from public.vendas where id = v_lp.venda_id;
  assert v_v.status = 'rascunho' and v_v.origem = 'loja' and v_v.loja_pedido_id = 5001 and v_v.cliente_id = v_cli, 'FALHA 6: venda';
  assert v_v.tipo_entrega = 'entrega' and v_v.endereco_entrega_id is not null and v_v.frete = 29.90, 'FALHA 6: entrega';
  assert (select quantidade from public.venda_itens where venda_id = v_v.id and produto_id = v_piso) = 4.32, 'FALHA 6: m²';
  assert (select caixas from public.venda_itens where venda_id = v_v.id and produto_id = v_piso) = 3, 'FALHA 6: caixas';
  assert (select preco_unitario from public.venda_itens where venda_id = v_v.id and produto_id = v_piso) = 89.90, 'FALHA 6: preço m²';
  assert v_v.total = 468.27, 'FALHA 6: total ' || v_v.total; -- 4,32 × 89,90 = 388,37 (1 centavo de arredondamento)
  assert v_lp.mensagem like '%difere do total da loja%', 'FALHA 6: aviso de diferença';
  assert (select forma::text || ':' || valor from public.venda_pagamentos where venda_id = v_v.id) = 'pix:468.27', 'FALHA 6: pagamento';
  assert v_v.observacoes like '%Pedido #5001%' and v_v.observacoes like '%BEMVINDO%' and v_v.observacoes like '%à tarde%', 'FALHA 6: observações';

  -- 7. Reenvio do mesmo pedido não duplica a venda; versão mais antiga é ignorada
  perform public.loja_receber_pedido(v_ped);
  assert (select count(*) from public.vendas where loja_pedido_id = 5001) = 1, 'FALHA 7: duplicou';
  v_r := public.loja_receber_pedido(v_ped || jsonb_build_object('status', 'cancelled', 'modificado_em', '2026-11-24T09:00:00-03:00'));
  assert (v_r ->> 'ignorado')::boolean and (select status from public.vendas where id = v_v.id) = 'rascunho', 'FALHA 7: versão antiga';

  -- 8. Cancelado na loja → venda em rascunho cancelada
  v_r := public.loja_receber_pedido(v_ped || jsonb_build_object('status', 'cancelled', 'modificado_em', '2026-11-24T11:00:00-03:00'));
  assert v_r ->> 'situacao' = 'cancelado', 'FALHA 8: situação';
  assert (select status from public.vendas where id = v_v.id) = 'cancelada', 'FALHA 8: venda não cancelada';

  -- 9. SKU desconhecido → pendente; depois de cadastrar, "Reprocessar" cria a venda
  v_r := public.loja_receber_pedido(jsonb_build_object('id', 5002, 'numero', '5002', 'status', 'on-hold', 'total', '30',
    'pagamento', jsonb_build_object('metodo', 'bacs', 'titulo', 'Transferência bancária'),
    'entrega', jsonb_build_object('retirada', true, 'metodo_titulo', 'Retirada na loja'),
    'cliente', jsonb_build_object('tipo', 'PF', 'nome', 'Cliente Avulso Loja', 'email', 'avulso.loja@exemplo.com'),
    'itens', jsonb_build_array(jsonb_build_object('sku', 'LJ-NOVO-99', 'nome', 'Rejunte', 'quantidade', 1, 'valor_total', '30'))));
  assert v_r ->> 'situacao' = 'pendente' and v_r ->> 'mensagem' like '%LJ-NOVO-99%', 'FALHA 9: pendente';
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda) values ('LJ-NOVO-99', 'Rejunte teste', v_cat, 'UN', 30);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.loja_reprocessar_pedido((select id from public.loja_pedidos where pedido_loja_id = 5002));
  assert v_r ->> 'situacao' = 'integrado', 'FALHA 9: reprocessar';
  select * into v_v from public.vendas where loja_pedido_id = 5002;
  assert v_v.tipo_entrega = 'retirada' and v_v.total = 30, 'FALHA 9: venda';
  assert (select forma from public.venda_pagamentos where venda_id = v_v.id) = 'transferencia', 'FALHA 9: forma';

  -- 10. Forma de pagamento: reconhecimento pelos nomes dos plugins
  assert public._loja_forma_pagamento('{"metodo":"woo-mercado-pago-custom","titulo":"Cartão de crédito"}') = 'cartao_credito', 'FALHA 10a';
  assert public._loja_forma_pagamento('{"metodo":"pagarme-boleto","titulo":"Boleto"}') = 'boleto', 'FALHA 10b';
  assert public._loja_forma_pagamento('{"metodo":"cod","titulo":"Pagamento na entrega"}') = 'dinheiro', 'FALHA 10c';

  -- 11. Item com quantidade inválida não derruba o recebimento: fica "atenção"
  v_r := public.loja_receber_pedido(jsonb_build_object('id', 5003, 'numero', '5003', 'status', 'processing', 'total', '10',
    'cliente', jsonb_build_object('tipo', 'PF', 'nome', 'Teste Atenção'),
    'itens', jsonb_build_array(jsonb_build_object('sku', 'LJ-ARG-01', 'nome', 'Argamassa', 'quantidade', 0, 'valor_total', '10'))));
  assert v_r ->> 'situacao' = 'atencao' and exists (select 1 from public.loja_pedidos where pedido_loja_id = 5003), 'FALHA 11';

  raise notice 'INTEGRAÇÃO LOJA: TESTES FUNCIONAIS PASSARAM';
end $$;

-- 12. Segurança: o navegador (authenticated) não chama as funções da loja, não grava
--     loja_pedidos e não altera a origem/vínculo das vendas
do $$
declare
  v_admin uuid;
  v_venda uuid;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  select id into v_venda from public.vendas where loja_pedido_id = 5002;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.loja_receber_pedido('{"id": 1, "status": "processing"}');
    raise exception 'FALHA 12a';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.loja_receber_cliente('{"nome": "X"}');
    raise exception 'FALHA 12b';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.loja_pedidos (pedido_loja_id, numero_loja, status_loja, payload) values (1, '1', 'processing', '{}');
    raise exception 'FALHA 12c';
  exception when insufficient_privilege then null;
  end;

  update public.vendas set origem = 'erp', loja_pedido_id = null where id = v_venda;
  assert (select origem || ':' || loja_pedido_id from public.vendas where id = v_venda) = 'loja:5002', 'FALHA 12d: origem alterada';
  assert (select count(*) from public.loja_pedidos) >= 3, 'FALHA 12e: administrador deveria ler os pedidos';

  reset role;
  raise notice 'INTEGRAÇÃO LOJA: TODOS OS TESTES PASSARAM';
end $$;

rollback;
