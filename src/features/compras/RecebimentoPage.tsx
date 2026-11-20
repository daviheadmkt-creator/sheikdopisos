import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, Copy, Info, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarDepositos, listarLocalizacoes, listarLotesDoProduto } from '@/features/estoque/api'
import { Qtd, QuantidadeInput } from '@/features/estoque/componentes'
import { desescalar, escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cancelarRecebimento, confirmarRecebimento, obterPedidoCompra, obterRecebimento, salvarRecebimento, type PedidoItemDB } from './api'
import { STATUS_RECEBIMENTO } from './tipos'

interface Linha {
  key: string
  item: PedidoItemDB
  quantidade: string
  modoLote: 'existente' | 'novo'
  lote_id: string
  lote_codigo: string
  tonalidade: string
  calibre: string
  localizacao_id: string
  divergencia: string
  loteDescricao?: string
}

const k = () => crypto.randomUUID()

export function RecebimentoPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const novo = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode } = useAuth()

  const rec = useQuery({ queryKey: ['compras', 'recebimento', id], queryFn: () => obterRecebimento(id!), enabled: !novo })
  const pedidoId = novo ? params.get('pedido') ?? '' : rec.data?.pedido_id ?? ''
  const pedido = useQuery({ queryKey: ['compras', 'pedido', pedidoId], queryFn: () => obterPedidoCompra(pedidoId), enabled: !!pedidoId })
  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos })

  const [nf, setNf] = useState('')
  const [data, setData] = useState(dataLocalISO())
  const [depositoId, setDepositoId] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [cancelando, setCancelando] = useState(false)
  const criado = useRef<string | null>(null)

  const locais = useQuery({ queryKey: ['estoque', 'localizacoes', depositoId], queryFn: () => listarLocalizacoes(depositoId), enabled: !!depositoId })

  // novo recebimento: uma linha por item pendente, sugerindo o saldo pendente
  useEffect(() => {
    const p = pedido.data
    if (!novo || !p) return
    setDepositoId(p.deposito_destino_id ?? depositos.data?.find((d) => d.padrao)?.id ?? '')
    setLinhas(
      p.itens
        .filter((i) => i.quantidade_pendente > 0)
        .map((i) => ({ key: k(), item: i, quantidade: paraCanonico(i.quantidade_pendente, 4), modoLote: 'novo', lote_id: '', lote_codigo: '', tonalidade: '', calibre: '', localizacao_id: '', divergencia: '' })),
    )
  }, [novo, pedido.data, depositos.data])

  // recebimento existente
  useEffect(() => {
    const r = rec.data
    const p = pedido.data
    if (!r || !p) return
    setNf(r.nota_fiscal ?? '')
    setData(r.data_recebimento)
    setDepositoId(r.deposito_id)
    setObservacoes(r.observacoes ?? '')
    setLinhas(
      r.compras_recebimento_itens.flatMap((ri) => {
        const item = p.itens.find((i) => i.id === ri.pedido_item_id)
        if (!item) return []
        return [{
          key: k(),
          item,
          quantidade: paraCanonico(ri.quantidade, 4),
          modoLote: ri.lote_id ? 'existente' : 'novo',
          lote_id: ri.lote_id ?? '',
          lote_codigo: ri.lote_codigo ?? '',
          tonalidade: ri.tonalidade ?? '',
          calibre: ri.calibre ?? '',
          localizacao_id: ri.localizacao_id ?? '',
          divergencia: ri.divergencia ?? '',
          loteDescricao: ri.lote ? [ri.lote.codigo, ri.lote.tonalidade, ri.lote.calibre].filter(Boolean).join(' / ') : undefined,
        } satisfies Linha]
      }),
    )
  }, [rec.data, pedido.data])

  const status = rec.data?.status ?? 'em_conferencia'
  const editavel = status === 'em_conferencia' && (pode('compras', 'editar') || pode('movimentacoes', 'criar'))

  // soma recebida por item do pedido não pode passar do pendente
  const excedentes = useMemo(() => {
    const soma = new Map<string, bigint>()
    for (const l of linhas) soma.set(l.item.id, (soma.get(l.item.id) ?? 0n) + escalar(l.quantidade || '0', 4))
    return new Set([...soma].filter(([itemId, s]) => {
      const it = linhas.find((l) => l.item.id === itemId)!.item
      return s > escalar(paraCanonico(it.quantidade_pendente, 4), 4)
    }).map(([itemId]) => itemId))
  }, [linhas])

  const atualizar = (key: string, p: Partial<Linha>) => setLinhas((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const validar = () => {
    if (!depositoId) return 'Selecione o depósito.'
    const validas = linhas.filter((l) => l.quantidade && escalar(l.quantidade, 4) > 0n)
    if (!validas.length) return 'Informe a quantidade recebida de ao menos um item.'
    if (excedentes.size) return 'Há itens com quantidade recebida maior que o pendente do pedido.'
    for (const l of validas) {
      if (l.item.eh_revestimento && !(l.modoLote === 'existente' ? l.lote_id : l.lote_codigo.trim()))
        return `${l.item.descricao}: informe o lote (revestimento).`
    }
    return null
  }

  const gravar = () =>
    salvarRecebimento(
      { id: id ?? criado.current ?? '', pedido_id: pedidoId, nota_fiscal: nf, data_recebimento: data, deposito_id: depositoId, observacoes },
      linhas
        .filter((l) => l.quantidade && escalar(l.quantidade, 4) > 0n)
        .map((l) => ({
          pedido_item_id: l.item.id,
          quantidade: l.quantidade,
          lote_id: l.modoLote === 'existente' ? l.lote_id : '',
          lote_codigo: l.modoLote === 'novo' ? l.lote_codigo : '',
          tonalidade: l.modoLote === 'novo' ? l.tonalidade : '',
          calibre: l.modoLote === 'novo' ? l.calibre : '',
          localizacao_id: l.localizacao_id,
          divergencia: l.divergencia,
        })),
    )

  const depois = (rid: string, msg: string) => {
    toast.success(msg)
    qc.invalidateQueries({ queryKey: ['compras'] })
    qc.invalidateQueries({ queryKey: ['estoque'] })
    qc.invalidateQueries({ queryKey: ['produtos'] })
    if (novo) navigate(`/compras/recebimentos/${rid}`, { replace: true })
  }

  const salvar = useMutation({
    mutationFn: gravar,
    onSuccess: (rid) => depois(rid, 'Conferência salva. Confirme para dar entrada no estoque.'),
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const confirmar = useMutation({
    mutationFn: async () => {
      const rid = await gravar()
      criado.current = rid
      const n = await confirmarRecebimento(rid)
      return { rid, n }
    },
    onSuccess: ({ rid, n }) => depois(rid, `Recebimento confirmado: ${n} entrada(s) lançada(s) no estoque e custo médio atualizado.`),
    onError: (e) => {
      toast.error(mensagemErro(e))
      if (novo && criado.current) navigate(`/compras/recebimentos/${criado.current}`, { replace: true })
    },
  })
  const cancelar = useMutation({
    mutationFn: (m: string) => cancelarRecebimento(id!, m),
    onSuccess: () => { toast.success('Recebimento cancelado.'); setCancelando(false); qc.invalidateQueries({ queryKey: ['compras'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  if ((!novo && rec.isLoading) || (pedidoId && pedido.isLoading)) return <Carregando />
  if (rec.error || pedido.error) return <ErroCarregamento mensagem={mensagemErro(rec.error ?? pedido.error)} />
  if (novo && !pedidoId) return <ErroCarregamento mensagem="Abra o recebimento a partir de um pedido de compra aprovado." />
  const p = pedido.data
  const r = rec.data

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to={p ? `/compras/pedidos/${p.id}` : '/compras?aba=recebimentos'} aria-label="Voltar"><ArrowLeft /></Link>
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {novo ? 'Novo recebimento' : `Recebimento #${r?.numero}`}
              {r && <Badge variant={STATUS_RECEBIMENTO[r.status].variant}>{STATUS_RECEBIMENTO[r.status].label}</Badge>}
            </h1>
            {p && (
              <p className="text-sm text-muted-foreground">
                Pedido #{p.numero} · {p.fornecedor?.nome_fantasia || p.fornecedor?.razao_social}
                {r?.conferido_por_nome && ` · conferido por ${r.conferido_por_nome}`}
                {r?.confirmado_em && ` · confirmado em ${formatarData(r.confirmado_em, true)}`}
                {r?.motivo_cancelamento && ` · ${r.motivo_cancelamento}`}
              </p>
            )}
          </div>
        </div>
        {editavel && (
          <div className="flex flex-wrap gap-2">
            {!novo && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelando(true)}><Ban /> Cancelar</Button>}
            <Button variant="outline" onClick={() => { const e = validar(); if (e) return toast.error(e); salvar.mutate() }} disabled={salvar.isPending || confirmar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar conferência
            </Button>
            <Button onClick={() => { const e = validar(); if (e) return toast.error(e); confirmar.mutate() }} disabled={salvar.isPending || confirmar.isPending}>
              {confirmar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar entrada no estoque
            </Button>
          </div>
        )}
      </div>

      {editavel && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-sm text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Confira fisicamente cada item. O estoque só é atualizado ao confirmar. Se o mesmo produto chegou em lotes/tonalidades diferentes, use “Dividir lote”.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader><CardTitle>Itens recebidos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!linhas.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Não há itens pendentes neste pedido.</p>}
            {linhas.map((l) => (
              <LinhaRecebimento
                key={l.key}
                linha={l}
                editavel={editavel}
                excedente={excedentes.has(l.item.id)}
                unica={linhas.filter((x) => x.item.id === l.item.id).length === 1}
                locais={locais.data ?? []}
                onChange={(p) => atualizar(l.key, p)}
                onDividir={() => setLinhas((ls) => { const i = ls.findIndex((x) => x.key === l.key); const n = [...ls]; n.splice(i + 1, 0, { ...l, key: k(), quantidade: '', lote_id: '', lote_codigo: '', tonalidade: '', calibre: '', divergencia: '' }); return n })}
                onRemover={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle>Dados do recebimento</CardTitle></CardHeader>
          <CardContent>
            <fieldset disabled={!editavel} className="space-y-4">
              <Field label="NF do fornecedor" ajuda="Referência da nota recebida (não é emissão fiscal)."><Input value={nf} onChange={(e) => setNf(e.target.value)} /></Field>
              <Field label="Data do recebimento"><Input type="date" value={data} max={dataLocalISO()} onChange={(e) => setData(e.target.value)} /></Field>
              <Field label="Depósito" obrigatorio>
                <NativeSelect value={depositoId} onChange={(e) => { setDepositoId(e.target.value); setLinhas((ls) => ls.map((x) => ({ ...x, localizacao_id: '' }))) }}>
                  <option value="">Selecione</option>
                  {depositos.data?.filter((d) => d.ativo).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Observações"><Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></Field>
            </fieldset>
          </CardContent>
        </Card>
      </div>

      <MotivoDialog
        aberto={cancelando}
        titulo="Cancelar recebimento"
        descricao="A conferência é descartada; o pedido continua aguardando as mercadorias."
        rotuloConfirmar="Cancelar recebimento"
        destrutivo
        carregando={cancelar.isPending}
        onConfirmar={(m) => cancelar.mutate(m)}
        onFechar={() => setCancelando(false)}
      />
    </div>
  )
}

function LinhaRecebimento({
  linha: l,
  editavel,
  excedente,
  unica,
  locais,
  onChange,
  onDividir,
  onRemover,
}: {
  linha: Linha
  editavel: boolean
  excedente: boolean
  unica: boolean
  locais: { id: string; codigo: string; ativo: boolean }[]
  onChange: (p: Partial<Linha>) => void
  onDividir: () => void
  onRemover: () => void
}) {
  const lotes = useQuery({ queryKey: ['estoque', 'lotes-produto', l.item.produto_id], queryFn: () => listarLotesDoProduto(l.item.produto_id), enabled: editavel })
  const pendente = paraCanonico(l.item.quantidade_pendente, 4)
  const falta = l.quantidade ? escalar(pendente, 4) - escalar(l.quantidade, 4) : null

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{l.item.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {l.item.sku} · pedido <Qtd valor={l.item.quantidade} unidade={l.item.unidade} /> · pendente <Qtd valor={l.item.quantidade_pendente} unidade={l.item.unidade} />
          </p>
        </div>
        {editavel && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onDividir}><Copy /> Dividir lote</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemover} aria-label="Remover linha"><Trash2 /></Button>
          </div>
        )}
      </div>
      <fieldset disabled={!editavel} className="grid gap-3 lg:grid-cols-2">
        <Field label="Quantidade conferida" erro={excedente ? 'Soma maior que o pendente do pedido' : undefined}>
          <QuantidadeInput valor={l.quantidade} onChange={(q) => onChange({ quantidade: q })} unidade={l.item.unidade} m2PorCaixa={l.item.eh_revestimento ? l.item.m2_por_caixa : null} invalido={excedente} />
        </Field>
        <Field label="Localização">
          <NativeSelect value={l.localizacao_id} onChange={(e) => onChange({ localizacao_id: e.target.value })}>
            <option value="">Sem localização específica</option>
            {locais.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.codigo}</option>)}
          </NativeSelect>
        </Field>
        <Field label={l.item.eh_revestimento ? 'Lote / tonalidade / calibre (obrigatório)' : 'Lote (opcional)'} className="lg:col-span-2">
          {!editavel ? (
            <p className="text-sm">{l.loteDescricao ?? ([l.lote_codigo, l.tonalidade, l.calibre].filter(Boolean).join(' / ') || '—')}</p>
          ) : (
            <div className="space-y-2">
              <div className="inline-flex rounded-lg bg-secondary p-1 text-xs">
                {(['novo', 'existente'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => onChange({ modoLote: m })} className={`rounded-md px-3 py-1 font-medium ${l.modoLote === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
                    {m === 'novo' ? 'Lote novo' : 'Lote já cadastrado'}
                  </button>
                ))}
              </div>
              {l.modoLote === 'novo' ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder="Lote" value={l.lote_codigo} onChange={(e) => onChange({ lote_codigo: e.target.value.toUpperCase() })} />
                  <Input placeholder="Tonalidade" value={l.tonalidade} onChange={(e) => onChange({ tonalidade: e.target.value.toUpperCase() })} />
                  <Input placeholder="Calibre" value={l.calibre} onChange={(e) => onChange({ calibre: e.target.value.toUpperCase() })} />
                </div>
              ) : (
                <NativeSelect value={l.lote_id} onChange={(e) => onChange({ lote_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {lotes.data?.map((x) => <option key={x.id} value={x.id}>{[x.codigo, x.tonalidade && `Ton. ${x.tonalidade}`, x.calibre && `Cal. ${x.calibre}`].filter(Boolean).join(' · ')}</option>)}
                </NativeSelect>
              )}
            </div>
          )}
        </Field>
        <Field label="Divergência / avaria observada" className="lg:col-span-2">
          <Input value={l.divergencia} onChange={(e) => onChange({ divergencia: e.target.value })} placeholder="Ex.: 2 caixas quebradas devolvidas ao transportador" />
        </Field>
      </fieldset>
      {editavel && unica && falta !== null && falta > 0n && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> Faltam {desescalar(falta, 4).replace('.', ',')} {l.item.unidade}: o pedido ficará como recebido parcial.
        </p>
      )}
    </div>
  )
}
