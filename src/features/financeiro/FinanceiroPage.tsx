import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeftRight, BarChart3, Banknote, FileBarChart, Landmark, Loader2, Plus, Settings2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  alterarCategoriaAtiva,
  alterarContaAtiva,
  criarCategoria,
  criarCentro,
  dreGerencial,
  fluxoCaixa,
  GRUPOS_DRE,
  listarCategorias,
  listarCentros,
  listarContas,
  listarMovimentos,
  obterParametrosFin,
  PARAMETROS_FIN_PADRAO,
  resumoFinanceiro,
  salvarConta,
  salvarParametrosFin,
  transferir,
  type TipoConta,
  type TipoTitulo,
} from './api'

const COR_ENTRADA = '#006FB9' // safira (validado: CVD ΔE 30.7 vs dourado)
const COR_SAIDA = '#D4A52C' // dourado (contraste < 3:1 → legenda + tabela equivalente na aba Fluxo)

const inicioMes = () => { const d = new Date(); return dataLocalISO(new Date(d.getFullYear(), d.getMonth(), 1)) }

function Periodo({ de, ate, onDe, onAte }: { de: string; ate: string; onDe: (v: string) => void; onAte: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" value={de} max={ate} onChange={(e) => onDe(e.target.value)} className="w-40" aria-label="De" />
      <span className="text-sm text-muted-foreground">até</span>
      <Input type="date" value={ate} min={de} onChange={(e) => onAte(e.target.value)} className="w-40" aria-label="Até" />
    </div>
  )
}

export function FinanceiroPage() {
  const [de, setDe] = useState(inicioMes())
  const [ate, setAte] = useState(dataLocalISO())
  return (
    <>
      <PageHeader titulo="Financeiro" descricao="Faturamento, recebimentos, pagamentos, saldo, fluxo de caixa e DRE gerencial." acoes={<Periodo de={de} ate={ate} onDe={setDe} onAte={setAte} />} />
      <Tabs defaultValue="visao">
        <TabsList>
          <TabsTrigger value="visao"><TrendingUp /> Visão geral</TabsTrigger>
          <TabsTrigger value="fluxo"><BarChart3 /> Fluxo de caixa</TabsTrigger>
          <TabsTrigger value="dre"><FileBarChart /> DRE gerencial</TabsTrigger>
          <TabsTrigger value="contas"><Landmark /> Contas e extrato</TabsTrigger>
          <TabsTrigger value="cadastros"><Settings2 /> Cadastros</TabsTrigger>
        </TabsList>
        <TabsContent value="visao"><VisaoGeral de={de} ate={ate} /></TabsContent>
        <TabsContent value="fluxo"><FluxoTab de={de} ate={ate} /></TabsContent>
        <TabsContent value="dre"><DreTab de={de} ate={ate} /></TabsContent>
        <TabsContent value="contas"><ContasTab de={de} ate={ate} /></TabsContent>
        <TabsContent value="cadastros"><CadastrosTab /></TabsContent>
      </Tabs>
    </>
  )
}

function Kpi({ titulo, valor, ajuda, destaque, alerta, link }: { titulo: string; valor: number; ajuda: string; destaque?: boolean; alerta?: boolean; link?: string }) {
  const corpo = (
    <Card className={cn('h-full transition-shadow', destaque && 'bg-sidebar text-white', link && 'hover:shadow-md')}>
      <CardContent className="p-5">
        <p className={cn('text-xs uppercase tracking-wide', destaque ? 'text-zinc-400' : 'text-muted-foreground')}>{titulo}</p>
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', destaque && 'text-primary', alerta && valor > 0 && 'text-destructive')}>{formatarMoeda(valor)}</p>
        <p className={cn('mt-1 text-xs', destaque ? 'text-zinc-400' : 'text-muted-foreground')}>{ajuda}</p>
      </CardContent>
    </Card>
  )
  return link ? <Link to={link}>{corpo}</Link> : corpo
}

function VisaoGeral({ de, ate }: { de: string; ate: string }) {
  const r = useQuery({ queryKey: ['financeiro', 'resumo', de, ate], queryFn: () => resumoFinanceiro(de, ate) })
  const f = useQuery({ queryKey: ['financeiro', 'fluxo', de, ate], queryFn: () => fluxoCaixa(de, ate) })
  const dados = useMemo(
    () => (f.data ?? []).map((d) => ({ dia: formatarData(`${d.data}T12:00:00`).slice(0, 5), Entradas: Number(d.entradas_realizadas), Saídas: Number(d.saidas_realizadas) })),
    [f.data],
  )
  if (r.isLoading) return <Carregando />
  if (r.error) return <ErroCarregamento mensagem={mensagemErro(r.error)} />
  const v = r.data!
  const temMov = dados.some((d) => d.Entradas || d.Saídas)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Saldo em contas" valor={Number(v.saldo_contas)} ajuda="Caixa + bancos, hoje" destaque />
        <Kpi titulo="Faturamento no período" valor={Number(v.faturamento)} ajuda="Vendas confirmadas (competência)" />
        <Kpi titulo="Recebido no período" valor={Number(v.recebido)} ajuda="Dinheiro que entrou (regime de caixa)" />
        <Kpi titulo="Pago no período" valor={Number(v.pago)} ajuda="Saídas por pagamento de títulos" />
        <Kpi titulo="A receber (aberto)" valor={Number(v.receber_aberto)} ajuda="Todas as parcelas em aberto" link="/contas?tipo=receber" />
        <Kpi titulo="A receber vencido" valor={Number(v.receber_vencido)} ajuda="Inadimplência" alerta link="/contas?tipo=receber" />
        <Kpi titulo="A pagar (aberto)" valor={Number(v.pagar_aberto)} ajuda="Todas as parcelas em aberto" link="/contas?tipo=pagar" />
        <Kpi titulo="A pagar em 7 dias" valor={Number(v.pagar_7_dias)} ajuda="Inclui vencidos" alerta link="/contas?tipo=pagar" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Entradas e saídas realizadas</CardTitle>
          <CardDescription>Movimentos financeiros por dia (transferências entre contas não entram). Valores detalhados na aba Fluxo de caixa.</CardDescription>
        </CardHeader>
        <CardContent>
          {f.isLoading ? <Carregando /> : !temMov ? <Vazio titulo="Sem movimentos no período" /> : (
            <div className="h-72" role="img" aria-label="Gráfico de barras de entradas e saídas por dia">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} minTickGap={12} />
                  <YAxis tickLine={false} axisLine={false} width={72} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(n: number) => n.toLocaleString('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' })} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--accent))' }}
                    formatter={(valor: number) => formatarMoeda(valor)}
                    contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Entradas" fill={COR_ENTRADA} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="Saídas" fill={COR_SAIDA} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FluxoTab({ de, ate }: { de: string; ate: string }) {
  const f = useQuery({ queryKey: ['financeiro', 'fluxo', de, ate], queryFn: () => fluxoCaixa(de, ate) })
  const linhas = useMemo(() => {
    let acumulado = 0
    return (f.data ?? [])
      .filter((d) => d.entradas_realizadas || d.saidas_realizadas || d.entradas_previstas || d.saidas_previstas)
      .map((d) => {
        const saldo = Number(d.entradas_realizadas) - Number(d.saidas_realizadas) + Number(d.entradas_previstas) - Number(d.saidas_previstas)
        acumulado += saldo
        return { ...d, saldo, acumulado }
      })
  }, [f.data])
  if (f.isLoading) return <Carregando />
  if (f.error) return <ErroCarregamento mensagem={mensagemErro(f.error)} />
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluxo de caixa diário</CardTitle>
        <CardDescription>Realizado (movimentos) e previsto (parcelas em aberto por vencimento; vencidas aparecem em hoje).</CardDescription>
      </CardHeader>
      {!linhas.length ? <Vazio titulo="Sem movimentos ou previsões no período" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Entradas realizadas</TableHead>
              <TableHead className="text-right">Saídas realizadas</TableHead>
              <TableHead className="text-right">A receber</TableHead>
              <TableHead className="text-right">A pagar</TableHead>
              <TableHead className="text-right">Saldo do dia</TableHead>
              <TableHead className="text-right">Acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((d) => (
              <TableRow key={d.data}>
                <TableCell>{formatarData(`${d.data}T12:00:00`)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(d.entradas_realizadas)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(d.saidas_realizadas)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatarMoeda(d.entradas_previstas)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatarMoeda(d.saidas_previstas)}</TableCell>
                <TableCell className={cn('text-right tabular-nums', d.saldo < 0 && 'text-destructive')}>{formatarMoeda(d.saldo)}</TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', d.acumulado < 0 && 'text-destructive')}>{formatarMoeda(d.acumulado)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

function DreTab({ de, ate }: { de: string; ate: string }) {
  const q = useQuery({ queryKey: ['financeiro', 'dre', de, ate], queryFn: () => dreGerencial(de, ate) })
  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroCarregamento mensagem={mensagemErro(q.error)} />
  const receita = Number(q.data?.find((l) => l.ordem === 40)?.valor ?? 0)
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>DRE gerencial</CardTitle>
        <CardDescription>
          {formatarData(`${de}T12:00:00`)} a {formatarData(`${ate}T12:00:00`)} · vendas por data de confirmação, despesas por competência, CMV pelo custo médio no momento da venda. Relatório gerencial — não substitui a contabilidade.
        </CardDescription>
      </CardHeader>
      {!q.data?.length ? <Vazio titulo="Sem dados no período" /> : (
        <div className="divide-y border-t">
          {q.data.map((l, i) => (
            <div key={i} className={cn('flex items-center justify-between gap-4 px-5 py-2.5 text-sm', l.tipo === 'total' && 'bg-secondary/60 font-semibold', l.tipo === 'resultado' && 'bg-sidebar text-base font-semibold text-white', l.tipo === 'despesa' && 'pl-9 text-muted-foreground')}>
              <span>{l.descricao}</span>
              <span className="flex items-center gap-3 tabular-nums">
                {receita !== 0 && l.tipo !== 'despesa' && <span className={cn('text-xs', l.tipo === 'resultado' ? 'text-zinc-400' : 'text-muted-foreground')}>{((Number(l.valor) / receita) * 100).toFixed(1).replace('.', ',')}%</span>}
                <span className={cn(Number(l.valor) < 0 && l.tipo !== 'resultado' && 'text-destructive', l.tipo === 'resultado' && (Number(l.valor) < 0 ? 'text-red-300' : 'text-primary'))}>{formatarMoeda(l.valor)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ContasTab({ de, ate }: { de: string; ate: string }) {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const contas = useQuery({ queryKey: ['financeiro', 'contas'], queryFn: listarContas })
  const [sel, setSel] = useState('')
  const [nova, setNova] = useState(false)
  const [transf, setTransf] = useState(false)
  useEffect(() => { if (!sel && contas.data?.length) setSel(contas.data[0].id) }, [sel, contas.data])
  const movs = useQuery({ queryKey: ['financeiro', 'movimentos', sel, de, ate], queryFn: () => listarMovimentos({ conta: sel, de, ate }), enabled: !!sel })
  const ativar = useMutation({ mutationFn: (a: { id: string; ativo: boolean }) => alterarContaAtiva(a.id, a.ativo), onSuccess: () => qc.invalidateQueries({ queryKey: ['financeiro'] }), onError: (e) => toast.error(mensagemErro(e)) })

  if (contas.isLoading) return <Carregando />
  if (contas.error) return <ErroCarregamento mensagem={mensagemErro(contas.error)} />
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Contas</CardTitle>
          <div className="flex gap-1">
            {pode('financeiro', 'criar') && <Button size="sm" variant="outline" onClick={() => setTransf(true)}><ArrowLeftRight /> Transferir</Button>}
            {pode('financeiro', 'criar') && <Button size="sm" onClick={() => setNova(true)}><Plus /></Button>}
          </div>
        </CardHeader>
        <ul className="divide-y border-t">
          {contas.data?.map((c) => (
            <li key={c.id} onClick={() => setSel(c.id)} className={cn('flex cursor-pointer items-center justify-between gap-2 px-5 py-3', sel === c.id && 'bg-accent')}>
              <div>
                <p className={cn('font-medium', !c.ativo && 'text-muted-foreground line-through')}>{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.tipo === 'caixa' ? (c.sessao_aberta_id ? 'Caixa aberto' : 'Caixa fechado') : c.tipo === 'banco' ? [c.banco, c.agencia, c.numero_conta].filter(Boolean).join(' · ') || 'Banco' : 'Carteira digital'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{formatarMoeda(c.saldo_atual)}</span>
                <Switch checked={c.ativo} disabled={!pode('financeiro', 'editar')} onClick={(e) => e.stopPropagation()} onCheckedChange={(ativo) => ativar.mutate({ id: c.id, ativo })} aria-label="Ativa" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader><CardTitle>Extrato</CardTitle><CardDescription>Movimentos da conta no período. Estornos são feitos pelo título ou pelo caixa.</CardDescription></CardHeader>
        {movs.isLoading ? <Carregando /> : !movs.data?.length ? <Vazio titulo="Sem movimentos no período" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movs.data.map((m) => (
                <TableRow key={m.id} className={cn(m.estornado && 'opacity-50')}>
                  <TableCell className="whitespace-nowrap">{formatarData(`${m.data}T12:00:00`)}<span className="block text-xs text-muted-foreground">#{m.numero} · {m.created_by_nome}</span></TableCell>
                  <TableCell className="text-sm">{m.descricao}{m.estornado && <Badge variant="neutral" className="ml-2">Estornado</Badge>}</TableCell>
                  <TableCell className="text-sm">{m.categoria_nome ?? '—'}</TableCell>
                  <TableCell className={cn('text-right font-medium tabular-nums', m.tipo === 'entrada' ? 'text-success' : 'text-destructive')}>{m.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(m.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <NovaContaDialog aberto={nova} onFechar={() => setNova(false)} />
      <TransferenciaDialog aberto={transf} onFechar={() => setTransf(false)} />
    </div>
  )
}

function NovaContaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const vazio = { nome: '', tipo: 'banco' as TipoConta, banco: '', agencia: '', numero_conta: '', saldo_inicial: '', data_saldo_inicial: dataLocalISO() }
  const [d, setD] = useState(vazio)
  useEffect(() => { if (aberto) setD({ ...vazio, data_saldo_inicial: dataLocalISO() }) }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = useMutation({ mutationFn: () => salvarConta(d), onSuccess: () => { toast.success('Conta criada.'); qc.invalidateQueries({ queryKey: ['financeiro'] }); onFechar() }, onError: (e) => toast.error(mensagemErro(e)) })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova conta financeira</DialogTitle><DialogDescription>Caixa físico, conta bancária ou carteira digital (ex.: maquininha/PIX).</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" obrigatorio className="sm:col-span-2"><Input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Ex.: Banco do Brasil — conta movimento" /></Field>
          <Field label="Tipo">
            <NativeSelect value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoConta })}>
              <option value="banco">Banco</option><option value="caixa">Caixa físico</option><option value="carteira">Carteira digital</option>
            </NativeSelect>
          </Field>
          <Field label="Banco"><Input value={d.banco} onChange={(e) => setD({ ...d, banco: e.target.value })} disabled={d.tipo !== 'banco'} /></Field>
          <Field label="Agência"><Input value={d.agencia} onChange={(e) => setD({ ...d, agencia: e.target.value })} disabled={d.tipo !== 'banco'} /></Field>
          <Field label="Conta"><Input value={d.numero_conta} onChange={(e) => setD({ ...d, numero_conta: e.target.value })} disabled={d.tipo !== 'banco'} /></Field>
          <Field label="Saldo inicial"><DecimalInput value={d.saldo_inicial} onChange={(v) => setD({ ...d, saldo_inicial: v })} casas={2} prefixo="R$" /></Field>
          <Field label="Data do saldo inicial"><Input type="date" value={d.data_saldo_inicial} onChange={(e) => setD({ ...d, data_saldo_inicial: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={d.nome.trim().length < 2 || salvar.isPending}>{salvar.isPending && <Loader2 className="animate-spin" />} Criar conta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferenciaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const contas = useQuery({ queryKey: ['financeiro', 'contas'], queryFn: listarContas, enabled: aberto })
  const [o, setO] = useState('')
  const [d, setD] = useState('')
  const [valor, setValor] = useState('')
  const [desc, setDesc] = useState('')
  const [chave, setChave] = useState('')
  useEffect(() => { if (aberto) { setO(''); setD(''); setValor(''); setDesc(''); setChave(crypto.randomUUID()) } }, [aberto])
  const salvar = useMutation({
    mutationFn: () => transferir({ conta_origem_id: o, conta_destino_id: d, valor, data: dataLocalISO(), descricao: desc, chave_idempotencia: chave }),
    onSuccess: () => { toast.success('Transferência registrada.'); qc.invalidateQueries({ queryKey: ['financeiro'] }); onFechar() },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const ativas = contas.data?.filter((c) => c.ativo) ?? []
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transferência entre contas</DialogTitle><DialogDescription>Não afeta receitas nem despesas; apenas move saldo.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De"><NativeSelect value={o} onChange={(e) => setO(e.target.value)}><option value="">Selecione</option>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome} ({formatarMoeda(c.saldo_atual)})</option>)}</NativeSelect></Field>
          <Field label="Para"><NativeSelect value={d} onChange={(e) => setD(e.target.value)}><option value="">Selecione</option>{ativas.filter((c) => c.id !== o).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</NativeSelect></Field>
          <Field label="Valor"><DecimalInput value={valor} onChange={setValor} casas={2} prefixo="R$" /></Field>
          <Field label="Descrição"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={!o || !d || !valor || salvar.isPending}>{salvar.isPending && <Loader2 className="animate-spin" />} Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CadastrosTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const categorias = useQuery({ queryKey: ['financeiro', 'categorias'], queryFn: listarCategorias })
  const centros = useQuery({ queryKey: ['financeiro', 'centros'], queryFn: listarCentros })
  const params = useQuery({ queryKey: ['financeiro', 'parametros'], queryFn: obterParametrosFin })
  const [nova, setNova] = useState({ nome: '', tipo: 'pagar' as TipoTitulo, grupo: 'despesas_administrativas' })
  const [centro, setCentro] = useState('')
  const [p, setP] = useState({ multa: '', juros: '', carencia: '' })
  useEffect(() => {
    const x = params.data ?? PARAMETROS_FIN_PADRAO
    setP({ multa: paraCanonico(x.multa_perc, 2), juros: paraCanonico(x.juros_mes_perc, 2), carencia: String(x.dias_carencia) })
  }, [params.data])
  const inv = () => qc.invalidateQueries({ queryKey: ['financeiro'] })
  const onErro = (e: unknown) => toast.error(mensagemErro(e))
  const addCat = useMutation({ mutationFn: () => criarCategoria(nova.nome, nova.tipo, nova.grupo), onSuccess: () => { toast.success('Categoria criada.'); setNova({ ...nova, nome: '' }); inv() }, onError: onErro })
  const togCat = useMutation({ mutationFn: (a: { id: string; ativo: boolean }) => alterarCategoriaAtiva(a.id, a.ativo), onSuccess: inv, onError: onErro })
  const addCentro = useMutation({ mutationFn: () => criarCentro(centro), onSuccess: () => { toast.success('Centro de custo criado.'); setCentro(''); inv() }, onError: onErro })
  const salvarP = useMutation({
    mutationFn: () => salvarParametrosFin({ multa_perc: Number(p.multa || 0), juros_mes_perc: Number(p.juros || 0), dias_carencia: Number(p.carencia || 0) }),
    onSuccess: () => { toast.success('Parâmetros salvos.'); inv() },
    onError: onErro,
  })
  const grupos = Object.entries(GRUPOS_DRE).filter(([, g]) => g.tipo === nova.tipo)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle>Categorias financeiras</CardTitle><CardDescription>Plano de contas gerencial. O grupo define a linha na DRE.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {pode('financeiro', 'criar') && (
            <div className="grid gap-2 rounded-lg border bg-background/50 p-3 sm:grid-cols-[1fr_130px_1fr_auto]">
              <Input placeholder="Nova categoria" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
              <NativeSelect value={nova.tipo} onChange={(e) => { const t = e.target.value as TipoTitulo; setNova({ ...nova, tipo: t, grupo: t === 'pagar' ? 'despesas_administrativas' : 'outras_receitas' }) }}>
                <option value="pagar">Despesa</option><option value="receber">Receita</option>
              </NativeSelect>
              <NativeSelect value={nova.grupo} onChange={(e) => setNova({ ...nova, grupo: e.target.value })}>{grupos.map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</NativeSelect>
              <Button onClick={() => addCat.mutate()} disabled={nova.nome.trim().length < 2 || addCat.isPending}><Plus /></Button>
            </div>
          )}
          {categorias.isLoading ? <Carregando /> : (
            <ul className="divide-y rounded-lg border">
              {categorias.data?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className={cn(!c.ativo && 'text-muted-foreground line-through')}>
                    {c.nome}
                    <span className="ml-2 text-xs text-muted-foreground">{GRUPOS_DRE[c.grupo_dre]?.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={c.tipo === 'receber' ? 'info' : 'default'}>{c.tipo === 'receber' ? 'Receita' : 'Despesa'}</Badge>
                    {c.sistema ? <Badge variant="neutral">Sistema</Badge> : <Switch checked={c.ativo} disabled={!pode('financeiro', 'editar')} onCheckedChange={(ativo) => togCat.mutate({ id: c.id, ativo })} aria-label="Ativa" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Centros de custo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pode('financeiro', 'criar') && (
              <div className="flex gap-2"><Input placeholder="Novo centro de custo" value={centro} onChange={(e) => setCentro(e.target.value)} /><Button onClick={() => addCentro.mutate()} disabled={centro.trim().length < 2}><Plus /></Button></div>
            )}
            <ul className="divide-y rounded-lg border">{centros.data?.map((c) => <li key={c.id} className="px-4 py-2 text-sm">{c.nome}</li>)}</ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-4 w-4 text-primary" /> Encargos por atraso</CardTitle><CardDescription>Sugeridos automaticamente ao receber parcelas vencidas.</CardDescription></CardHeader>
          <CardContent>
            <fieldset disabled={!pode('financeiro', 'editar')} className="grid grid-cols-3 gap-3">
              <Field label="Multa (%)"><DecimalInput value={p.multa} onChange={(v) => setP({ ...p, multa: v })} casas={2} /></Field>
              <Field label="Juros (% a.m.)"><DecimalInput value={p.juros} onChange={(v) => setP({ ...p, juros: v })} casas={2} /></Field>
              <Field label="Carência (dias)"><Input inputMode="numeric" value={p.carencia} onChange={(e) => setP({ ...p, carencia: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></Field>
            </fieldset>
            {pode('financeiro', 'editar') && <Button className="mt-3" variant="outline" onClick={() => salvarP.mutate()} disabled={salvarP.isPending}>Salvar parâmetros</Button>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
