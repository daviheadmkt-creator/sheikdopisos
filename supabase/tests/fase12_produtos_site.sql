-- =====================================================================
-- Produtos do ERP → loja virtual. Executar após as migrações e após criar o
-- primeiro usuário (administrador). Transação com ROLLBACK.
-- Resultado esperado: "PRODUTOS SITE: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_cat uuid;
  v_piso uuid;
  v_arg uuid;
  v_dep uuid;
  v_lote1 uuid;
  v_lote2 uuid;
  v_cli uuid;
  v_r jsonb;
  v_p jsonb;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  if v_admin is null then raise exception 'Crie o primeiro usuário antes de rodar este teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1. Categorias padrão já vêm vinculadas às subcategorias do tema
  assert (select site_categoria from public.categorias where nome = 'Porcelanato') = 'porcelanatos', 'FALHA 1: vínculo padrão';

  select id into v_cat from public.categorias where nome = 'Porcelanato';
  select id into v_dep from public.depositos where padrao;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa,
                               largura_cm, comprimento_cm, acabamento)
  values ('PS-PISO-1', 'Porcelanato site teste 90x90', v_cat, 'M2', 119.90, true, 2, 1.62, 90, 90, 'Polido') returning id into v_piso;
  assert (select vender_no_site from public.produtos where id = v_piso), 'FALHA 2: padrão deveria ser vender no site';

  -- 3. Sem estoque: estoque 0 no payload
  v_p := (public.loja_produtos_site(null, array[v_piso]) -> 'produtos') -> 0;
  assert (v_p ->> 'estoque')::numeric = 0 and (v_p ->> 'ativo')::boolean, 'FALHA 3: sem estoque';
  assert v_p ->> 'm2_caixa' = '1.62' and v_p ->> 'formato' = '90x90' and v_p ->> 'acabamento' = 'Polido', 'FALHA 3: dados ' || v_p::text;
  assert v_p -> 'categoria' ->> 'site' = 'porcelanatos' and (v_p ->> 'preco')::numeric = 119.90, 'FALHA 3: categoria/preço';

  -- 4. Estoque em dois lotes: site recebe caixas do MAIOR lote (10 cx = 16,2 m²; 5 cx = 8,1 m²)
  insert into public.lotes (produto_id, codigo, tonalidade, calibre) values (v_piso, 'PSL1', 'A', '1') returning id into v_lote1;
  insert into public.lotes (produto_id, codigo, tonalidade, calibre) values (v_piso, 'PSL2', 'B', '1') returning id into v_lote2;
  perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_piso,'lote_id',v_lote1,'quantidade','16.2','deposito_destino_id',v_dep));
  perform public.registrar_movimentacao(jsonb_build_object('tipo','entrada','produto_id',v_piso,'lote_id',v_lote2,'quantidade','8.1','deposito_destino_id',v_dep));
  assert public._loja_estoque_site(v_piso) = 10, 'FALHA 4: estoque em caixas ' || public._loja_estoque_site(v_piso);

  -- 5. Venda do site em rascunho desconta do estoque mostrado no site (3 cx = 4,86 m²)
  insert into public.clientes (tipo_pessoa, nome) values ('PF', 'Cliente site F12') returning id into v_cli;
  perform public.salvar_venda(jsonb_build_object('cliente_id', v_cli),
    jsonb_build_array(jsonb_build_object('produto_id', v_piso, 'quantidade', '4.86', 'preco_unitario', '119.90')), '[]');
  update public.vendas set origem = 'loja' where id = (select venda_id from public.venda_itens where produto_id = v_piso limit 1);
  assert public._loja_estoque_site(v_piso) = 7, 'FALHA 5: desconto do rascunho ' || public._loja_estoque_site(v_piso);

  -- 6. Unidade CX: preço do site é por m²
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento, pecas_por_caixa, m2_por_caixa)
  values ('PS-PISO-CX', 'Piso vendido por caixa', v_cat, 'CX', 162.00, true, 2, 1.62) returning id into v_arg;
  assert ((public.loja_produtos_site(null, array[v_arg]) -> 'produtos') -> 0 ->> 'preco')::numeric = 100.00, 'FALHA 6: preço por m²';

  -- 7. Desligar "vender no site" ou inativar → ativo = false (site esconde)
  update public.produtos set vender_no_site = false where id = v_arg;
  assert not ((public.loja_produtos_site(null, array[v_arg]) -> 'produtos') -> 0 ->> 'ativo')::boolean, 'FALHA 7: desligado';

  -- 8. Busca automática: alterações do último minuto ficam para a próxima rodada
  v_r := public.loja_produtos_site(null, null);
  assert not exists (select 1 from jsonb_array_elements(v_r -> 'produtos') x where x ->> 'sku' = 'PS-PISO-1'), 'FALHA 8: deveria aguardar 1 min';

  -- 9. Resultado do site é registrado sem alterar produtos.updated_at
  perform public.loja_registrar_site_produtos(jsonb_build_array(jsonb_build_object(
    'erp_id', v_piso, 'site_id', 321, 'url', 'https://loja.exemplo/produto/piso', 'situacao', 'publicado', 'estoque', 7)));
  assert (select situacao || ':' || site_produto_id from public.produto_site where produto_id = v_piso) = 'publicado:321', 'FALHA 9';
  perform public.loja_registrar_site_produtos(jsonb_build_array(jsonb_build_object('erp_id', v_piso, 'situacao', 'xyz')));
  assert (select situacao || ':' || site_produto_id from public.produto_site where produto_id = v_piso) = 'erro:321', 'FALHA 9b';

  raise notice 'PRODUTOS SITE: TESTES FUNCIONAIS PASSARAM';
end $$;

-- 10. Segurança: o navegador lê a situação, mas não grava produto_site nem chama as funções do site
do $$
declare
  v_admin uuid;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.loja_produtos_site(null, null);
    raise exception 'FALHA 10a';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.loja_registrar_site_produtos('[]');
    raise exception 'FALHA 10b';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.produto_site (produto_id, situacao) select id, 'publicado' from public.produtos limit 1;
    raise exception 'FALHA 10c';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.produto_site) >= 1, 'FALHA 10d: leitura';
  reset role;
  raise notice 'PRODUTOS SITE: TODOS OS TESTES PASSARAM';
end $$;

rollback;
