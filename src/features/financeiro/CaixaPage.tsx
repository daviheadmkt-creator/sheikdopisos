import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine, HandCoins, History, Loader2, Lock, Receipt, RotateCcw, Search, Unlock, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { deCentavos } from '@/features/comercial/calculos'
import { FORMAS_PAGAMENTO } from '@/features/comercial/tipos'
import { escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { formatarData, formatarMoeda } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  abrirCaixa,
  estornarMovimento,
  fecharCaixa,
  listarContas,
  listarMovimentos,
  listarSessoes,
  movimentarCaixa,
  parcelasAbertasCliente,
  type ContaFinanceira,
  type Movimento,
  type Parcela,
} from './api'
import { LiquidarDialog } from './LiquidarDialog'
import { NovoTituloDialog } from './TituloDialogs'

const NATUREZA: Record<Movimento['natureza'], string> = {
  recebimento: 'Recebimento',
  pagamento: 'Pagamento',
  suprimento: 'Suprimento',
  sangria: 'Sangria',
  transferencia: 'Transferência',
  ajuste: 'Ajuste / quebra',
  estorno: 'Estorno',
}

export function CaixaPage() {
  const contas = useQuery({ queryKey: ['financeiro', 'contas'], queryFn: listarContas })
  const caixas = useMemo(() => (contas.data ?? []).filter((c) => c.tipo === 'caixa' && c.ativo), [contas.data])
  const [contaId, setContaId] = useState('')
  useEffect(() => {
    if (!contaId && caixas.length) setContaId(caixas[0].id)
  }, [contaId, caixas])
  const conta = caixas.find((c) => c.id === contaId)

  return (
    <>
      <PageHeader
        titulo="Caixa"
        descricao="Abertura, recebimentos, suprimentos, sangrias, despesas, conferência e fechamento por operador."
        acoes={
          caixas.length > 1 && (
            <NativeSelect value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-56" aria-label="Caixa">
              {caixas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          )
        }
      />
      <Tabs defaultValue="operacao">
        <TabsList>
          <TabsTrigger value="operacao"><Wallet /> Operação</TabsTrigger>
          <TabsTrigger value="historico"><History /> Histórico de caixas</TabsTrigger>
        </TabsList>
        <TabsContent value="operacao">
          {contas.isLoading ? <Carregando /> : contas.error ? <ErroCarregamento mensagem={mensagemErro(contas.error)} /> : !conta ? (
            <Card><Vazio titulo="Nenhuma conta do tipo caixa" descricao="Cadastre uma conta do tipo “Caixa” em Financeiro › Contas." /></Card>
          ) : conta.sessao_aberta_id ? (
            <CaixaAberto conta={conta} sessaoId={conta.sessao_aberta_id} contas={contas.data ?? []} />
          ) : (
            <AbrirCaixa conta={conta} />
          )}
        </TabsContent>
        <TabsContent value="historico"><HistoricoCaixas /></TabsContent>
      </Tabs>
    </>
  )
}

function AbrirCaixa({ conta }: { conta: ContaFinanceira }) {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const dif = valor ? escalar(valor, 2) - escalar(paraCanonico(conta.saldo_atual, 2), 2) : 0n
  const abrir = useMutation({
    mutationFn: () => abrirCaixa(conta.id, valor, obs),
    onSuccess: () => { toast.success('Caixa aberto.'); qc.invalidateQueries({ queryKey: ['financeiro'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-sidebar text-primary"><Lock className="h-7 w-7" /></span>
        <CardTitle>{conta.nome} está fechado</CardTitle>
        <CardDescription>Conte o dinheiro da gaveta e informe o valor para abrir.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between rounded-lg bg-background/70 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Saldo registrado no sistema</span>
          <strong className="tabular-nums">{formatarMoeda(conta.saldo_atual)}</strong>
        </div>
        <Field label="Valor contado na gaveta" obrigatorio><DecimalInput value={valor} onChange={setValor} casas={2} prefixo="R$" /></Field>
        {valor && dif !== 0n && (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-[#7a5c0f]">
            Diferença de {formatarMoeda(deCentavos(dif))} em relação ao sistema — será registrada como ajuste na abertura.
          </p>
        )}
        <Field label="Observações"><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        <Button className="w-full" size="lg" disabled={!pode('caixa', 'criar') || abrir.isPending} onClick={() => abrir.mutate()}>
          {abrir.isPending ? <Loader2 className="animate-spin" /> : <Unlock />} Abrir caixa
        </Button>
      </CardContent>
    </Card>
  )
}

function CaixaAberto({ conta, sessaoId, contas }: { conta: ContaFinanceira; sessaoId: string; contas: ContaFinanceira[] }) {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const sessoes = useQuery({ queryKey: ['financeiro', 'sessoes'], queryFn: () => listarSessoes(50) })
  const sessao = sessoes.data?.find((s) => s.id === sessaoId)
  const movs = useQuery({ queryKey: ['financeiro', 'movimentos', 'sessao', sessaoId], queryFn: () => listarMovimentos({ conta: '', de: '', ate: '', sessao: sessaoId }) })

  const [receber, setReceber] = useState(false)
  const [parcela, setParcela] = useState<Parcela | null>(null)
  const [lancamento, setLancamento] = useState<null | 'receber' | 'pagar'>(null)
  const [operacao, setOperacao] = useState<null | 'suprimento' | 'sangria'>(null)
  const [fechando, setFechando] = useState(false)
  const [estornando, setEstornando] = useState<Movimento | null>(null)

  const resumo = useMemo(() => {
    let entradas = 0n
    let saidas = 0n
    const porForma = new Map<string, bigint>()
    for (const m of movs.data ?? []) {
      const v = escalar(paraCanonico(m.valor, 2), 2)
      if (m.tipo === 'entrada') entradas += v
      else saidas += v
      if (m.natureza === 'recebimento' && m.forma_pagamento) porForma.set(m.forma_pagamento, (porForma.get(m.forma_pagamento) ?? 0n) + v)
    }
    return { entradas, saidas, porForma }
  }, [movs.data])

  const estornar = useMutation({
    mutationFn: (m: string) => estornarMovimento(estornando!.id, m),
    onSuccess: () => { toast.success('Movimento estornado.'); setEstornando(null); qc.invalidateQueries({ queryKey: ['financeiro'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-sidebar text-white">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Saldo em caixa (esperado)</p>
            <p className="mt-1 text-3xl font-semibold text-primary tabular-nums">{formatarMoeda(conta.saldo_atual)}</p>
            <p className="mt-1 text-xs text-zinc-400">Caixa #{sessao?.numero} · {sessao?.operador_nome} · desde {sessao && formatarData(sessao.aberto_em, true)}</p>
          </CardContent>
        </Card>
        <Indicador titulo="Abertura" valor={formatarMoeda(sessao?.valor_abertura ?? 0)} />
        <Indicador titulo="Entradas na sessão" valor={formatarMoeda(deCentavos(resumo.entradas))} cor="text-success" />
        <Indicador titulo="Saídas na sessão" valor={formatarMoeda(deCentavos(resumo.saidas))} cor="text-destructive" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setReceber(true)}><HandCoins /> Receber conta / venda</Button>
        <Button variant="outline" onClick={() => setLancamento('receber')}><ArrowDownToLine /> Entrada avulsa</Button>
        <Button variant="outline" onClick={() => setLancamento('pagar')}><Receipt /> Despesa</Button>
        <Button variant="outline" onClick={() => setOperacao('suprimento')}><ArrowDownToLine /> Suprimento</Button>
        <Button variant="outline" onClick={() => setOperacao('sangria')}><ArrowUpFromLine /> Sangria</Button>
        <Button variant="dark" className="ml-auto" onClick={() => setFechando(true)}><Lock /> Fechar caixa</Button>
      </div>

      {resumo.porForma.size > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {[...resumo.porForma].map(([forma, v]) => (
            <span key={forma} className="rounded-lg border bg-card px-3 py-1.5">
              {FORMAS_PAGAMENTO[forma as keyof typeof FORMAS_PAGAMENTO]?.label ?? forma}: <strong className="tabular-nums">{formatarMoeda(deCentavos(v))}</strong>
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Movimentos desta sessão</CardTitle></CardHeader>
        {movs.isLoading ? <Carregando /> : !movs.data?.length ? <Vazio titulo="Nenhum movimento ainda" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº / hora</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movs.data.map((m) => (
                <TableRow key={m.id} className={cn(m.estornado && 'opacity-50')}>
                  <TableCell className="whitespace-nowrap tabular-nums">#{m.numero}<span className="block text-xs text-muted-foreground">{formatarData(m.created_at, true)}</span></TableCell>
                  <TableCell><Badge variant={m.natureza === 'estorno' || m.natureza === 'ajuste' ? 'neutral' : m.tipo === 'entrada' ? 'success' : 'danger'}>{NATUREZA[m.natureza]}</Badge></TableCell>
                  <TableCell className="max-w-[320px] text-sm">{m.descricao}{m.estornado && <Badge variant="neutral" className="ml-2">Estornado</Badge>}</TableCell>
                  <TableCell className="text-sm">{m.forma_pagamento ? FORMAS_PAGAMENTO[m.forma_pagamento].label : '—'}</TableCell>
                  <TableCell className={cn('text-right font-medium tabular-nums', m.tipo === 'entrada' ? 'text-success' : 'text-destructive')}>{m.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(m.valor)}</TableCell>
                  <TableCell>
                    {!m.estornado && m.natureza !== 'estorno' && (pode('financeiro', 'cancelar') || pode('contas', 'cancelar')) && (
                      <Button size="sm" variant="ghost" onClick={() => setEstornando(m)}><RotateCcw /> Estornar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ReceberDialog aberto={receber} onFechar={() => setReceber(false)} onEscolher={(p) => { setReceber(false); setParcela(p) }} />
      <LiquidarDialog parcela={parcela} onFechar={() => setParcela(null)} contaFixa={conta.id} />
      <NovoTituloDialog aberto={!!lancamento} onFechar={() => setLancamento(null)} tipoInicial={lancamento ?? 'pagar'} contaFixa={conta.id} somenteAVista />
      <OperacaoDialog tipo={operacao} conta={conta} contas={contas} onFechar={() => setOperacao(null)} />
      <FecharDialog aberto={fechando} onFechar={() => setFechando(false)} sessaoId={sessaoId} esperado={conta.saldo_atual} />
      <MotivoDialog aberto={!!estornando} titulo={`Estornar movimento #${estornando?.numero ?? ''}`} rotuloConfirmar="Estornar" destrutivo carregando={estornar.isPending} onConfirmar={(m) => estornar.mutate(m)} onFechar={() => setEstornando(null)} />
    </div>
  )
}

function Indicador({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', cor)}>{valor}</p>
      </CardContent>
    </Card>
  )
}

function ReceberDialog({ aberto, onFechar, onEscolher }: { aberto: boolean; onFechar: () => void; onEscolher: (p: Parcela) => void }) {
  const [busca, setBusca] = useState('')
  const b = useDebounce(busca)
  const q = useQuery({ queryKey: ['financeiro', 'receber-caixa', b], queryFn: () => parcelasAbertasCliente(b), enabled: aberto })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receber no caixa</DialogTitle>
          <DialogDescription>Selecione a parcela (vendas confirmadas aparecem aqui automaticamente).</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, nº do título ou “Venda nº…”" className="pl-9" autoFocus />
        </div>
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          {q.isLoading ? <Carregando /> : !q.data?.length ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma parcela em aberto.</p> : (
            q.data.map((p) => (
              <button key={p.id} type="button" onClick={() => onEscolher(p)} className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-accent">
                <span>
                  <span className="font-medium">{p.pessoa_nome ?? '—'}</span>
                  <span className="block text-xs text-muted-foreground">
                    #{p.titulo_numero} {p.numero}/{p.total_parcelas} · {p.descricao}{p.forma_prevista && ` · ${FORMAS_PAGAMENTO[p.forma_prevista].label}`} · venc. {formatarData(`${p.vencimento}T12:00:00`)}
                  </span>
                </span>
                <span className={cn('font-semibold tabular-nums', p.dias_atraso > 0 && 'text-destructive')}>{formatarMoeda(p.valor_aberto)}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OperacaoDialog({ tipo, conta, contas, onFechar }: { tipo: null | 'suprimento' | 'sangria'; conta: ContaFinanceira; contas: ContaFinanceira[]; onFechar: () => void }) {
  const qc = useQueryClient()
  const [valor, setValor] = useState('')
  const [outra, setOutra] = useState('')
  const [descricao, setDescricao] = useState('')
  const [chave, setChave] = useState('')
  useEffect(() => {
    if (tipo) { setValor(''); setOutra(''); setDescricao(''); setChave(crypto.randomUUID()) }
  }, [tipo])
  const salvar = useMutation({
    mutationFn: () => movimentarCaixa({ tipo: tipo!, conta_id: conta.id, outra_conta_id: outra, valor, descricao, chave_idempotencia: chave }),
    onSuccess: () => { toast.success(tipo === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.'); qc.invalidateQueries({ queryKey: ['financeiro'] }); onFechar() },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const outras = contas.filter((c) => c.id !== conta.id && c.ativo && c.tipo !== 'caixa')
  return (
    <Dialog open={!!tipo} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tipo === 'sangria' ? 'Sangria' : 'Suprimento'}</DialogTitle>
          <DialogDescription>{tipo === 'sangria' ? 'Retirada de dinheiro do caixa (ex.: depósito no banco, cofre).' : 'Entrada de dinheiro para troco.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Valor" obrigatorio><DecimalInput value={valor} onChange={setValor} casas={2} prefixo="R$" /></Field>
          <Field label={tipo === 'sangria' ? 'Destino (opcional)' : 'Origem (opcional)'} ajuda="Informe a conta para registrar a transferência nas duas pontas.">
            <NativeSelect value={outra} onChange={(e) => setOutra(e.target.value)}>
              <option value="">Não informar</option>
              {outras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Descrição"><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={!valor || salvar.isPending}>{salvar.isPending && <Loader2 className="animate-spin" />} Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FecharDialog({ aberto, onFechar, sessaoId, esperado }: { aberto: boolean; onFechar: () => void; sessaoId: string; esperado: number }) {
  const qc = useQueryClient()
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  useEffect(() => { if (aberto) { setContado(''); setObs('') } }, [aberto])
  const dif = contado ? escalar(contado, 2) - escalar(paraCanonico(esperado, 2), 2) : null
  const fechar = useMutation({
    mutationFn: () => fecharCaixa(sessaoId, contado, obs),
    onSuccess: (d) => {
      toast.success(Number(d) === 0 ? 'Caixa fechado sem diferenças.' : `Caixa fechado com diferença de ${formatarMoeda(d)} (registrada).`)
      qc.invalidateQueries({ queryKey: ['financeiro'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar caixa — conferência</DialogTitle>
          <DialogDescription>Conte o dinheiro da gaveta. Diferenças são registradas como sobra/falta de caixa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-between rounded-lg bg-background/70 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Saldo esperado (sistema)</span>
            <strong className="tabular-nums">{formatarMoeda(esperado)}</strong>
          </div>
          <Field label="Valor contado" obrigatorio><DecimalInput value={contado} onChange={setContado} casas={2} prefixo="R$" /></Field>
          {dif !== null && (
            <p className={cn('rounded-lg px-3 py-2 text-sm font-medium', dif === 0n ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
              {dif === 0n ? 'Caixa conferido, sem diferença.' : `${dif > 0n ? 'Sobra' : 'Falta'} de ${formatarMoeda(deCentavos(dif < 0n ? -dif : dif))}`}
            </p>
          )}
          <Field label="Observações"><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button variant="dark" onClick={() => fechar.mutate()} disabled={!contado || fechar.isPending}>{fechar.isPending && <Loader2 className="animate-spin" />} Fechar caixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoricoCaixas() {
  const q = useQuery({ queryKey: ['financeiro', 'sessoes', 'historico'], queryFn: () => listarSessoes(200) })
  return (
    <Card>
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.length ? <Vazio titulo="Nenhum caixa aberto ainda" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Caixa</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead>Abertura</TableHead>
              <TableHead>Fechamento</TableHead>
              <TableHead className="text-right">Esperado</TableHead>
              <TableHead className="text-right">Contado</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">#{s.numero}</TableCell>
                <TableCell>{s.conta?.nome}</TableCell>
                <TableCell>{s.operador_nome}</TableCell>
                <TableCell className="whitespace-nowrap">{formatarData(s.aberto_em, true)}<span className="block text-xs text-muted-foreground">{formatarMoeda(s.valor_abertura)}</span></TableCell>
                <TableCell className="whitespace-nowrap">{s.fechado_em ? formatarData(s.fechado_em, true) : <Badge variant="info">Aberto</Badge>}</TableCell>
                <TableCell className="text-right tabular-nums">{s.valor_esperado !== null ? formatarMoeda(s.valor_esperado) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.valor_contado !== null ? formatarMoeda(s.valor_contado) : '—'}</TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', s.diferenca && Number(s.diferenca) !== 0 ? 'text-destructive' : 'text-success')}>
                  {s.diferenca !== null ? formatarMoeda(s.diferenca) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
