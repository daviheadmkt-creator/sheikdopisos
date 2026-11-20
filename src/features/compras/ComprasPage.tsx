import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, FileSpreadsheet, Loader2, PackageCheck, Plus, Search, ShoppingBag, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { ProdutoBusca, Qtd, QuantidadeInput } from '@/features/estoque/componentes'
import type { ProdutoLista } from '@/features/produtos/api'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import {
  cancelarSolicitacao,
  criarSolicitacao,
  gerarSolicitacoesCriticas,
  listarCotacoes,
  listarPedidosCompra,
  listarRecebimentos,
  listarSolicitacoes,
  type Solicitacao,
} from './api'
import { STATUS_COTACAO, STATUS_PEDIDO_COMPRA, STATUS_RECEBIMENTO, STATUS_SOLICITACAO, URGENCIA, type StatusPedidoCompra } from './tipos'

const nomeForn = (f: { razao_social: string; nome_fantasia: string | null } | null | undefined) => f?.nome_fantasia || f?.razao_social || '—'

export function ComprasPage() {
  const { pode } = useAuth()
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') ?? 'pedidos'

  return (
    <>
      <PageHeader
        titulo="Compras"
        descricao="Solicitações, cotações, pedidos de compra e recebimentos. O estoque é atualizado somente na confirmação do recebimento."
        acoes={
          pode('compras', 'criar') && (
            <>
              <Button variant="outline" asChild>
                <Link to="/compras/cotacoes/nova">
                  <FileSpreadsheet /> Nova cotação
                </Link>
              </Button>
              <Button asChild>
                <Link to="/compras/pedidos/novo">
                  <Plus /> Novo pedido
                </Link>
              </Button>
            </>
          )
        }
      />
      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="pedidos"><ShoppingBag /> Pedidos</TabsTrigger>
          <TabsTrigger value="solicitacoes"><ClipboardList /> Solicitações</TabsTrigger>
          <TabsTrigger value="cotacoes"><FileSpreadsheet /> Cotações</TabsTrigger>
          <TabsTrigger value="recebimentos"><PackageCheck /> Recebimentos</TabsTrigger>
        </TabsList>
        <TabsContent value="pedidos"><PedidosTab /></TabsContent>
        <TabsContent value="solicitacoes"><SolicitacoesTab /></TabsContent>
        <TabsContent value="cotacoes"><CotacoesTab /></TabsContent>
        <TabsContent value="recebimentos"><RecebimentosTab /></TabsContent>
      </Tabs>
    </>
  )
}

function PedidosTab() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)
  const filtros = { busca: b, status, pagina, porPagina: 20 }
  const q = useQuery({ queryKey: ['compras', 'pedidos', filtros], queryFn: () => listarPedidosCompra(filtros), placeholderData: keepPreviousData })
  const hoje = dataLocalISO()

  return (
    <Card>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1) }} placeholder="Nº do pedido" className="pl-9" aria-label="Pesquisar" />
        </div>
        <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1) }} aria-label="Status">
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_PEDIDO_COMPRA) as StatusPedidoCompra[]).map((s) => (
            <option key={s} value={s}>{STATUS_PEDIDO_COMPRA[s].label}</option>
          ))}
        </NativeSelect>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.linhas.length ? (
        <Vazio titulo="Nenhum pedido de compra" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Previsão de entrega</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.linhas.map((p) => {
                const atrasado = p.previsao_entrega && p.previsao_entrega < hoje && ['aprovado', 'parcialmente_recebido'].includes(p.status)
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/compras/pedidos/${p.id}`)}>
                    <TableCell className="font-medium">#{p.numero}</TableCell>
                    <TableCell>{nomeForn(p.fornecedor)}</TableCell>
                    <TableCell>{formatarData(p.created_at)}</TableCell>
                    <TableCell className={atrasado ? 'text-destructive' : ''}>
                      {p.previsao_entrega ? formatarData(`${p.previsao_entrega}T12:00:00`) : '—'}
                      {atrasado && <Badge variant="danger" className="ml-2">Atrasado</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(p.total)}</TableCell>
                    <TableCell><Badge variant={STATUS_PEDIDO_COMPRA[p.status].variant}>{STATUS_PEDIDO_COMPRA[p.status].label}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Pagination pagina={pagina} porPagina={20} total={q.data.total} onChange={setPagina} />
        </>
      )}
    </Card>
  )
}

function SolicitacoesTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [status, setStatus] = useState('abertas')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [nova, setNova] = useState(false)
  const q = useQuery({ queryKey: ['compras', 'solicitacoes', status], queryFn: () => listarSolicitacoes(status) })
  const pendentes = useMemo(() => (q.data ?? []).filter((s) => s.status === 'pendente' && selecionadas.has(s.id)), [q.data, selecionadas])
  const invalidar = () => qc.invalidateQueries({ queryKey: ['compras'] })

  const gerar = useMutation({
    mutationFn: gerarSolicitacoesCriticas,
    onSuccess: (n) => {
      toast.success(n ? `${n} solicitação(ões) criada(s) a partir do estoque crítico.` : 'Nenhum produto crítico sem solicitação aberta.')
      invalidar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const cancelar = useMutation({
    mutationFn: cancelarSolicitacao,
    onSuccess: () => { toast.success('Solicitação cancelada.'); invalidar() },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const usarEm = (destino: 'pedido' | 'cotacao') => {
    const lista: Solicitacao[] = pendentes
    navigate(destino === 'pedido' ? '/compras/pedidos/novo' : '/compras/cotacoes/nova', { state: { solicitacoes: lista } })
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-56" aria-label="Status">
          <option value="abertas">Em aberto</option>
          <option value="pendente">Pendentes</option>
          <option value="atendida">Atendidas</option>
          <option value="cancelada">Canceladas</option>
          <option value="">Todas</option>
        </NativeSelect>
        <div className="flex flex-wrap gap-2">
          {pendentes.length > 0 && pode('compras', 'criar') && (
            <>
              <Button variant="outline" onClick={() => usarEm('cotacao')}><FileSpreadsheet /> Cotar ({pendentes.length})</Button>
              <Button variant="dark" onClick={() => usarEm('pedido')}><ShoppingBag /> Gerar pedido ({pendentes.length})</Button>
            </>
          )}
          {(pode('compras', 'criar') || pode('estoque', 'criar')) && (
            <>
              <Button variant="outline" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
                {gerar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Gerar do estoque crítico
              </Button>
              <Button onClick={() => setNova(true)}><Plus /> Solicitar</Button>
            </>
          )}
        </div>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.length ? (
        <Vazio titulo="Nenhuma solicitação" descricao="Estoquistas e vendedores podem solicitar compras; o comprador transforma em cotação ou pedido." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Nº</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead>Urgência</TableHead>
              <TableHead>Necessário até</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {s.status === 'pendente' && (
                    <Checkbox
                      checked={selecionadas.has(s.id)}
                      onCheckedChange={(c) => setSelecionadas((prev) => { const n = new Set(prev); if (c) n.add(s.id); else n.delete(s.id); return n })}
                      aria-label="Selecionar"
                    />
                  )}
                </TableCell>
                <TableCell className="tabular-nums">#{s.numero}</TableCell>
                <TableCell>
                  <p className="font-medium">{s.produto_descricao}</p>
                  <p className="text-xs text-muted-foreground">{s.sku}{s.motivo && ` · ${s.motivo}`}</p>
                </TableCell>
                <TableCell className="text-right"><Qtd valor={s.quantidade} unidade={s.unidade} m2PorCaixa={s.eh_revestimento ? s.m2_por_caixa : null} /></TableCell>
                <TableCell><Badge variant={URGENCIA[s.urgencia]?.variant ?? 'neutral'}>{URGENCIA[s.urgencia]?.label ?? s.urgencia}</Badge></TableCell>
                <TableCell>{s.necessario_ate ? formatarData(`${s.necessario_ate}T12:00:00`) : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{s.created_by_nome ?? '—'}<span className="block text-xs text-muted-foreground">{formatarData(s.created_at)}</span></TableCell>
                <TableCell>
                  <Badge variant={STATUS_SOLICITACAO[s.status].variant}>{STATUS_SOLICITACAO[s.status].label}</Badge>
                  {s.pedido_numero && (
                    <Link to={`/compras/pedidos/${s.pedido_id}`} className="ml-2 text-xs text-info hover:underline">Pedido #{s.pedido_numero}</Link>
                  )}
                </TableCell>
                <TableCell>
                  {['pendente', 'em_cotacao'].includes(s.status) && pode('compras', 'editar') && (
                    <Button variant="ghost" size="icon" onClick={() => cancelar.mutate(s.id)} aria-label="Cancelar solicitação" className="text-destructive hover:text-destructive">
                      <X />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NovaSolicitacaoDialog aberto={nova} onFechar={() => setNova(false)} />
    </Card>
  )
}

function NovaSolicitacaoDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const [produto, setProduto] = useState<ProdutoLista | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [urgencia, setUrgencia] = useState('normal')
  const [ate, setAte] = useState('')
  useEffect(() => {
    if (aberto) { setProduto(null); setQuantidade(''); setMotivo(''); setUrgencia('normal'); setAte('') }
  }, [aberto])
  const salvar = useMutation({
    mutationFn: () => criarSolicitacao({ produto_id: produto!.id, quantidade, motivo, urgencia, necessario_ate: ate }),
    onSuccess: () => { toast.success('Solicitação registrada.'); qc.invalidateQueries({ queryKey: ['compras'] }); onFechar() },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar compra</DialogTitle>
          <DialogDescription>O comprador recebe a solicitação para cotar ou incluir em pedido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Produto" obrigatorio><ProdutoBusca valor={produto} onSelecionar={setProduto} /></Field>
          {produto && (
            <Field label="Quantidade" obrigatorio>
              <QuantidadeInput valor={quantidade} onChange={setQuantidade} unidade={produto.unidade} m2PorCaixa={produto.eh_revestimento ? produto.m2_por_caixa : null} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Urgência">
              <NativeSelect value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </NativeSelect>
            </Field>
            <Field label="Necessário até"><Input type="date" value={ate} min={dataLocalISO()} onChange={(e) => setAte(e.target.value)} /></Field>
          </div>
          <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pedido de cliente, reposição" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={!produto || !quantidade || salvar.isPending}>
            {salvar.isPending && <Loader2 className="animate-spin" />} Solicitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CotacoesTab() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['compras', 'cotacoes'], queryFn: listarCotacoes })
  return (
    <Card>
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.length ? (
        <Vazio titulo="Nenhuma cotação" descricao="Compare preços de vários fornecedores e gere os pedidos com os vencedores." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Fornecedores</TableHead>
              <TableHead>Prazo de resposta</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/compras/cotacoes/${c.id}`)}>
                <TableCell className="font-medium">#{c.numero}</TableCell>
                <TableCell>{c.descricao}</TableCell>
                <TableCell>{c.compras_cotacao_itens[0]?.count ?? 0}</TableCell>
                <TableCell>{c.compras_cotacao_fornecedores[0]?.count ?? 0}</TableCell>
                <TableCell>{c.prazo_resposta ? formatarData(`${c.prazo_resposta}T12:00:00`) : '—'}</TableCell>
                <TableCell><Badge variant={STATUS_COTACAO[c.status].variant}>{STATUS_COTACAO[c.status].label}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

function RecebimentosTab() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['compras', 'recebimentos', status], queryFn: () => listarRecebimentos(status) })
  return (
    <Card>
      <div className="border-b p-4">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56" aria-label="Status">
          <option value="">Todos</option>
          <option value="em_conferencia">Em conferência</option>
          <option value="confirmado">Confirmados</option>
          <option value="cancelado">Cancelados</option>
        </NativeSelect>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.length ? (
        <Vazio titulo="Nenhum recebimento" descricao="Abra um pedido aprovado e clique em “Registrar recebimento”." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Pedido / Fornecedor</TableHead>
              <TableHead>NF do fornecedor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Conferente</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/compras/recebimentos/${r.id}`)}>
                <TableCell className="font-medium">#{r.numero}</TableCell>
                <TableCell>Pedido #{r.pedido?.numero}<span className="block text-xs text-muted-foreground">{nomeForn(r.pedido?.fornecedor)}</span></TableCell>
                <TableCell>{r.nota_fiscal ?? '—'}</TableCell>
                <TableCell>{formatarData(`${r.data_recebimento}T12:00:00`)}</TableCell>
                <TableCell>{r.conferido_por_nome ?? '—'}</TableCell>
                <TableCell><Badge variant={STATUS_RECEBIMENTO[r.status].variant}>{STATUS_RECEBIMENTO[r.status].label}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
