-- =====================================================================
-- Revisão de QA / segurança: tentativas de burlar as regras chamando a API direto.
-- Transação com ROLLBACK. Resultado esperado: "QA SEGURANÇA: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  v_vend uuid;
  v_cat uuid;
  v_prod uuid;
  v_dep uuid;
  v_cli uuid;
  v_venda uuid;
  v_venda2 uuid;
  v_n numeric;
  v_c public.clientes%rowtype;
begin
  select usuario_id into v_admin from public.usuario_perfis where perfil = 'administrador' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  assert (select desconto_max_sem_aprovacao from public.parametros_comerciais) < 50, 'pré-condição: limite de desconto';

  select id into v_cat from public.categorias limit 1;
  insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda)
  values ('T10-ARG', 'Argamassa teste QA', v_cat, 'UN', 100) returning id into v_prod;
  select id into v_dep from public.depositos where padrao;
  perform public.registrar_movimentacao(jsonb_build_object('tipo', 'entrada', 'produto_id', v_prod, 'quantidade', '50',
    'deposito_destino_id', v_dep));
  insert into public.clientes (tipo_pessoa, nome) values ('PF', 'Cliente QA') returning id into v_cli;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-qa@sheik.invalid', '',
          '{}', '{"nome":"Vendedor QA"}', now(), now())
  returning id into v_vend;
  insert into public.usuario_perfis (usuario_id, perfil) values (v_vend, 'vendedor');

  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- QA-1: venda criada direto como "confirmada" é recusada
  begin
    insert into public.vendas (cliente_id, status) values (v_cli, 'confirmada');
    raise exception 'QA-1 FALHOU: venda inserida já confirmada';
  exception when insufficient_privilege then null;
  end;

  -- QA-2: rascunho não pode virar "confirmada" por UPDATE direto
  v_venda := public.salvar_venda(jsonb_build_object('cliente_id', v_cli),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '2', 'preco_unitario', '100', 'deposito_id', v_dep)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', '200')));
  begin
    update public.vendas set status = 'confirmada' where id = v_venda;
    raise exception 'QA-2 FALHOU: status alterado sem a função de confirmação';
  exception when insufficient_privilege then null;
  end;

  -- QA-3: valor do item adulterado é recalculado pelo banco
  update public.venda_itens set valor_total = 1, valor_bruto = 1, valor_desconto = 0 where venda_id = v_venda;
  select valor_total into v_n from public.venda_itens where venda_id = v_venda;
  assert v_n = 200, 'QA-3: valor do item não foi recalculado';

  -- QA-4: total do cabeçalho adulterado impede a confirmação
  update public.vendas set subtotal = 1, total = 1 where id = v_venda;
  update public.venda_pagamentos set valor = 1 where venda_id = v_venda;
  begin
    perform public.confirmar_venda(v_venda);
    raise exception 'QA-4 FALHOU: venda confirmada com total adulterado';
  exception when sqlstate 'P0001' then null;
  end;

  -- QA-5: preço 50% abaixo da tabela, sem desconto declarado, exige aprovação
  v_venda2 := public.salvar_venda(jsonb_build_object('cliente_id', v_cli),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '1', 'preco_unitario', '50', 'deposito_id', v_dep)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', '50')));
  begin
    perform public.confirmar_venda(v_venda2);
    raise exception 'QA-5 FALHOU: preço abaixo da tabela sem aprovação';
  exception when insufficient_privilege then null;
  end;

  -- QA-6: venda correta (preço de tabela) confirma normalmente
  perform public.salvar_venda(jsonb_build_object('id', v_venda, 'cliente_id', v_cli),
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', '2', 'preco_unitario', '100', 'deposito_id', v_dep)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', '200')));
  perform public.confirmar_venda(v_venda);
  assert (select status from public.vendas where id = v_venda) = 'confirmada', 'QA-6: venda válida não confirmou';

  -- QA-7: autoria não pode ser forjada
  insert into public.clientes (tipo_pessoa, nome, created_by, created_at)
  values ('PF', 'Cliente autoria QA', v_admin, '2000-01-01') returning * into v_c;
  assert v_c.created_by = v_vend and v_c.created_at > now() - interval '1 minute', 'QA-7: autoria forjada';

  -- QA-8: e-mail/id da tabela de usuários não são editáveis pela API
  begin
    update public.usuarios set email = 'outro@sheik.invalid' where id = v_vend;
    raise exception 'QA-8 FALHOU: e-mail alterado pela API';
  exception when insufficient_privilege then null;
  end;

  -- QA-9: TRUNCATE (que ignora RLS) não é permitido
  begin
    truncate public.auditoria;
    raise exception 'QA-9 FALHOU: truncate permitido';
  exception when insufficient_privilege then null;
  end;

  -- QA-10: views não aceitam escrita
  assert not exists (
    select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE'))), 'QA-10: view aceita escrita';
  reset role;

  -- QA-11: visitante sem login não acessa nenhuma tabela
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.clientes limit 1;
    raise exception 'QA-11 FALHOU: visitante acessou clientes';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'QA SEGURANÇA: TODOS OS TESTES PASSARAM';
end $$;

rollback;
