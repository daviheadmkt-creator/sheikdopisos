-- =====================================================================
-- Testes financeiros (Fase 5). Executar após as migrações e após criar o
-- primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "FASE 5: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_caixa uuid;
  v_banco uuid;
  v_cli uuid;
  v_cat uuid;
  v_prod uuid;
  v_lote uuid;
  v_dep uuid;
  v_venda uuid;
  v_tit uuid;
  v_parc uuid;
  v_mov uuid;
  v_sessao uuid;
  v_desp uuid;
  v_dif numeric;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id into v_caixa from public.contas_financeiras where tipo = 'caixa' limit 1;
  insert into public.contas_financeiras (nome, tipo, saldo_inicial) values ('Banco teste F5', 'banco', 1000) returning id into v_banco;

  -- 1. Caixa fechado não aceita movimento
  begin
    perform public.movimentar_caixa(jsonb_build_object('tipo', 'suprimento', 'conta_id', v_caixa, 'valor', '50'));
    raise exception 'FALHA 1';
  exception when sqlstate 'P0001' then null;
  end;

  -- 2. Abertura com diferença gera ajuste e iguala o saldo ao contado
  v_sessao := public.abrir_caixa(v_caixa, public.saldo_conta(v_caixa) + 100);
  assert public.saldo_conta(v_caixa) = (select valor_abertura from public.caixa_sessoes where id = v_sessao), 'FALHA 2';

  -- 3. Venda confirmada gera título a receber com parcelas por forma (PIX à vista + cartão 2x)
  select id into v_cat from public.categorias where nome = 'Argamassa';
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, custo) values ('T5-ARG', 'Argamassa F5', v_cat, 'SC', 50, 30) returning id into v_prod;
  select id into v_dep from public.depositos where padrao;
  perform public.registrar_movimentacao(jsonb_build_object('tipo', 'entrada', 'produto_id', v_prod, 'quantidade', '10', 'deposito_destino_id', v_dep));
  insert into public.clientes (tipo_pessoa, nome) values ('PF', 'Cliente F5') returning id into v_cli;
  v_venda := public.salvar_venda(jsonb_build_object('cliente_id', v_cli),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '4', 'preco_unitario', '50', 'deposito_id', v_dep)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', '100'), jsonb_build_object('forma', 'cartao_credito', 'valor', '100', 'parcelas', '2')));
  perform public.confirmar_venda(v_venda);
  select id into v_tit from public.titulos where documento_tipo = 'venda' and documento_id = v_venda::text;
  assert v_tit is not null, 'FALHA 3a: título não gerado';
  assert (select count(*) from public.titulo_parcelas where titulo_id = v_tit) = 3, 'FALHA 3b: parcelas';
  assert (select sum(valor) from public.titulo_parcelas where titulo_id = v_tit) = 200, 'FALHA 3c: soma';
  assert (select custo_unitario from public.venda_itens where venda_id = v_venda) = 30, 'FALHA 3d: custo para CMV';

  -- 4. Recebimento no caixa (PIX) + idempotência
  select id into v_parc from public.titulo_parcelas where titulo_id = v_tit and forma_prevista = 'pix';
  v_mov := public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_caixa, 'principal', '100', 'forma', 'pix', 'chave_idempotencia', 't5-rec'));
  assert public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_caixa, 'principal', '100', 'forma', 'pix', 'chave_idempotencia', 't5-rec')) = v_mov, 'FALHA 4a';
  assert (select status from public.titulo_parcelas where id = v_parc) = 'paga', 'FALHA 4b';
  assert (select status from public.titulos where id = v_tit) = 'parcial', 'FALHA 4c';

  -- 5. Venda com recebimento não pode ser cancelada
  begin
    perform public.cancelar_venda(v_venda, 'teste');
    raise exception 'FALHA 5';
  exception when sqlstate 'P0001' then null;
  end;

  -- 6. Estorno reabre a parcela e permite cancelar a venda (título cancelado)
  perform public.estornar_movimento(v_mov, 'Teste de estorno');
  assert (select status from public.titulo_parcelas where id = v_parc) = 'aberta', 'FALHA 6a';
  perform public.cancelar_venda(v_venda, 'Desistência');
  assert (select status from public.titulos where id = v_tit) = 'cancelado', 'FALHA 6b';

  -- 7. Baixa parcial com juros e desconto
  v_desp := public.criar_titulo(jsonb_build_object('tipo', 'pagar', 'descricao', 'Energia teste', 'valor', '300',
    'categoria_id', (select id from public.categorias_financeiras where nome = 'Energia, água e telefone')));
  select id into v_parc from public.titulo_parcelas where titulo_id = v_desp;
  perform public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_banco, 'principal', '200', 'juros', '5', 'desconto', '0'));
  assert (select valor_pago from public.titulo_parcelas where id = v_parc) = 200, 'FALHA 7a';
  assert public.saldo_conta(v_banco) = 795, 'FALHA 7b: saldo do banco (1000 − 205)';
  begin
    perform public.liquidar_parcela(jsonb_build_object('parcela_id', v_parc, 'conta_id', v_banco, 'principal', '150'));
    raise exception 'FALHA 7c';
  exception when sqlstate '22023' then null;
  end;

  -- 8. Fechamento com falta registra ajuste
  v_dif := public.fechar_caixa(v_sessao, public.saldo_conta(v_caixa) - 10);
  assert v_dif = -10, 'FALHA 8a';
  assert (select status from public.caixa_sessoes where id = v_sessao) = 'fechado', 'FALHA 8b';

  -- 9. Movimentos são imutáveis
  begin
    update public.movimentos_financeiros set valor = 1 where id = v_mov;
    raise exception 'FALHA 9';
  exception when sqlstate 'P0001' then null;
  end;

  -- 10. DRE e fluxo executam
  perform * from public.dre_gerencial(current_date - 30, current_date);
  perform * from public.fluxo_caixa(current_date - 7, current_date + 7);

  raise notice 'FASE 5: TODOS OS TESTES PASSARAM';
end $$;

rollback;
