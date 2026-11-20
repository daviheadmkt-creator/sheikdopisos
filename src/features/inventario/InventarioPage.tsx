import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CheckCheck, EyeOff, Loader2, Plus, RotateCcw, Search, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarLocalizacoes, listarLotesDoProduto } from '@/features/estoque/api'
import { ProdutoBusca, Qtd, QuantidadeInput } from '@/features/estoque/componentes'
import type { ProdutoLista } from '@/features/produtos/api'
import { paraCanonico } from '@/lib/decimal'
import { formatarData, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  adicionarItemInventario,
  aprovarInventario,
  cancelarInventario,
  enviarParaRevisao,
  listarItensInventario,
  obterInventario,
  registrarContagem,
  solicitarRecontagem,
  STATUS_INVENTARIO,
  type ItemInventario,
} from './api'

type Filtro = 'todos' | 'pendentes' | 'divergentes'

export function InventarioPage() {
  const { id } = useParams()
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [adicionar, setAdicionar] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [confirmarAprovacao, setConfirmarAprovacao] = useState(false)

  const inv = useQuery({ queryKey: ['estoque', 'inventarios', id], queryFn: () => obterInventario(id!) })
  const itens = useQuery({ queryKey: ['estoque', 'inventarios', id, 'itens'], queryFn: () => listarItensInventario(id!) })

  const status = inv.data?.status
  const emContagem = status === 'em_contagem'
  const emRevisao = status === 'em_revisao'
  // Contagem cega: quem só conta não vê o saldo do sistema enquanto o inventário está aberto
  const verSistema = pode('inventario', 'aprovar') || status === 'aprovado' || status === 'cancelado'
  const podeContar = pode('inventario', 'editar') && emContagem

  const invalidar = () => qc.invalidateQueries({ queryKey: ['estoque'] })
  const onErro = (e: unknown) => toast.error(mensagemErro(e))

  const resumo = useMemo(() => {
    const lista = itens.data ?? []
    const contados = lista.filter((i) => i.contagem_final !== null && !i.recontagem_solicitada).length
    const divergentes = lista.filter((i) => i.diferenca !== null && i.diferenca !== 0)
    const valor = divergentes.reduce((s, i) => s + (i.diferenca ?? 0) * (i.custo ?? 0), 0)
    return { total: lista.length, contados, divergentes: divergentes.length, valor }
  }, [itens.data])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (itens.data ?? []).filter((i) => {
      if (filtro === 'pendentes' && i.contagem_final !== null && !i.recontagem_solicitada) return false
      if (filtro === 'divergentes' && !(i.diferenca !== null && i.diferenca !== 0)) return false
      if (!t) return true
      return [i.produto_descricao, i.sku, i.lote_codigo, i.tonalidade, i.localizacao_codigo].some((v) => v?.toLowerCase().includes(t))
    })
  }, [itens.data, filtro, busca])

  useEffect(() => setSelecionados(new Set()), [status])

  const enviar = useMutation({
    mutationFn: () => enviarParaRevisao(id!),
    onSuccess: () => {
      toast.success('Inventário enviado para revisão.')
      invalidar()
    },
    onError: onErro,
  })
  const recontar = useMutation({
    mutationFn: () => solicitarRecontagem(id!, [...selecionados]),
    onSuccess: () => {
      toast.success('Recontagem solicitada para os itens selecionados.')
      setSelecionados(new Set())
      invalidar()
    },
    onError: onErro,
  })
  const aprovar = useMutation({
    mutationFn: () => aprovarInventario(id!),
    onSuccess: (n) => {
      toast.success(n ? `Inventário aprovado. ${n} ajuste(s) lançado(s) no estoque.` : 'Inventário aprovado sem divergências.')
      setConfirmarAprovacao(false)
      invalidar()
    },
    onError: onErro,
  })
  const cancelar = useMutation({
    mutationFn: (motivo: string) => cancelarInventario(id!, motivo),
    onSuccess: () => {
      toast.success('Inventário cancelado. O depósito foi liberado.')
      setCancelando(false)
      invalidar()
    },
    onError: onErro,
  })

  if (inv.isLoading) return <Carregando />
  if (inv.error) return <ErroCarregamento mensagem={mensagemErro(inv.error)} />
  const d = inv.data!
  const st = STATUS_INVENTARIO[d.status]

  const alternar = (itemId: string) =>
    setSelecionados((s) => {
      const n = new Set(s)
      if (n.has(itemId)) n.delete(itemId)
      else n.add(itemId)
      return n
    })

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to="/inventario" aria-label="Voltar">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              Inventário #{d.numero} <Badge variant={st.variant}>{st.label}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {d.descricao} · {d.deposito?.nome}
              {d.categoria && ` · ${d.categoria.nome}`} · aberto em {formatarData(d.created_at, true)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeContar && (
            <Button variant="outline" onClick={() => setAdicionar(true)}>
              <Plus /> Item não listado
            </Button>
          )}
          {(emContagem || emRevisao) && pode('inventario', 'editar') && selecionados.size > 0 && (
            <Button variant="outline" onClick={() => recontar.mutate()} disabled={recontar.isPending}>
              <RotateCcw /> Recontar ({selecionados.size})
            </Button>
          )}
          {emContagem && pode('inventario', 'editar') && (
            <Button variant="dark" onClick={() => enviar.mutate()} disabled={enviar.isPending || resumo.contados < resumo.total}>
              {enviar.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar para revisão
            </Button>
          )}
          {emRevisao && pode('inventario', 'aprovar') && (
            <Button onClick={() => setConfirmarAprovacao(true)}>
              <CheckCheck /> Aprovar e ajustar estoque
            </Button>
          )}
          {(emContagem || emRevisao) && pode('inventario', 'cancelar') && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelando(true)}>
              <XCircle /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Itens" valor={String(resumo.total)} />
        <Indicador titulo="Contados" valor={`${resumo.contados} de ${resumo.total}`} destaque={resumo.contados === resumo.total} />
        <Indicador titulo="Divergências" valor={verSistema ? String(resumo.divergentes) : '—'} />
        <Indicador titulo="Impacto (a custo)" valor={verSistema ? formatarMoeda(resumo.valor) : '—'} negativo={resumo.valor < 0} />
      </div>

      {d.status === 'cancelado' && d.motivo_cancelamento && (
        <p className="mb-4 rounded-lg border bg-muted p-3 text-sm">Motivo do cancelamento: {d.motivo_cancelamento}</p>
      )}
      {!verSistema && emContagem && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <EyeOff className="h-4 w-4" /> Contagem cega: o saldo do sistema não é exibido durante a contagem.
        </p>
      )}

      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Produto, SKU, lote, tonalidade ou local" className="pl-9" aria-label="Pesquisar itens" />
          </div>
          <NativeSelect value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtro">
            <option value="todos">Todos os itens</option>
            <option value="pendentes">Pendentes de contagem</option>
            {verSistema && <option value="divergentes">Com divergência</option>}
          </NativeSelect>
        </div>
        {itens.isLoading ? (
          <Carregando />
        ) : itens.error ? (
          <ErroCarregamento mensagem={mensagemErro(itens.error)} />
        ) : !visiveis.length ? (
          <Vazio titulo="Nenhum item" descricao={resumo.total === 0 ? 'O depósito não tinha saldo na abertura. Use “Item não listado”.' : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {(emContagem || emRevisao) && <TableHead className="w-8" />}
                <TableHead>Produto</TableHead>
                <TableHead>Lote / Ton. / Cal.</TableHead>
                <TableHead>Local</TableHead>
                {verSistema && <TableHead className="text-right">Sistema</TableHead>}
                <TableHead className="min-w-[220px]">Contagem</TableHead>
                {verSistema && <TableHead className="text-right">Diferença</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((i) => (
                <TableRow key={i.id} className={cn(i.recontagem_solicitada && 'bg-amber-50/60')}>
                  {(emContagem || emRevisao) && (
                    <TableCell>
                      <Checkbox checked={selecionados.has(i.id)} onCheckedChange={() => alternar(i.id)} aria-label="Selecionar para recontagem" />
                    </TableCell>
                  )}
                  <TableCell>
                    <p className="font-medium">{i.produto_descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {i.sku}
                      {i.incluido_na_contagem && <Badge variant="info" className="ml-2">Incluído na contagem</Badge>}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {i.lote_codigo ?? '—'}
                    {i.tonalidade && <span className="text-muted-foreground"> / {i.tonalidade}</span>}
                    {i.calibre && <span className="text-muted-foreground"> / {i.calibre}</span>}
                  </TableCell>
                  <TableCell>{i.localizacao_codigo ?? '—'}</TableCell>
                  {verSistema && (
                    <TableCell className="text-right">
                      <Qtd valor={i.quantidade_sistema} unidade={i.unidade} m2PorCaixa={i.eh_revestimento ? i.m2_por_caixa : null} />
                    </TableCell>
                  )}
                  <TableCell>
                    <ContagemCelula item={i} editavel={podeContar} verHistorico={verSistema} />
                  </TableCell>
                  {verSistema && (
                    <TableCell className="text-right">
                      {i.diferenca === null || i.recontagem_solicitada ? (
                        <span className="text-muted-foreground">—</span>
                      ) : i.diferenca === 0 ? (
                        <Check className="ml-auto h-4 w-4 text-success" />
                      ) : (
                        <span className={i.diferenca > 0 ? 'text-success' : 'text-destructive'}>
                          {i.diferenca > 0 ? '+' : ''}
                          <Qtd valor={i.diferenca} unidade={i.unidade} />
                        </span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {podeContar && <AdicionarItemDialog aberto={adicionar} onFechar={() => setAdicionar(false)} inventarioId={d.id} depositoId={d.deposito_id} />}

      <Dialog open={confirmarAprovacao} onOpenChange={setConfirmarAprovacao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar inventário #{d.numero}</DialogTitle>
            <DialogDescription>
              Serão lançados {resumo.divergentes} ajuste(s) de estoque, com impacto de {formatarMoeda(resumo.valor)} a preço de custo.
              Os ajustes ficam vinculados a este inventário e não podem ser desfeitos. O depósito será liberado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarAprovacao(false)}>
              Voltar
            </Button>
            <Button onClick={() => aprovar.mutate()} disabled={aprovar.isPending}>
              {aprovar.isPending && <Loader2 className="animate-spin" />}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MotivoDialog
        aberto={cancelando}
        titulo={`Cancelar inventário #${d.numero}`}
        descricao="Nenhum ajuste será lançado e o depósito será liberado."
        rotuloConfirmar="Cancelar inventário"
        destrutivo
        carregando={cancelar.isPending}
        onConfirmar={(m) => cancelar.mutate(m)}
        onFechar={() => setCancelando(false)}
      />
    </>
  )
}

function Indicador({ titulo, valor, destaque, negativo }: { titulo: string; valor: string; destaque?: boolean; negativo?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className={cn('mt-1 text-xl font-semibold tabular-nums', destaque && 'text-success', negativo && 'text-destructive')}>{valor}</p>
      </CardContent>
    </Card>
  )
}

function ContagemCelula({ item, editavel, verHistorico }: { item: ItemInventario; editavel: boolean; verHistorico: boolean }) {
  const qc = useQueryClient()
  const [valor, setValor] = useState('')
  const contado = item.contagem_final !== null && !item.recontagem_solicitada

  const salvar = useMutation({
    mutationFn: (q: string) => registrarContagem(item.id, q),
    onSuccess: () => {
      setValor('')
      qc.invalidateQueries({ queryKey: ['estoque', 'inventarios', item.inventario_id, 'itens'] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const historico = (
    <span className="text-xs text-muted-foreground">
      {item.contagem_1 !== null && `1ª: ${paraCanonico(item.contagem_1, 4).replace('.', ',')} (${item.contado_1_por ?? '—'})`}
      {item.contagem_2 !== null && ` · 2ª: ${paraCanonico(item.contagem_2, 4).replace('.', ',')} (${item.contado_2_por ?? '—'})`}
    </span>
  )

  if (!editavel) {
    return item.contagem_final === null ? (
      <span className="text-muted-foreground">Não contado</span>
    ) : (
      <div>
        <Qtd valor={item.contagem_final} unidade={item.unidade} m2PorCaixa={item.eh_revestimento ? item.m2_por_caixa : null} />
        {verHistorico && <div>{historico}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {item.recontagem_solicitada && <Badge variant="default">Recontagem solicitada</Badge>}
      {contado && (
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-success" />
          <Qtd valor={item.contagem_final} unidade={item.unidade} m2PorCaixa={item.eh_revestimento ? item.m2_por_caixa : null} />
        </div>
      )}
      <div className="flex items-start gap-1">
        <div className="flex-1">
          <QuantidadeInput valor={valor} onChange={setValor} unidade={item.unidade} m2PorCaixa={item.eh_revestimento ? item.m2_por_caixa : null} />
        </div>
        <Button size="icon" variant={valor ? 'default' : 'outline'} disabled={!valor || salvar.isPending} onClick={() => salvar.mutate(valor)} aria-label="Salvar contagem">
          {salvar.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button size="sm" variant="ghost" className="h-10" disabled={salvar.isPending} onClick={() => salvar.mutate('0')} title="Registrar contagem zero">
          Zero
        </Button>
      </div>
      {verHistorico && historico}
    </div>
  )
}

function AdicionarItemDialog({
  aberto,
  onFechar,
  inventarioId,
  depositoId,
}: {
  aberto: boolean
  onFechar: () => void
  inventarioId: string
  depositoId: string
}) {
  const qc = useQueryClient()
  const [produto, setProduto] = useState<ProdutoLista | null>(null)
  const [lote, setLote] = useState('')
  const [local, setLocal] = useState('')
  const [quantidade, setQuantidade] = useState('')

  useEffect(() => {
    if (aberto) {
      setProduto(null)
      setLote('')
      setLocal('')
      setQuantidade('')
    }
  }, [aberto])

  const lotes = useQuery({
    queryKey: ['estoque', 'lotes-produto', produto?.id],
    queryFn: () => listarLotesDoProduto(produto!.id),
    enabled: !!produto,
  })
  const locais = useQuery({ queryKey: ['estoque', 'localizacoes', depositoId], queryFn: () => listarLocalizacoes(depositoId), enabled: aberto })

  const salvar = useMutation({
    mutationFn: () => adicionarItemInventario({ inventario: inventarioId, produto: produto!.id, lote, localizacao: local, quantidade }),
    onSuccess: () => {
      toast.success('Item incluído na contagem.')
      qc.invalidateQueries({ queryKey: ['estoque', 'inventarios', inventarioId] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Incluir item encontrado</DialogTitle>
          <DialogDescription>Mercadoria encontrada fisicamente que não estava na lista do inventário.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Produto" obrigatorio>
            <ProdutoBusca valor={produto} onSelecionar={(p) => { setProduto(p); setLote('') }} />
          </Field>
          {produto && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Lote" obrigatorio={produto.eh_revestimento} ajuda="Cadastre lotes novos em Lotes e Tonalidades.">
                  <NativeSelect value={lote} onChange={(e) => setLote(e.target.value)}>
                    <option value="">{produto.eh_revestimento ? 'Selecione' : 'Sem lote'}</option>
                    {lotes.data?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo}
                        {l.tonalidade ? ` · ${l.tonalidade}` : ''}
                        {l.calibre ? ` · ${l.calibre}` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Localização">
                  <NativeSelect value={local} onChange={(e) => setLocal(e.target.value)}>
                    <option value="">Sem localização</option>
                    {locais.data?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Quantidade contada" obrigatorio>
                <QuantidadeInput valor={quantidade} onChange={setQuantidade} unidade={produto.unidade} m2PorCaixa={produto.eh_revestimento ? produto.m2_por_caixa : null} />
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={!produto || !quantidade || (produto.eh_revestimento && !lote) || salvar.isPending}
          >
            {salvar.isPending && <Loader2 className="animate-spin" />}
            Incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
