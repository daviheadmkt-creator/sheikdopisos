import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarX,
  ChevronRight,
  ClipboardList,
  FileText,
  Minus,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { PeriodoFiltro } from '@/components/common/PeriodoFiltro'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthProvider'
import { STATUS_VENDA, type StatusVenda } from '@/features/comercial/tipos'
import { formatarData, formatarMoeda, formatarNumero } from '@/lib/format'
import { periodoPreset, variacaoPerc } from '@/lib/periodos'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { faturamentoDiario, indicadores, produtosVendidos, ultimasVendas, vendasPorCategoria } from '@/features/relatorios/api'

// Série única: azul-safira (contraste ≥ 4.5:1 sobre branco). Dourado fica para destaques de marca.
const COR_SERIE = '#006FB9'
const eixo = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }
const moedaCompacta = (n: number) => n.toLocaleString('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 })
const tooltipEstilo = { borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }

export function DashboardPage() {
  const { usuario } = useAuth()
  const [p, setP] = useState(periodoPreset('mes'))
  const ind = useQuery({ queryKey: ['dashboard', 'indicadores', p], queryFn: () => indicadores(p.de, p.ate), refetchInterval: 5 * 60_000 })
  const serie = useQuery({ queryKey: ['dashboard', 'diario', p], queryFn: () => faturamentoDiario(p.de, p.ate) })
  const cats = useQuery({ queryKey: ['dashboard', 'categorias', p], queryFn: () => vendasPorCategoria(p.de, p.ate) })
  const top = useQuery({ queryKey: ['dashboard', 'produtos', p], queryFn: () => produtosVendidos(p.de, p.ate) })
  const ultimas = useQuery({ queryKey: ['dashboard', 'ultimas'], queryFn: ultimasVendas })

  const dadosSerie = useMemo(() => (serie.data ?? []).map((d) => ({ dia: formatarData(`${d.data}T12:00:00`).slice(0, 5), Faturamento: Number(d.faturamento), vendas: Number(d.qtd_vendas) })), [serie.data])
  const temFat = dadosSerie.some((d) => d.Faturamento > 0)

  if (ind.isLoading) return <Carregando />
  if (ind.error) return <ErroCarregamento mensagem={mensagemErro(ind.error)} />
  const i = ind.data!
  const ticket = i.qtd_vendas ? i.faturamento / i.qtd_vendas : 0
  const ticketAnt = i.qtd_vendas_anterior ? i.faturamento_anterior / i.qtd_vendas_anterior : 0
  const conversao = i.orcamentos_periodo ? (i.orcamentos_convertidos / i.orcamentos_periodo) * 100 : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Olá, {usuario?.nome?.split(' ')[0]}. Indicadores calculados com os dados reais do sistema.</p>
        </div>
        <PeriodoFiltro de={p.de} ate={p.ate} onChange={setP} />
      </div>

      {/* KPIs comerciais */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-sidebar text-white">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Faturamento no período</p>
            <p className="mt-1 text-3xl font-semibold text-primary tabular-nums">{formatarMoeda(i.faturamento)}</p>
            <Delta atual={i.faturamento} anterior={i.faturamento_anterior} escuro />
          </CardContent>
        </Card>
        <Kpi icone={ShoppingCart} titulo="Faturamento hoje" valor={formatarMoeda(i.faturamento_hoje)} sub={`${i.qtd_vendas_hoje} venda(s) hoje`} link="/vendas" />
        <Kpi icone={Receipt} titulo="Vendas no período" valor={formatarNumero(i.qtd_vendas, 0)} extra={<Delta atual={i.qtd_vendas} anterior={i.qtd_vendas_anterior} />} link="/vendas" />
        <Kpi icone={Wallet} titulo="Ticket médio" valor={formatarMoeda(ticket)} extra={<Delta atual={ticket} anterior={ticketAnt} />} />
      </div>

      {/* KPIs operacionais e financeiros */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icone={FileText} titulo="Orçamentos abertos" valor={formatarNumero(i.orcamentos_abertos_qtd, 0)} sub={`${formatarMoeda(i.orcamentos_abertos_valor)}${conversao !== null ? ` · conversão ${formatarNumero(conversao, 0)}%` : ''}`} link="/orcamentos" />
        <Kpi icone={ArrowDownRight} titulo="Contas a receber" valor={i.receber_aberto !== null ? formatarMoeda(i.receber_aberto) : 'Sem acesso'} sub={i.receber_vencido ? `${formatarMoeda(i.receber_vencido)} vencido` : i.receber_aberto !== null ? 'Nada vencido' : undefined} alerta={!!i.receber_vencido} link={i.acesso_financeiro ? '/contas?tipo=receber' : undefined} />
        <Kpi icone={ArrowUpRight} titulo="Contas a pagar" valor={i.pagar_aberto !== null ? formatarMoeda(i.pagar_aberto) : 'Sem acesso'} sub={i.pagar_vencido ? `${formatarMoeda(i.pagar_vencido)} vencido` : i.pagar_hoje ? `${formatarMoeda(i.pagar_hoje)} vence hoje` : i.pagar_aberto !== null ? 'Nada vencido' : undefined} alerta={!!i.pagar_vencido} link={i.acesso_financeiro ? '/contas?tipo=pagar' : undefined} />
        <Kpi icone={Wallet} titulo="Saldo de caixa" valor={i.saldo_caixa !== null ? formatarMoeda(i.saldo_caixa) : 'Sem acesso'} sub={i.saldo_contas !== null ? `Todas as contas: ${formatarMoeda(i.saldo_contas)}` : undefined} link={i.saldo_caixa !== null ? '/caixa' : undefined} />
        <Kpi icone={Boxes} titulo="Estoque crítico" valor={formatarNumero(i.estoque_critico, 0)} sub="produtos abaixo do mínimo" alerta={i.estoque_critico > 0} link="/estoque?situacao=critico" />
        <Kpi icone={PackageCheck} titulo="Aguardando separação" valor={formatarNumero(i.aguardando_separacao, 0)} sub="pedidos" link="/separacao" />
        <Kpi icone={Truck} titulo="Entregas pendentes" valor={formatarNumero(i.entregas_pendentes, 0)} sub={`${i.entregas_hoje} hoje${i.entregas_atrasadas ? ` · ${i.entregas_atrasadas} atrasada(s)` : ''}`} alerta={i.entregas_atrasadas > 0} link="/entregas" />
        <Kpi icone={ArrowDownRight} titulo="Recebido no período" valor={i.recebido !== null ? formatarMoeda(i.recebido) : 'Sem acesso'} sub="dinheiro que efetivamente entrou" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Faturamento diário</CardTitle>
            <CardDescription>Vendas confirmadas por dia no período.</CardDescription>
          </CardHeader>
          <CardContent>
            {serie.isLoading ? <Carregando /> : !temFat ? <Vazio titulo="Sem vendas no período" /> : (
              <div className="h-64" role="img" aria-label="Gráfico de área do faturamento diário">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dadosSerie} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COR_SERIE} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={COR_SERIE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={eixo} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} tick={eixo} width={64} tickFormatter={moedaCompacta} />
                    <Tooltip
                      cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
                      contentStyle={tooltipEstilo}
                      formatter={(v: number, _n, item) => [`${formatarMoeda(v)} · ${item.payload.vendas} venda(s)`, 'Faturamento']}
                    />
                    <Area type="monotone" dataKey="Faturamento" stroke={COR_SERIE} strokeWidth={2} fill="url(#gradFat)" activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vendas por categoria</CardTitle>
            <CardDescription>Valor dos itens vendidos no período.</CardDescription>
          </CardHeader>
          <CardContent>
            {cats.isLoading ? <Carregando /> : !cats.data?.length ? <Vazio titulo="Sem vendas no período" /> : (
              <div style={{ height: Math.max(160, cats.data.length * 40) }} role="img" aria-label="Gráfico de barras de vendas por categoria">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cats.data.map((c) => ({ ...c, valor: Number(c.valor) }))} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={8}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="categoria" tickLine={false} axisLine={false} tick={eixo} width={130} />
                    <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} contentStyle={tooltipEstilo} formatter={(v: number, _n, item) => [`${formatarMoeda(v)} (${formatarNumero(item.payload.participacao, 1)}%)`, 'Vendas']} />
                    <Bar dataKey="valor" fill={COR_SERIE} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))', formatter: (v: number) => moedaCompacta(v) }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Produtos mais vendidos</CardTitle>
            <Link to="/relatorios?r=produtos" className="text-xs text-info hover:underline">Ver relatório</Link>
          </CardHeader>
          <CardContent>
            {top.isLoading ? <Carregando /> : !top.data?.length ? <Vazio titulo="Sem vendas no período" /> : (
              <ol className="space-y-3">
                {top.data.slice(0, 8).map((p, n) => {
                  const max = Number(top.data![0].valor) || 1
                  return (
                    <li key={p.produto_id} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="truncate"><span className="mr-1.5 text-muted-foreground">{n + 1}.</span>{p.descricao}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatarMoeda(p.valor)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${(Number(p.valor) / max) * 100}%` }} /></div>
                        <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{p.caixas !== null ? `${formatarNumero(p.caixas, 0)} cx` : `${formatarNumero(p.quantidade, 0)} ${p.unidade}`}</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Últimas vendas</CardTitle>
            <Link to="/vendas" className="text-xs text-info hover:underline">Ver todas</Link>
          </CardHeader>
          <CardContent>
            {ultimas.isLoading ? <Carregando /> : !ultimas.data?.length ? <Vazio titulo="Nenhuma venda ainda" /> : (
              <ul className="divide-y">
                {ultimas.data.map((v) => (
                  <li key={v.id}>
                    <Link to={`/vendas/${v.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">#{v.numero} · {v.cliente}</span>
                        <span className="text-xs text-muted-foreground">{formatarData(v.data, true)}{v.vendedor && ` · ${v.vendedor}`}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-medium tabular-nums">{formatarMoeda(v.total)}</span>
                        <Badge variant={STATUS_VENDA[v.status as StatusVenda]?.variant ?? 'neutral'}>{STATUS_VENDA[v.status as StatusVenda]?.label ?? v.status}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Alertas</CardTitle><CardDescription>Itens que pedem ação.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Alerta mostrar={i.estoque_critico > 0} icone={Boxes} nivel="alto" texto={`${i.estoque_critico} produto(s) com estoque crítico`} link="/estoque?situacao=critico" />
            <Alerta mostrar={i.entregas_atrasadas > 0} icone={CalendarX} nivel="alto" texto={`${i.entregas_atrasadas} entrega(s) atrasada(s)`} link="/entregas" />
            <Alerta mostrar={!!i.receber_vencido} icone={AlertTriangle} nivel="alto" texto={`${formatarMoeda(i.receber_vencido ?? 0)} a receber vencido (inadimplência)`} link="/contas?tipo=receber" />
            <Alerta mostrar={!!i.pagar_vencido} icone={AlertTriangle} nivel="alto" texto={`${formatarMoeda(i.pagar_vencido ?? 0)} a pagar vencido`} link="/contas?tipo=pagar" />
            <Alerta mostrar={!!i.pagar_hoje} icone={Receipt} nivel="medio" texto={`${formatarMoeda(i.pagar_hoje ?? 0)} a pagar vence hoje`} link="/contas?tipo=pagar" />
            <Alerta mostrar={i.aguardando_separacao > 0} icone={PackageCheck} nivel="medio" texto={`${i.aguardando_separacao} pedido(s) aguardando separação`} link="/separacao" />
            <Alerta mostrar={i.orcamentos_vencendo > 0} icone={ClipboardList} nivel="medio" texto={`${i.orcamentos_vencendo} orçamento(s) vencem em até 3 dias`} link="/orcamentos" />
            {!(i.estoque_critico || i.entregas_atrasadas || i.receber_vencido || i.pagar_vencido || i.pagar_hoje || i.aguardando_separacao || i.orcamentos_vencendo) && (
              <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success"><Minus className="h-4 w-4" /> Nenhum alerta no momento.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ icone: Icone, titulo, valor, sub, extra, alerta, link }: { icone: LucideIcon; titulo: string; valor: string; sub?: string; extra?: ReactNode; alerta?: boolean; link?: string }) {
  const corpo = (
    <Card className={cn('h-full transition-shadow', link && 'hover:shadow-md')}>
      <CardContent className="flex gap-3 p-5">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', alerta ? 'bg-destructive/10 text-destructive' : 'bg-sidebar text-primary')}><Icone className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums">{valor}</p>
          {sub && <p className={cn('truncate text-xs', alerta ? 'text-destructive' : 'text-muted-foreground')}>{sub}</p>}
          {extra}
        </div>
      </CardContent>
    </Card>
  )
  return link ? <Link to={link}>{corpo}</Link> : corpo
}

function Delta({ atual, anterior, escuro }: { atual: number; anterior: number; escuro?: boolean }) {
  const v = variacaoPerc(atual, anterior)
  if (v === null) return <p className={cn('mt-1 text-xs', escuro ? 'text-zinc-400' : 'text-muted-foreground')}>sem base no período anterior</p>
  const sobe = v > 0
  const Icone = v === 0 ? Minus : sobe ? ArrowUpRight : ArrowDownRight
  return (
    <p className={cn('mt-1 flex items-center gap-1 text-xs', v === 0 ? (escuro ? 'text-zinc-400' : 'text-muted-foreground') : sobe ? (escuro ? 'text-emerald-300' : 'text-success') : escuro ? 'text-red-300' : 'text-destructive')}>
      <Icone className="h-3.5 w-3.5" /> {sobe ? '+' : ''}{formatarNumero(v, 1)}% vs. período anterior
    </p>
  )
}

function Alerta({ mostrar, icone: Icone, nivel, texto, link }: { mostrar: boolean; icone: LucideIcon; nivel: 'alto' | 'medio'; texto: string; link: string }) {
  if (!mostrar) return null
  return (
    <Link to={link} className={cn('flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent', nivel === 'alto' ? 'border-destructive/30' : 'border-primary/30')}>
      <Icone className={cn('h-4 w-4 shrink-0', nivel === 'alto' ? 'text-destructive' : 'text-primary')} />
      <span className="flex-1">{texto}</span>
      <Badge variant={nivel === 'alto' ? 'danger' : 'default'}>{nivel === 'alto' ? 'Urgente' : 'Atenção'}</Badge>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  )
}
