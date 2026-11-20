import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Download, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { FORMAS_PAGAMENTO } from '@/features/comercial/tipos'
import { baixarCsv, gerarCsv } from '@/lib/csv'
import { formatarData, formatarMoeda } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { listarParcelas, totaisParcelas, type FiltrosParcelas, type Parcela, type TipoTitulo } from './api'
import { LiquidarDialog } from './LiquidarDialog'
import { NovoTituloDialog, STATUS_PARCELA, TituloDetalheDialog } from './TituloDialogs'

const POR_PAGINA = 25
const ORIGEM: Record<string, string> = { venda: 'Venda', compra: 'Compra', manual: 'Manual' }

export function ContasPage() {
  const { pode } = useAuth()
  const [params, setParams] = useSearchParams()
  const tipo = (params.get('tipo') as TipoTitulo) ?? 'receber'
  const [situacao, setSituacao] = useState<FiltrosParcelas['situacao']>('abertas')
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [pagina, setPagina] = useState(1)
  const [novo, setNovo] = useState(false)
  const [liquidando, setLiquidando] = useState<Parcela | null>(null)
  const [titulo, setTitulo] = useState<string | null>(null)
  const b = useDebounce(busca)

  const base = { tipo, situacao, busca: b, de, ate }
  const q = useQuery({ queryKey: ['financeiro', 'parcelas', base, pagina], queryFn: () => listarParcelas({ ...base, pagina, porPagina: POR_PAGINA }), placeholderData: keepPreviousData })
  const total = useQuery({ queryKey: ['financeiro', 'parcelas-total', base], queryFn: () => totaisParcelas(base), enabled: situacao !== 'pagas' })

  const exportar = useMutation({
    mutationFn: () => listarParcelas({ ...base, pagina: 1, porPagina: 5000 }),
    onSuccess: ({ linhas }) => {
      baixarCsv(
        `contas_a_${tipo}_${situacao}.csv`,
        gerarCsv(linhas, [
          { titulo: 'Título', valor: (p) => p.titulo_numero },
          { titulo: 'Parcela', valor: (p) => `${p.numero}/${p.total_parcelas}` },
          { titulo: tipo === 'receber' ? 'Cliente' : 'Fornecedor', valor: (p) => p.pessoa_nome },
          { titulo: 'Descrição', valor: (p) => p.descricao },
          { titulo: 'Categoria', valor: (p) => p.categoria_nome },
          { titulo: 'Vencimento', valor: (p) => formatarData(`${p.vencimento}T12:00:00`) },
          { titulo: 'Valor', valor: (p) => Number(p.valor) },
          { titulo: 'Pago', valor: (p) => Number(p.valor_pago) },
          { titulo: 'Em aberto', valor: (p) => Number(p.valor_aberto) },
          { titulo: 'Dias de atraso', valor: (p) => p.dias_atraso },
          { titulo: 'Situação', valor: (p) => STATUS_PARCELA[p.status].label },
        ]),
      )
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const f = (fn: () => void) => { fn(); setPagina(1) }
  const recebe = tipo === 'receber'

  return (
    <>
      <PageHeader
        titulo="Contas a Pagar e Receber"
        descricao="Títulos, parcelas, vencimentos, liquidações com juros e descontos, inadimplência e histórico."
        acoes={
          <>
            {pode('contas', 'exportar') && (
              <Button variant="outline" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
                {exportar.isPending ? <Loader2 className="animate-spin" /> : <Download />} Exportar CSV
              </Button>
            )}
            {pode('contas', 'criar') && <Button onClick={() => setNovo(true)}><Plus /> Novo lançamento</Button>}
          </>
        }
      />

      <Tabs value={tipo} onValueChange={(v) => { setParams({ tipo: v }, { replace: true }); setPagina(1) }}>
        <TabsList>
          <TabsTrigger value="receber"><ArrowDownCircle /> A receber</TabsTrigger>
          <TabsTrigger value="pagar"><ArrowUpCircle /> A pagar</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mt-4">
        <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[1fr_200px_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => f(() => setBusca(e.target.value))} placeholder={`${recebe ? 'Cliente' : 'Fornecedor'}, descrição, categoria ou nº do título`} className="pl-9" aria-label="Pesquisar" />
          </div>
          <NativeSelect value={situacao} onChange={(e) => f(() => setSituacao(e.target.value as FiltrosParcelas['situacao']))} aria-label="Situação">
            <option value="abertas">Em aberto</option>
            <option value="vencidas">{recebe ? 'Vencidas (inadimplência)' : 'Vencidas'}</option>
            <option value="pagas">Liquidadas</option>
            <option value="todas">Todas</option>
          </NativeSelect>
          <Input type="date" value={de} onChange={(e) => f(() => setDe(e.target.value))} aria-label="Vencimento de" title="Vencimento de" />
          <Input type="date" value={ate} onChange={(e) => f(() => setAte(e.target.value))} aria-label="Vencimento até" title="Vencimento até" />
        </div>
        {situacao !== 'pagas' && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b bg-background/60 px-4 py-2.5 text-sm">
            <span>Total em aberto no filtro: <strong className="tabular-nums">{total.isLoading ? '…' : formatarMoeda(total.data ?? 0)}</strong></span>
            {situacao === 'vencidas' && recebe && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4" /> Valores em atraso — juros e multa são sugeridos na baixa.</span>}
          </div>
        )}
        {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.linhas.length ? (
          <Vazio titulo="Nenhuma parcela encontrada" descricao={recebe ? 'Vendas confirmadas geram contas a receber automaticamente.' : 'Recebimentos de compra confirmados geram contas a pagar automaticamente.'} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>{recebe ? 'Cliente' : 'Fornecedor'} / descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Em aberto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setTitulo(p.titulo_id)}>
                    <TableCell className="whitespace-nowrap">
                      <span className={p.dias_atraso > 0 ? 'font-medium text-destructive' : ''}>{formatarData(`${p.vencimento}T12:00:00`)}</span>
                      {p.dias_atraso > 0 && <span className="block text-xs text-destructive">{p.dias_atraso} dia(s) em atraso</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">#{p.titulo_numero} <span className="text-muted-foreground">{p.numero}/{p.total_parcelas}</span></TableCell>
                    <TableCell>
                      <p className="font-medium">{p.pessoa_nome ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{p.descricao}{p.forma_prevista && ` · ${FORMAS_PAGAMENTO[p.forma_prevista].label}`}</p>
                    </TableCell>
                    <TableCell className="text-sm">{p.categoria_nome}</TableCell>
                    <TableCell><Badge variant="neutral">{ORIGEM[p.documento_tipo]}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(p.valor)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatarMoeda(p.valor_aberto)}</TableCell>
                    <TableCell><Badge variant={STATUS_PARCELA[p.status].variant}>{STATUS_PARCELA[p.status].label}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {['aberta', 'parcial'].includes(p.status) && pode('contas', 'editar') && (
                        <Button size="sm" onClick={() => setLiquidando(p)}>{recebe ? 'Receber' : 'Pagar'}</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
          </>
        )}
      </Card>

      <NovoTituloDialog aberto={novo} onFechar={() => setNovo(false)} tipoInicial={tipo} />
      <LiquidarDialog parcela={liquidando} onFechar={() => setLiquidando(null)} />
      <TituloDetalheDialog tituloId={titulo} onFechar={() => setTitulo(null)} />
    </>
  )
}
