-- =====================================================================
-- Clientes: data de nascimento (PF) e contato com nascimento (PJ).
-- Transação com ROLLBACK. Resultado esperado: "CLIENTES NASCIMENTO: TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $$
declare
  v_pf uuid;
  v_pj uuid;
  v_c public.clientes%rowtype;
begin
  -- PF com data de nascimento
  v_pf := public.salvar_cliente(jsonb_build_object('tipo_pessoa', 'PF', 'nome', 'Cliente Nascimento', 'data_nascimento', '1985-07-14'), '[]');
  select * into v_c from public.clientes where id = v_pf;
  assert v_c.data_nascimento = date '1985-07-14', 'FALHA 1: nascimento PF';

  -- Atualização mantém e altera o campo
  perform public.salvar_cliente(jsonb_build_object('id', v_pf, 'tipo_pessoa', 'PF', 'nome', 'Cliente Nascimento', 'data_nascimento', '1986-01-02'), '[]');
  assert (select data_nascimento from public.clientes where id = v_pf) = date '1986-01-02', 'FALHA 2: atualização';

  -- PJ com contato e nascimento do contato
  v_pj := public.salvar_cliente(jsonb_build_object('tipo_pessoa', 'PJ', 'nome', 'Construtora Teste', 'razao_social', 'Construtora Teste Ltda',
    'documento', '11222333000181', 'contato_nome', 'Carlos Lima', 'contato_nascimento', '1978-11-20'), '[]');
  select * into v_c from public.clientes where id = v_pj;
  assert v_c.contato_nome = 'Carlos Lima' and v_c.contato_nascimento = date '1978-11-20', 'FALHA 3: contato PJ';

  -- Data futura é recusada
  begin
    perform public.salvar_cliente(jsonb_build_object('tipo_pessoa', 'PF', 'nome', 'Futuro', 'data_nascimento', (current_date + 1)::text), '[]');
    raise exception 'FALHA 4';
  exception when sqlstate '22023' then null;
  end;

  -- Data anterior a 1900 é recusada
  begin
    perform public.salvar_cliente(jsonb_build_object('tipo_pessoa', 'PF', 'nome', 'Antigo', 'data_nascimento', '1899-12-31'), '[]');
    raise exception 'FALHA 5';
  exception when check_violation then null;
  end;

  -- Alteração registrada na auditoria
  assert exists (select 1 from public.auditoria where tabela = 'clientes' and registro_id = v_pf::text and operacao = 'UPDATE'
                 and dados_novos ->> 'data_nascimento' = '1986-01-02'), 'FALHA 6: auditoria';

  raise notice 'CLIENTES NASCIMENTO: TODOS OS TESTES PASSARAM';
end $$;

rollback;
