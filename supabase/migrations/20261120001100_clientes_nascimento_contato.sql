-- =====================================================================
-- Clientes: data de nascimento (pessoa física) e contato com data de nascimento
-- (pessoa jurídica). Dados pessoais comuns (LGPD): acesso restrito pelas mesmas
-- políticas de clientes e alterações registradas na auditoria.
-- =====================================================================
alter table public.clientes
  add column data_nascimento date,
  add column contato_nome text,
  add column contato_nascimento date,
  add constraint clientes_nascimento_minimo check (data_nascimento is null or data_nascimento >= date '1900-01-01'),
  add constraint clientes_contato_nascimento_minimo check (contato_nascimento is null or contato_nascimento >= date '1900-01-01');

-- salvar_cliente passa a gravar os novos campos (demais regras inalteradas)
create or replace function public.salvar_cliente(p_cliente jsonb, p_enderecos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_cliente ->> 'id', '')::uuid;
  v_ids uuid[];
  v_principais int;
begin
  if jsonb_typeof(p_enderecos) <> 'array' then
    raise exception 'Lista de endereços inválida' using errcode = '22023';
  end if;

  select count(*) into v_principais
  from jsonb_array_elements(p_enderecos) e
  where coalesce((e ->> 'principal')::boolean, false);
  if jsonb_array_length(p_enderecos) > 0 and v_principais <> 1 then
    raise exception 'Informe exatamente um endereço principal' using errcode = '22023';
  end if;

  if nullif(p_cliente ->> 'data_nascimento', '')::date > current_date
     or nullif(p_cliente ->> 'contato_nascimento', '')::date > current_date then
    raise exception 'A data de nascimento não pode ser futura' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.clientes (
      tipo_pessoa, nome, razao_social, documento, inscricao_estadual, telefone, whatsapp, email,
      vendedor_id, limite_credito, observacoes, status, data_nascimento, contato_nome, contato_nascimento
    ) values (
      (p_cliente ->> 'tipo_pessoa')::public.tipo_pessoa,
      trim(p_cliente ->> 'nome'),
      nullif(trim(p_cliente ->> 'razao_social'), ''),
      nullif(p_cliente ->> 'documento', ''),
      nullif(trim(p_cliente ->> 'inscricao_estadual'), ''),
      nullif(p_cliente ->> 'telefone', ''),
      nullif(p_cliente ->> 'whatsapp', ''),
      nullif(lower(trim(p_cliente ->> 'email')), ''),
      nullif(p_cliente ->> 'vendedor_id', '')::uuid,
      coalesce(nullif(p_cliente ->> 'limite_credito', '')::numeric, 0),
      nullif(trim(p_cliente ->> 'observacoes'), ''),
      coalesce(nullif(p_cliente ->> 'status', ''), 'ativo'),
      nullif(p_cliente ->> 'data_nascimento', '')::date,
      nullif(trim(p_cliente ->> 'contato_nome'), ''),
      nullif(p_cliente ->> 'contato_nascimento', '')::date
    )
    returning id into v_id;
  else
    update public.clientes set
      tipo_pessoa = (p_cliente ->> 'tipo_pessoa')::public.tipo_pessoa,
      nome = trim(p_cliente ->> 'nome'),
      razao_social = nullif(trim(p_cliente ->> 'razao_social'), ''),
      documento = nullif(p_cliente ->> 'documento', ''),
      inscricao_estadual = nullif(trim(p_cliente ->> 'inscricao_estadual'), ''),
      telefone = nullif(p_cliente ->> 'telefone', ''),
      whatsapp = nullif(p_cliente ->> 'whatsapp', ''),
      email = nullif(lower(trim(p_cliente ->> 'email')), ''),
      vendedor_id = nullif(p_cliente ->> 'vendedor_id', '')::uuid,
      limite_credito = coalesce(nullif(p_cliente ->> 'limite_credito', '')::numeric, 0),
      observacoes = nullif(trim(p_cliente ->> 'observacoes'), ''),
      status = coalesce(nullif(p_cliente ->> 'status', ''), 'ativo'),
      data_nascimento = nullif(p_cliente ->> 'data_nascimento', '')::date,
      contato_nome = nullif(trim(p_cliente ->> 'contato_nome'), ''),
      contato_nascimento = nullif(p_cliente ->> 'contato_nascimento', '')::date
    where id = v_id;
    if not found then
      raise exception 'Cliente não encontrado ou sem permissão de edição' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}'::uuid[]) into v_ids
  from jsonb_array_elements(p_enderecos) e
  where nullif(e ->> 'id', '') is not null;

  delete from public.cliente_enderecos where cliente_id = v_id and not (id = any (v_ids));
  update public.cliente_enderecos set principal = false where cliente_id = v_id and principal;

  insert into public.cliente_enderecos (
    id, cliente_id, descricao, cep, logradouro, numero, complemento, bairro, cidade, uf, referencia, principal
  )
  select
    coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
    v_id,
    nullif(trim(e ->> 'descricao'), ''),
    regexp_replace(e ->> 'cep', '\D', '', 'g'),
    trim(e ->> 'logradouro'),
    trim(e ->> 'numero'),
    nullif(trim(e ->> 'complemento'), ''),
    trim(e ->> 'bairro'),
    trim(e ->> 'cidade'),
    upper(e ->> 'uf'),
    nullif(trim(e ->> 'referencia'), ''),
    coalesce((e ->> 'principal')::boolean, false)
  from jsonb_array_elements(p_enderecos) e
  on conflict (id) do update set
    descricao = excluded.descricao,
    cep = excluded.cep,
    logradouro = excluded.logradouro,
    numero = excluded.numero,
    complemento = excluded.complemento,
    bairro = excluded.bairro,
    cidade = excluded.cidade,
    uf = excluded.uf,
    referencia = excluded.referencia,
    principal = excluded.principal
  where public.cliente_enderecos.cliente_id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.salvar_cliente(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_cliente(jsonb, jsonb) to authenticated;
