import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, ArrowRight, Download, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { baixarCsv, gerarCsv } from '@/lib/csv'
import { dataLocalISO, formatarData } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { exportarMovimentacoes, listarDepositos, listarMovimentacoes, type Movimentacao } from './api'
import { Qtd } from './componentes'
import { MovimentacaoDialog } from './MovimentacaoDialog'
import { LISTA_TIPOS, TIPOS_MOVIMENTACAO } from './regras'

const POR_PAGINA = 25

const local = (dep: string | null, loc: string | null) => (dep ? `${dep}${loc ? ` · ${loc}` : ''}` : null)

function badgeTipo(m: Movimentacao) {
  const s = TIPOS_MOVIMENTACAO[m.tipo].sinal
  return <Badge variant={s > 0 ? 'success' : s < 0 ? 'danger' : 'info'}>{TIPOS_MOVIMENTACAO[m.tipo].label}</Badge>
}

const DOCUMENTO: Record<string, string> = { manual: 'Manual', inventario: 'Inventário', venda: 'Venda', compra: 'Compra' }

export function MovimentacoesPage() {
  const { pode } = useAuth()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [deposito, setDeposito] = useState('')
  const [de, setDe] = useState(dataLocalISO(new Date(), -30))
  const [ate, setAte] = useState(dataLocalISO())
  const [pagina, setPagina] = useState(1)
  const [nova, setNova] = useState(false)
  const b = useDebounce(busca)

  const filtrosBase = { busca: b, tipo, deposito, de, ate }
  const q = useQuery({
    queryKey: ['estoque', 'movimentacoes', filtrosBase, pagina],
    queryFn: () => listarMovimentacoes({ ...filtrosBase, pagina, porPagina: POR_PAGINA }),
    placeholderData: keepPreviousData,
  })
  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos })

  const exportar = useMutation({
    mutationFn: () => exportarMovimentacoes(filtrosBase),
    onSuccess: (linhas) => {
      const csv = gerarCsv(linhas, [
        { titulo: 'Número', valor: (m) => m.numero },
        { titulo: 'Data', valor: (m) => formatarData(m.created_at, true) },
        { titulo: 'Tipo', valor: (m) => TIPOS_MOVIMENTACAO[m.tipo].label },
        { titulo: 'SKU', valor: (m) => m.sku },
        { titulo: 'Produto', valor: (m) => m.produto_descricao },
        { titulo: 'Lote', valor: (m) => m.lote_codigo },
        { titulo: 'Tonalidade', valor: (m) => m.tonalidade },
        { titulo: 'Calibre', valor: (m) => m.calibre },
        { titulo: 'Origem', valor: (m) => local(m.deposito_origem_nome, m.localizacao_origem_codigo) },
        { titulo: 'Destino', valor: (m) => local(m.deposito_destino_nome, m.localizacao_destino_codigo) },
        { titulo: 'Quantidade', valor: (m) => m.quantidade },
        { titulo: 'Unidade', valor: (m) => m.unidade },
        { titulo: 'Custo unitário', valor: (m) => m.custo_unitario },
        { titulo: 'Motivo', valor: (m) => m.motivo },
        { titulo: 'Origem do lançamento', valor: (m) => DOCUMENTO[m.documento_tipo] ?? m.documento_tipo },
        { titulo: 'Documento', valor: (m) => m.documento_id },
        { titulo: 'Usuário', valor: (m) => m.created_by_nome },
      ])
      baixarCsv(`movimentacoes_${de}_a_${ate}.csv`, csv)
      toast.success(`${linhas.length} movimentações exportadas.`)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const filtrar = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Movimentações de Estoque"
        descricao="Histórico imutável de entradas, saídas, transferências, ajustes, devoluções e avarias."
        acoes={
          <>
            {pode('movimentacoes', 'exportar') && (
              <Button variant="outline" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
                {exportar.isPending ? <Loader2 className="animate-spin" /> : <Download />} Exportar CSV
              </Button>
            )}
            {pode('movimentacoes', 'criar') && (
              <Button onClick={() => setNova(true)}>
                <ArrowLeftRight /> Nova movimentação
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => filtrar(() => setBusca(e.target.value))} placeholder="Produto, SKU, lote, documento, motivo ou nº" className="pl-9" aria-label="Pesquisar" />
          </div>
          <NativeSelect value={tipo} onChange={(e) => filtrar(() => setTipo(e.target.value))} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {LISTA_TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPOS_MOVIMENTACAO[t].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={deposito} onChange={(e) => filtrar(() => setDeposito(e.target.value))} aria-label="Depósito">
            <option value="">Todos os depósitos</option>
            {depositos.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" value={de} max={ate} onChange={(e) => filtrar(() => setDe(e.target.value))} aria-label="De" />
          <Input type="date" value={ate} min={de} onChange={(e) => filtrar(() => setAte(e.target.value))} aria-label="Até" />
        </div>

        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.linhas.length ? (
          <Vazio titulo="Nenhuma movimentação no período" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº / Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto / Lote</TableHead>
                  <TableHead>Origem → Destino</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Motivo / Documento</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">
                      <p className="tabular-nums font-medium">#{m.numero}</p>
                      <p className="text-xs text-muted-foreground">{formatarData(m.created_at, true)}</p>
                    </TableCell>
                    <TableCell>{badgeTipo(m)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{m.produto_descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.sku}
                        {m.lote_codigo && ` · Lote ${m.lote_codigo}`}
                        {m.tonalidade && ` · Ton. ${m.tonalidade}`}
                        {m.calibre && ` · Cal. ${m.calibre}`}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex flex-wrap items-center gap-1">
                        {local(m.deposito_origem_nome, m.localizacao_origem_codigo) ?? <span className="text-muted-foreground">—</span>}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        {local(m.deposito_destino_nome, m.localizacao_destino_codigo) ?? <span className="text-muted-foreground">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Qtd valor={m.quantidade} unidade={m.unidade} m2PorCaixa={m.m2_por_caixa} />
                    </TableCell>
                    <TableCell className="max-w-[220px] text-sm">
                      <p className="truncate">{m.motivo ?? '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {DOCUMENTO[m.documento_tipo] ?? m.documento_tipo}
                        {m.documento_id && m.documento_tipo === 'manual' && ` · ${m.documento_id}`}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{m.created_by_nome ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
          </>
        )}
      </Card>

      <MovimentacaoDialog aberto={nova} onFechar={() => setNova(false)} />
    </>
  )
}
