-- =====================================================================
-- Produtos do ERP → LOJA VIRTUAL (plugin "Sheik ERP Conector")
--
-- Lógica:
--  * produtos.vender_no_site (padrão: ligado). Produto ligado, ativo e com estoque é
--    criado automaticamente no site; depois preço, estoque, categoria e marca seguem
--    sincronizados. Desligar (ou inativar) esconde o produto no site (rascunho).
--  * Botão "Adicionar no site" no ERP publica na hora, mesmo sem estoque (esgotado).
--  * categorias.site_categoria = slug da subcategoria do site (ex.: porcelanatos).
--  * O plugin busca as alterações a cada 10 min (cursor alterado_em|id) e devolve o
--    resultado, gravado em produto_site (tabela própria, para não alterar
--    produtos.updated_at e não criar ciclo de sincronização).
--  * Estoque no site: disponível (físico − reservado − avariado) menos o que já está em
--    vendas do site ainda em rascunho. Pisos: em CAIXAS do MAIOR lote (o pedido precisa
--    sair de um único lote/tonalidade).
-- =====================================================================

alter table public.produtos add column vender_no_site boolean not null default true;

alter table public.categorias
  add column site_categoria text check (site_categoria is null or site_categoria ~ '^[a-z0-9-]{1,100}$');

-- Vínculo inicial das categorias padrão com as subcategorias do tema do site
update public.categorias set site_categoria = v.slug
from (values ('Porcelanato', 'porcelanatos'), ('Cerâmica', 'ceramicos'), ('Revestimento de parede', 'revestimentos'),
             ('Argamassa', 'argamassas-colantes'), ('Rejunte', 'rejuntes')) as v(nome, slug)
where categorias.nome = v.nome and categorias.site_categoria is null;

-- ---------------------------------------------------------------- Situação no site
create table public.produto_site (
  produto_id uuid primary key references public.produtos(id) on delete cascade,
  site_produto_id bigint,
  url text,
  situacao text not null check (situacao in ('publicado', 'oculto', 'aguardando_estoque', 'erro')),
  mensagem text,
  estoque_enviado numeric(14,3),
  sincronizado_em timestamptz not null default now()
);
alter table public.produto_site enable row level security;
create policy produto_site_select on public.produto_site for select to authenticated
  using ((select public.tem_permissao('produtos', 'ler')));
revoke insert, update, delete, truncate on public.produto_site from authenticated;
revoke all on public.produto_site from anon;

create index if not exists venda_itens_produto_venda_idx on public.venda_itens(produto_id, venda_id);

-- ---------------------------------------------------------------- Dados de um produto para o site
create or replace function public._loja_num(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null
              else rtrim(rtrim(p::text, '0'), '.') end;
$$;

create or replace function public._loja_estoque_site(p_produto uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prod record;
  v_disp numeric;
  v_rascunho numeric;
begin
  select eh_revestimento, m2_por_caixa, unidade into v_prod from public.produtos where id = p_produto;

  if v_prod.eh_revestimento then
    select coalesce(max(s.total), 0) into v_disp
    from (select sum(es.quantidade_disponivel) as total
          from public.estoque_saldos es join public.depositos d on d.id = es.deposito_id and d.ativo
          where es.produto_id = p_produto group by es.lote_id) s;
  else
    select coalesce(sum(es.quantidade_disponivel), 0) into v_disp
    from public.estoque_saldos es join public.depositos d on d.id = es.deposito_id and d.ativo
    where es.produto_id = p_produto;
  end if;

  -- Já vendido no site, ainda sem reserva (venda em rascunho)
  select coalesce(sum(vi.quantidade), 0) into v_rascunho
  from public.venda_itens vi join public.vendas v on v.id = vi.venda_id
  where vi.produto_id = p_produto and v.origem = 'loja' and v.status = 'rascunho';
  v_disp := greatest(v_disp - v_rascunho, 0);

  -- Site vende pisos por caixa
  if v_prod.eh_revestimento and v_prod.m2_por_caixa > 0 and v_prod.unidade <> 'CX' then
    return floor(v_disp / v_prod.m2_por_caixa);
  end if;
  return floor(v_disp);
end;
$$;

create or replace function public._loja_produto_alterado_em(p_produto uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    p.updated_at, c.updated_at, m.updated_at,
    (select max(es.updated_at) from public.estoque_saldos es where es.produto_id = p.id),
    (select max(pi.created_at) from public.produto_imagens pi where pi.produto_id = p.id),
    (select max(v.updated_at) from public.vendas v join public.venda_itens vi on vi.venda_id = v.id
      where vi.produto_id = p.id and v.origem = 'loja')
  )
  from public.produtos p
  join public.categorias c on c.id = p.categoria_id
  left join public.marcas m on m.id = p.marca_id
  where p.id = p_produto;
$$;

create or replace function public._loja_produto_payload(p_produto uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'erp_id', p.id,
    'sku', p.sku,
    'nome', p.descricao,
    'ativo', p.status = 'ativo' and p.vender_no_site and c.ativo,
    -- O site trabalha com preço por m² nos pisos (o carrinho multiplica pelo m² da caixa)
    'preco', case when p.eh_revestimento and p.m2_por_caixa > 0 and p.unidade = 'CX'
                  then round(p.preco_venda / p.m2_por_caixa, 2) else p.preco_venda end,
    'm2_caixa', case when p.eh_revestimento and p.m2_por_caixa > 0 then public._loja_num(p.m2_por_caixa) end,
    'pecas_caixa', p.pecas_por_caixa,
    'estoque', public._loja_estoque_site(p.id),
    'categoria', jsonb_build_object('nome', c.nome, 'site', c.site_categoria),
    'marca', m.nome,
    'acabamento', nullif(trim(p.acabamento), ''),
    'formato', case when p.eh_revestimento and p.largura_cm is not null and p.comprimento_cm is not null
                    then public._loja_num(least(p.largura_cm, p.comprimento_cm)) || 'x' || public._loja_num(greatest(p.largura_cm, p.comprimento_cm)) end,
    'peso_kg', public._loja_num(p.peso_kg),
    'codigo_barras', p.codigo_barras,
    'imagens', coalesce((select jsonb_agg(pi.storage_path order by pi.principal desc, pi.ordem)
                         from public.produto_imagens pi where pi.produto_id = p.id), '[]'::jsonb),
    'alterado_em', public._loja_produto_alterado_em(p.id)
  )
  from public.produtos p
  join public.categorias c on c.id = p.categoria_id
  left join public.marcas m on m.id = p.marca_id
  where p.id = p_produto;
$$;

-- ---------------------------------------------------------------- Pontos de entrada (service_role)
-- Alterações desde o cursor ("<timestamp>|<uuid>"), em lotes; ou produtos específicos (p_ids).
-- Itens alterados no último minuto ficam para a próxima busca (transações ainda abertas).
create or replace function public.loja_produtos_site(p_cursor text default null, p_ids uuid[] default null, p_limite int default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ts timestamptz := coalesce(nullif(split_part(coalesce(p_cursor, ''), '|', 1), '')::timestamptz, '-infinity');
  v_id uuid := coalesce(nullif(split_part(coalesce(p_cursor, ''), '|', 2), '')::uuid, '00000000-0000-0000-0000-000000000000');
  v_lim int := least(greatest(coalesce(p_limite, 40), 1), 200);
  v_lista jsonb;
  v_ult record;
  v_total int;
begin
  if p_ids is not null then
    return jsonb_build_object('produtos', coalesce((
      select jsonb_agg(public._loja_produto_payload(id)) from public.produtos where id = any (p_ids)), '[]'::jsonb),
      'cursor', p_cursor, 'mais', false);
  end if;

  with alt as (
    select p.id, public._loja_produto_alterado_em(p.id) as em
    from public.produtos p
    left join public.produto_site ps on ps.produto_id = p.id
    where p.vender_no_site or ps.site_produto_id is not null
  ), sel as (
    select id, em from alt
    where em <= now() - interval '1 minute' and (em, id) > (v_ts, v_id)
    order by em, id
    limit v_lim + 1
  )
  select jsonb_agg(public._loja_produto_payload(s.id) order by s.em, s.id) filter (where s.rn <= v_lim),
         count(*)
  into v_lista, v_total
  from (select sel.*, row_number() over (order by em, id) as rn from sel) s;

  select em, id into v_ult from (
    select (x ->> 'alterado_em')::timestamptz as em, (x ->> 'erp_id')::uuid as id
    from jsonb_array_elements(coalesce(v_lista, '[]'::jsonb)) x) t
  order by em desc, id desc limit 1;

  return jsonb_build_object(
    'produtos', coalesce(v_lista, '[]'::jsonb),
    'cursor', case when v_ult.id is null then p_cursor else v_ult.em::text || '|' || v_ult.id end,
    'mais', v_total > v_lim
  );
end;
$$;

-- Resultado aplicado no site: [{erp_id, site_id, url, situacao, mensagem, estoque}]
create or replace function public.loja_registrar_site_produtos(p jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if jsonb_typeof(p) <> 'array' then raise exception 'Lista inválida' using errcode = '22023'; end if;
  insert into public.produto_site (produto_id, site_produto_id, url, situacao, mensagem, estoque_enviado, sincronizado_em)
  select (x ->> 'erp_id')::uuid, nullif(x ->> 'site_id', '')::bigint, left(nullif(x ->> 'url', ''), 500),
         case when x ->> 'situacao' in ('publicado', 'oculto', 'aguardando_estoque', 'erro') then x ->> 'situacao' else 'erro' end,
         left(nullif(x ->> 'mensagem', ''), 500), nullif(x ->> 'estoque', '')::numeric, now()
  from jsonb_array_elements(p) x
  where exists (select 1 from public.produtos pr where pr.id = (x ->> 'erp_id')::uuid)
  on conflict (produto_id) do update set
    site_produto_id = coalesce(excluded.site_produto_id, public.produto_site.site_produto_id),
    url = coalesce(excluded.url, public.produto_site.url),
    situacao = excluded.situacao, mensagem = excluded.mensagem,
    estoque_enviado = excluded.estoque_enviado, sincronizado_em = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- Privilégios
do $$
declare f text;
begin
  foreach f in array array[
    'public._loja_num(numeric)',
    'public._loja_estoque_site(uuid)',
    'public._loja_produto_alterado_em(uuid)',
    'public._loja_produto_payload(uuid)',
    'public.loja_produtos_site(text, uuid[], int)',
    'public.loja_registrar_site_produtos(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function public.loja_produtos_site(text, uuid[], int) to service_role;
grant execute on function public.loja_registrar_site_produtos(jsonb) to service_role;
