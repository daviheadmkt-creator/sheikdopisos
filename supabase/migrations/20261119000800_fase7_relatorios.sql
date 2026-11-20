-- =====================================================================
-- SHEIK DOS PISOS ERP — Fase 7: dashboard, relatórios e indicadores
--
-- Todas as consultas leem dados reais. Funções SECURITY DEFINER com checagem
-- explícita de permissão; valores financeiros só para quem pode lê-los.
-- Datas no fuso America/Sao_Paulo (vendas à noite não "pulam" de dia).
-- =====================================================================

create or replace function public.data_local(p timestamptz)
returns date language sql immutable set search_path = '' as $$
  select (p at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.hoje()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public._exigir(p_modulos text[])
returns void language plpgsql stable security definer set search_path = '' as $$
declare m text;
begin
  foreach m in array p_modulos loop
    if public.tem_permissao(m, 'ler') then return; end if;
  end loop;
  raise exception 'Sem permissão para este relatório' using errcode = '42501';
end;
$$;
revoke execute on function public._exigir(text[]) from public, anon, authenticated;

-- Vendas válidas para faturamento (confirmadas ou concluídas) no período
create or replace view public._vendas_faturadas as
select v.*, public.data_local(v.confirmada_em) as data_venda
from public.vendas v
where v.status in ('confirmada', 'concluida') and v.confirmada_em is not null;
revoke all on public._vendas_faturadas from anon, authenticated;

-- ---------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------
create or replace function public.dashboard_indicadores(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias int := p_ate - p_de + 1;
  v_fin boolean := public.tem_permissao('financeiro', 'ler') or public.tem_permissao('contas', 'ler');
  v_caixa boolean := v_fin or public.tem_permissao('caixa', 'ler');
  v_hoje date := public.hoje();
  r jsonb;
begin
  perform public._exigir(array['dashboard', 'relatorios']);

  select jsonb_build_object(
    'faturamento', coalesce(sum(total) filter (where data_venda between p_de and p_ate), 0),
    'faturamento_anterior', coalesce(sum(total) filter (where data_venda between p_de - v_dias and p_de - 1), 0),
    'faturamento_hoje', coalesce(sum(total) filter (where data_venda = v_hoje), 0),
    'qtd_vendas', count(*) filter (where data_venda between p_de and p_ate),
    'qtd_vendas_anterior', count(*) filter (where data_venda between p_de - v_dias and p_de - 1),
    'qtd_vendas_hoje', count(*) filter (where data_venda = v_hoje)
  ) into r
  from public._vendas_faturadas
  where data_venda between p_de - v_dias and greatest(p_ate, v_hoje);

  r := r || jsonb_build_object(
    'orcamentos_abertos_qtd', (select count(*) from public.orcamentos where status in ('rascunho', 'enviado', 'aprovado') and validade >= v_hoje),
    'orcamentos_abertos_valor', (select coalesce(sum(total), 0) from public.orcamentos where status in ('rascunho', 'enviado', 'aprovado') and validade >= v_hoje),
    'orcamentos_vencendo', (select count(*) from public.orcamentos where status in ('rascunho', 'enviado') and validade between v_hoje and v_hoje + 3),
    'orcamentos_periodo', (select count(*) from public.orcamentos where public.data_local(created_at) between p_de and p_ate),
    'orcamentos_convertidos', (select count(*) from public.orcamentos where public.data_local(created_at) between p_de and p_ate and status = 'convertido'),
    'estoque_critico', (select count(*) from public.vw_estoque_produtos where critico and status = 'ativo'),
    'aguardando_separacao', (select count(*) from public.entregas where status = 'aguardando_separacao'),
    'entregas_pendentes', (select count(*) from public.entregas where status in ('aguardando_separacao', 'separado', 'agendado', 'em_rota')),
    'entregas_hoje', (select count(*) from public.entregas where data_agendada = v_hoje and status in ('separado', 'agendado', 'em_rota')),
    'entregas_atrasadas', (select count(*) from public.entregas where data_agendada < v_hoje and status in ('aguardando_separacao', 'separado', 'agendado', 'em_rota')),
    'acesso_financeiro', v_fin,
    'receber_aberto', case when v_fin then (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id where t.tipo = 'receber' and p.status in ('aberta', 'parcial')) end,
    'receber_vencido', case when v_fin then (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id where t.tipo = 'receber' and p.status in ('aberta', 'parcial') and p.vencimento < v_hoje) end,
    'pagar_aberto', case when v_fin then (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id where t.tipo = 'pagar' and p.status in ('aberta', 'parcial')) end,
    'pagar_vencido', case when v_fin then (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id where t.tipo = 'pagar' and p.status in ('aberta', 'parcial') and p.vencimento < v_hoje) end,
    'pagar_hoje', case when v_fin then (select coalesce(sum(p.valor - p.valor_pago), 0) from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id where t.tipo = 'pagar' and p.status in ('aberta', 'parcial') and p.vencimento = v_hoje) end,
    'saldo_caixa', case when v_caixa then (select coalesce(sum(public.saldo_conta(id)), 0) from public.contas_financeiras where tipo = 'caixa' and ativo) end,
    'saldo_contas', case when v_fin then (select coalesce(sum(public.saldo_conta(id)), 0) from public.contas_financeiras where ativo) end,
    'recebido', case when v_fin then (select coalesce(sum(case when m.tipo = 'entrada' then m.valor else -m.valor end), 0) from public.movimentos_financeiros m
                  where m.data between p_de and p_ate and (m.natureza = 'recebimento' or (m.natureza = 'estorno' and exists (select 1 from public.movimentos_financeiros o where o.id = m.estorno_de and o.natureza = 'recebimento')))) end
  );
  return r;
end;
$$;

create or replace function public.dashboard_faturamento_diario(p_de date, p_ate date)
returns table (data date, faturamento numeric, qtd_vendas bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['dashboard', 'relatorios']);
  return query
    select d::date, coalesce(sum(v.total), 0), count(v.id)
    from generate_series(p_de, p_ate, interval '1 day') d
    left join public._vendas_faturadas v on v.data_venda = d::date
    group by d order by d;
end;
$$;

create or replace function public.dashboard_ultimas_vendas(p_limite int default 8)
returns table (id uuid, numero bigint, cliente text, total numeric, status public.status_venda, data timestamptz, vendedor text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['dashboard', 'vendas']);
  return query
    select v.id, v.numero, c.nome, v.total, v.status, coalesce(v.confirmada_em, v.created_at), u.nome
    from public.vendas v join public.clientes c on c.id = v.cliente_id left join public.usuarios u on u.id = v.vendedor_id
    where v.status <> 'rascunho'
    order by coalesce(v.confirmada_em, v.created_at) desc limit least(p_limite, 50);
end;
$$;

-- ---------------------------------------------------------------------
-- Comercial
-- ---------------------------------------------------------------------
create or replace function public.relatorio_faturamento(p_de date, p_ate date, p_agrupar text default 'dia')
returns table (periodo text, qtd_vendas bigint, subtotal numeric, descontos numeric, frete numeric, total numeric, ticket_medio numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios']);
  return query
    select case when p_agrupar = 'mes' then to_char(v.data_venda, 'YYYY-MM') else to_char(v.data_venda, 'YYYY-MM-DD') end,
           count(*), sum(v.subtotal), sum(v.desconto_total), sum(v.frete), sum(v.total), round(avg(v.total), 2)
    from public._vendas_faturadas v
    where v.data_venda between p_de and p_ate
    group by 1 order by 1;
end;
$$;

create or replace function public.relatorio_formas_pagamento(p_de date, p_ate date)
returns table (forma public.forma_pagamento, qtd bigint, valor numeric, participacao numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios']);
  return query
    with x as (
      select p.forma, count(*) as qtd, sum(p.valor) as valor
      from public.venda_pagamentos p join public._vendas_faturadas v on v.id = p.venda_id
      where v.data_venda between p_de and p_ate group by p.forma
    )
    select x.forma, x.qtd, x.valor, round(x.valor / nullif(sum(x.valor) over (), 0) * 100, 2) from x order by x.valor desc;
end;
$$;

create or replace function public.relatorio_vendas(p_de date, p_ate date)
returns table (numero bigint, data date, cliente text, vendedor text, itens bigint, subtotal numeric, descontos numeric, frete numeric,
               total numeric, custo numeric, margem numeric, status public.status_venda, entrega text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios']);
  return query
    select v.numero, v.data_venda, c.nome, u.nome, (select count(*) from public.venda_itens i where i.venda_id = v.id),
           v.subtotal, v.desconto_total, v.frete, v.total,
           (select coalesce(sum(round(i.quantidade * coalesce(i.custo_unitario, 0), 2)), 0) from public.venda_itens i where i.venda_id = v.id),
           v.total - v.frete - (select coalesce(sum(round(i.quantidade * coalesce(i.custo_unitario, 0), 2)), 0) from public.venda_itens i where i.venda_id = v.id),
           v.status, v.tipo_entrega
    from public._vendas_faturadas v join public.clientes c on c.id = v.cliente_id left join public.usuarios u on u.id = v.vendedor_id
    where v.data_venda between p_de and p_ate
    order by v.data_venda, v.numero;
end;
$$;

create or replace function public.relatorio_vendedores(p_de date, p_ate date)
returns table (vendedor text, qtd_vendas bigint, faturamento numeric, ticket_medio numeric, descontos numeric, desconto_medio_perc numeric,
               orcamentos bigint, orcamentos_convertidos bigint, conversao_perc numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios']);
  return query
    with v as (
      select vendedor_id, count(*) as qtd, sum(total) as fat, sum(desconto_total) as descs, sum(subtotal) as sub
      from public._vendas_faturadas where data_venda between p_de and p_ate group by vendedor_id
    ), o as (
      select vendedor_id, count(*) as qtd, count(*) filter (where status = 'convertido') as conv
      from public.orcamentos where public.data_local(created_at) between p_de and p_ate group by vendedor_id
    )
    select coalesce(u.nome, 'Sem vendedor'), coalesce(v.qtd, 0), coalesce(v.fat, 0), round(coalesce(v.fat / nullif(v.qtd, 0), 0), 2),
           coalesce(v.descs, 0), round(coalesce(v.descs / nullif(v.sub, 0) * 100, 0), 2),
           coalesce(o.qtd, 0), coalesce(o.conv, 0), round(coalesce(o.conv::numeric / nullif(o.qtd, 0) * 100, 0), 2)
    from v full join o
      on coalesce(o.vendedor_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v.vendedor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    left join public.usuarios u on u.id = coalesce(v.vendedor_id, o.vendedor_id)
    order by 3 desc;
end;
$$;

create or replace function public.relatorio_clientes(p_de date, p_ate date)
returns table (cliente text, documento text, cidade text, qtd_compras bigint, valor numeric, ticket_medio numeric, primeira_compra date,
               ultima_compra date, dias_sem_comprar int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios']);
  return query
    select c.nome, c.documento, (select e.cidade || '/' || e.uf from public.cliente_enderecos e where e.cliente_id = c.id order by e.principal desc limit 1),
           count(v.id), sum(v.total), round(avg(v.total), 2),
           (select min(x.data_venda) from public._vendas_faturadas x where x.cliente_id = c.id),
           (select max(x.data_venda) from public._vendas_faturadas x where x.cliente_id = c.id),
           public.hoje() - (select max(x.data_venda) from public._vendas_faturadas x where x.cliente_id = c.id)
    from public._vendas_faturadas v join public.clientes c on c.id = v.cliente_id
    where v.data_venda between p_de and p_ate
    group by c.id order by 5 desc;
end;
$$;

-- Produtos vendidos (base para "mais vendidos" e curva ABC)
create or replace function public.relatorio_produtos(p_de date, p_ate date)
returns table (produto_id uuid, sku text, descricao text, categoria text, unidade text, quantidade numeric, caixas numeric, valor numeric,
               custo numeric, margem numeric, margem_perc numeric, qtd_vendas bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios', 'dashboard']);
  return query
    select p.id, p.sku, p.descricao, cat.nome, p.unidade, sum(i.quantidade),
           case when p.eh_revestimento and p.m2_por_caixa > 0 and p.unidade = 'M2' then round(sum(i.quantidade) / p.m2_por_caixa, 1) end,
           sum(i.valor_total), sum(round(i.quantidade * coalesce(i.custo_unitario, 0), 2)),
           sum(i.valor_total) - sum(round(i.quantidade * coalesce(i.custo_unitario, 0), 2)),
           round((sum(i.valor_total) - sum(round(i.quantidade * coalesce(i.custo_unitario, 0), 2))) / nullif(sum(i.valor_total), 0) * 100, 2),
           count(distinct v.id)
    from public.venda_itens i
    join public._vendas_faturadas v on v.id = i.venda_id
    join public.produtos p on p.id = i.produto_id
    join public.categorias cat on cat.id = p.categoria_id
    where v.data_venda between p_de and p_ate
    group by p.id, cat.nome
    order by 8 desc;
end;
$$;

create or replace function public.relatorio_vendas_categoria(p_de date, p_ate date)
returns table (categoria text, valor numeric, quantidade_itens bigint, participacao numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios', 'dashboard']);
  return query
    with x as (
      select cat.nome, sum(i.valor_total) as valor, count(*) as qtd
      from public.venda_itens i join public._vendas_faturadas v on v.id = i.venda_id
      join public.produtos p on p.id = i.produto_id join public.categorias cat on cat.id = p.categoria_id
      where v.data_venda between p_de and p_ate group by cat.nome
    )
    select x.nome, x.valor, x.qtd, round(x.valor / nullif(sum(x.valor) over (), 0) * 100, 2) from x order by x.valor desc;
end;
$$;

-- Curva ABC por faturamento: A até 80% acumulado, B até 95%, C restante
create or replace function public.relatorio_curva_abc(p_de date, p_ate date)
returns table (posicao bigint, sku text, descricao text, categoria text, valor numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios']);
  return query
    with p as (select r.sku, r.descricao, r.categoria, r.valor, r.produto_id from public.relatorio_produtos(p_de, p_ate) r where r.valor > 0),
    t as (select sum(p.valor) as total from p),
    o as (
      select p.*, row_number() over (order by p.valor desc, p.produto_id) as pos,
             sum(p.valor) over (order by p.valor desc, p.produto_id rows unbounded preceding) as acum
      from p
    )
    select o.pos, o.sku, o.descricao, o.categoria, o.valor, round(o.valor / t.total * 100, 2), round(o.acum / t.total * 100, 2),
           case when (o.acum - o.valor) / t.total < 0.80 then 'A' when (o.acum - o.valor) / t.total < 0.95 then 'B' else 'C' end
    from o cross join t order by o.pos;
end;
$$;

-- ---------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------
create or replace function public.relatorio_estoque()
returns table (sku text, descricao text, categoria text, unidade text, fisico numeric, reservado numeric, avariado numeric, disponivel numeric,
               estoque_minimo numeric, critico boolean, custo numeric, valor_estoque numeric, lotes bigint, ultima_venda date, dias_sem_venda int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios', 'estoque']);
  return query
    select e.sku, e.descricao, cat.nome, e.unidade, e.fisico, e.reservado, e.avariado, e.disponivel, e.estoque_minimo, e.critico,
           p.custo, round(e.fisico * p.custo, 2), e.lotes_com_saldo,
           (select max(v.data_venda) from public.venda_itens i join public._vendas_faturadas v on v.id = i.venda_id where i.produto_id = e.produto_id),
           public.hoje() - (select max(v.data_venda) from public.venda_itens i join public._vendas_faturadas v on v.id = i.venda_id where i.produto_id = e.produto_id)
    from public.vw_estoque_produtos e join public.produtos p on p.id = e.produto_id join public.categorias cat on cat.id = e.categoria_id
    where e.status = 'ativo'
    order by 12 desc nulls last;
end;
$$;

-- ---------------------------------------------------------------------
-- Compras e fornecedores
-- ---------------------------------------------------------------------
create or replace function public.relatorio_compras(p_de date, p_ate date)
returns table (numero bigint, data date, fornecedor text, status public.status_pedido_compra, previsao date, total numeric,
               recebido_perc numeric, atrasado boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios', 'compras']);
  return query
    select p.numero, public.data_local(p.created_at), coalesce(f.nome_fantasia, f.razao_social), p.status, p.previsao_entrega, p.total,
           round(coalesce((select sum(i.quantidade_recebida) / nullif(sum(i.quantidade), 0) from public.compras_pedido_itens i where i.pedido_id = p.id), 0) * 100, 1),
           p.previsao_entrega < public.hoje() and p.status in ('aprovado', 'parcialmente_recebido')
    from public.compras_pedidos p join public.fornecedores f on f.id = p.fornecedor_id
    where public.data_local(p.created_at) between p_de and p_ate and p.status <> 'cancelado'
    order by p.created_at;
end;
$$;

create or replace function public.relatorio_fornecedores(p_de date, p_ate date)
returns table (fornecedor text, cnpj text, pedidos bigint, valor_pedidos numeric, recebimentos bigint, valor_recebido numeric,
               prazo_medio_dias numeric, pedidos_atrasados bigint, produtos_fornecidos bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios', 'fornecedores']);
  return query
    select coalesce(f.nome_fantasia, f.razao_social), f.cnpj,
      (select count(*) from public.compras_pedidos p where p.fornecedor_id = f.id and p.status <> 'cancelado' and public.data_local(p.created_at) between p_de and p_ate),
      (select coalesce(sum(p.total), 0) from public.compras_pedidos p where p.fornecedor_id = f.id and p.status <> 'cancelado' and public.data_local(p.created_at) between p_de and p_ate),
      (select count(*) from public.compras_recebimentos r join public.compras_pedidos p on p.id = r.pedido_id where p.fornecedor_id = f.id and r.status = 'confirmado' and r.data_recebimento between p_de and p_ate),
      (select coalesce(sum(t.valor_total), 0) from public.titulos t where t.fornecedor_id = f.id and t.documento_tipo = 'compra' and t.status <> 'cancelado' and t.competencia between p_de and p_ate),
      (select round(avg(r.data_recebimento - public.data_local(p.aprovado_em)), 1) from public.compras_recebimentos r join public.compras_pedidos p on p.id = r.pedido_id
         where p.fornecedor_id = f.id and r.status = 'confirmado' and p.aprovado_em is not null and r.data_recebimento between p_de and p_ate),
      (select count(*) from public.compras_pedidos p where p.fornecedor_id = f.id and p.status in ('aprovado', 'parcialmente_recebido') and p.previsao_entrega < public.hoje()),
      (select count(*) from public.produto_fornecedores pf where pf.fornecedor_id = f.id)
    from public.fornecedores f
    where f.status = 'ativo' or exists (select 1 from public.compras_pedidos p where p.fornecedor_id = f.id and public.data_local(p.created_at) between p_de and p_ate)
    order by 4 desc, 1;
end;
$$;

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create or replace function public.relatorio_aging(p_tipo public.tipo_titulo)
returns table (ordem int, faixa text, parcelas bigint, valor numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['financeiro', 'contas']);
  return query
    with x as (
      select p.valor - p.valor_pago as aberto, public.hoje() - p.vencimento as atraso
      from public.titulo_parcelas p join public.titulos t on t.id = p.titulo_id
      where t.tipo = p_tipo and p.status in ('aberta', 'parcial')
    ), f(ordem, faixa, de, ate) as (values
      (1, 'A vencer (mais de 30 dias)', -100000, -31), (2, 'A vencer em até 30 dias', -30, 0),
      (3, 'Vencido 1–30 dias', 1, 30), (4, 'Vencido 31–60 dias', 31, 60), (5, 'Vencido 61–90 dias', 61, 90), (6, 'Vencido há mais de 90 dias', 91, 100000))
    select f.ordem, f.faixa, count(x.aberto), coalesce(sum(x.aberto), 0)
    from f left join x on x.atraso between f.de and f.ate
    group by f.ordem, f.faixa order by f.ordem;
end;
$$;

-- ---------------------------------------------------------------------
-- Logística
-- ---------------------------------------------------------------------
create or replace function public.relatorio_entregas(p_de date, p_ate date)
returns table (responsavel text, total bigint, entregues bigint, devolvidas bigint, com_devolucao_parcial bigint, atrasadas bigint,
               prazo_medio_horas numeric, frete_custo numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exigir(array['relatorios', 'entregas']);
  return query
    select case when e.tipo = 'retirada' then 'Retirada na loja' else coalesce(m.nome, t.nome, 'Sem responsável') end,
      count(*), count(*) filter (where e.status = 'entregue'), count(*) filter (where e.status = 'devolvido'),
      count(*) filter (where e.status = 'entregue' and exists (select 1 from public.entrega_itens i where i.entrega_id = e.id and i.quantidade_devolvida > 0)),
      count(*) filter (where e.data_agendada is not null and ((e.entregue_em is not null and public.data_local(e.entregue_em) > e.data_agendada)
                                                            or (e.entregue_em is null and e.status in ('separado', 'agendado', 'em_rota') and e.data_agendada < public.hoje()))),
      round(avg(extract(epoch from (e.entregue_em - v.confirmada_em)) / 3600) filter (where e.entregue_em is not null), 1),
      coalesce(sum(e.frete_custo), 0)
    from public.entregas e join public.vendas v on v.id = e.venda_id
    left join public.motoristas m on m.id = e.motorista_id left join public.transportadoras t on t.id = e.transportadora_id
    where e.status <> 'cancelado' and coalesce(e.data_agendada, public.data_local(e.created_at)) between p_de and p_ate
    group by 1 order by 2 desc;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.data_local(timestamptz)', 'public.hoje()',
    'public.dashboard_indicadores(date, date)', 'public.dashboard_faturamento_diario(date, date)', 'public.dashboard_ultimas_vendas(int)',
    'public.relatorio_faturamento(date, date, text)', 'public.relatorio_formas_pagamento(date, date)', 'public.relatorio_vendas(date, date)',
    'public.relatorio_vendedores(date, date)', 'public.relatorio_clientes(date, date)', 'public.relatorio_produtos(date, date)',
    'public.relatorio_vendas_categoria(date, date)', 'public.relatorio_curva_abc(date, date)', 'public.relatorio_estoque()',
    'public.relatorio_compras(date, date)', 'public.relatorio_fornecedores(date, date)', 'public.relatorio_aging(public.tipo_titulo)',
    'public.relatorio_entregas(date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
