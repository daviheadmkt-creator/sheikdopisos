-- =====================================================================
-- Testes de regras de negócio e segurança da Fase 1 (executar no SQL Editor
-- do Supabase após aplicar as migrações). Tudo roda dentro de uma transação
-- com ROLLBACK: nenhum dado permanece no banco.
-- Resultado esperado: a mensagem "FASE 1: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_ok boolean;
begin
  -- Validação de documentos
  assert public.valida_cpf('52998224725'), 'CPF válido rejeitado';
  assert not public.valida_cpf('52998224724'), 'CPF inválido aceito';
  assert not public.valida_cpf('11111111111'), 'CPF repetido aceito';
  assert public.valida_cnpj('11222333000181'), 'CNPJ numérico válido rejeitado';
  assert not public.valida_cnpj('11222333000180'), 'CNPJ inválido aceito';
  assert public.valida_cnpj('12ABC34501DE35'), 'CNPJ alfanumérico válido rejeitado';
  assert not public.valida_cnpj('12ABC34501DE36'), 'CNPJ alfanumérico inválido aceito';

  -- Restrição de documento em clientes
  begin
    insert into public.clientes (tipo_pessoa, nome, documento) values ('PF', 'Teste CPF', '12345678900');
    raise exception 'deveria falhar';
  exception when check_violation then null;
  end;

  begin
    insert into public.clientes (tipo_pessoa, nome) values ('PJ', 'Teste PJ sem CNPJ');
    raise exception 'deveria falhar';
  exception when check_violation then null;
  end;

  -- Documento duplicado
  insert into public.clientes (tipo_pessoa, nome, documento) values ('PF', 'Cliente A', '52998224725');
  begin
    insert into public.clientes (tipo_pessoa, nome, documento) values ('PF', 'Cliente B', '52998224725');
    raise exception 'deveria falhar';
  exception when unique_violation then null;
  end;

  -- Produto de revestimento exige peças/caixa e m²/caixa
  begin
    insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda, eh_revestimento)
    select 'TESTE-REV', 'Porcelanato teste', id, 'M2', 10, true from public.categorias where nome = 'Porcelanato';
    raise exception 'deveria falhar';
  exception when check_violation then null;
  end;

  -- Preço negativo
  begin
    insert into public.produtos (sku, descricao, categoria_id, unidade, preco_venda)
    select 'TESTE-NEG', 'Produto teste', id, 'UN', -1 from public.categorias where nome = 'Argamassa';
    raise exception 'deveria falhar';
  exception when check_violation then null;
  end;

  -- Auditoria registrou o cliente inserido
  select exists (select 1 from public.auditoria where tabela = 'clientes' and operacao = 'INSERT') into v_ok;
  assert v_ok, 'Auditoria não registrou INSERT em clientes';

  -- RLS: usuário anônimo não enxerga clientes
  set local role anon;
  begin
    select exists (select 1 from public.clientes) into v_ok;
    assert not v_ok, 'Usuário anônimo conseguiu ler clientes';
  exception when insufficient_privilege then null; -- sem privilégio algum na tabela
  end;
  reset role;

  raise notice 'FASE 1: TODOS OS TESTES PASSARAM';
end $$;

rollback;
