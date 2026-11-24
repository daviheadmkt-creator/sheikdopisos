import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
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
import { formatarData, formatarMoeda } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { listarPedidosLoja, reprocessarPedidoLoja, SITUACAO_LOJA, STATUS_WOO, type SituacaoLoja } from './api'

const POR_PAGINA = 20

export function LojaPedidosPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('')
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)

  const filtros = { busca: b, situacao, pagina, porPagina: POR_PAGINA }
  const q = useQuery({ queryKey: ['loja-pedidos', filtros], queryFn: () => listarPedidosLoja(filtros), placeholderData: keepPreviousData })

  const reprocessar = useMutation({
    mutationFn: reprocessarPedidoLoja,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['loja-pedidos'] })
      qc.invalidateQueries({ queryKey: ['vendas'] })
      if (r.situacao === 'integrado') toast.success(`Pedido integrado: venda #${r.venda_numero} criada como rascunho.`)
      else toast.warning(r.mensagem ?? SITUACAO_LOJA[r.situacao].label)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const f = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Pedidos da Loja Virtual"
        descricao="Pedidos feitos no site chegam aqui automaticamente. Os pagos viram vendas em rascunho: abra a venda, escolha o lote e confirme."
      />
      <Card>
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => f(() => setBusca(e.target.value))} placeholder="Nº do pedido ou cliente" className="pl-9" aria-label="Pesquisar" />
          </div>
          <NativeSelect value={situacao} onChange={(e) => f(() => setSituacao(e.target.value))} aria-label="Situação">
            <option value="">Todas as situações</option>
            {(Object.keys(SITUACAO_LOJA) as SituacaoLoja[]).map((s) => (
              <option key={s} value={s}>
                {SITUACAO_LOJA[s].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.linhas.length ? (
          <Vazio titulo="Nenhum pedido da loja" descricao="Quando o plugin Sheik ERP Conector estiver ativo no site, os pedidos aparecem aqui." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status na loja</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação no ERP</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((p) => (
                  <TableRow
                    key={p.id}
                    className={p.venda_id ? 'cursor-pointer' : undefined}
                    onClick={() => p.venda_id && navigate(`/vendas/${p.venda_id}`)}
                  >
                    <TableCell className="tabular-nums font-medium">#{p.numero_loja}</TableCell>
                    <TableCell>{p.cliente_nome ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(p.recebido_em, true)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{p.forma_pagamento ?? '—'}</div>
                      {p.pago_em && <div className="text-xs text-success">pago em {formatarData(p.pago_em)}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{STATUS_WOO[p.status_loja] ?? p.status_loja}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(p.total_loja)}</TableCell>
                    <TableCell className="max-w-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={SITUACAO_LOJA[p.situacao].variant}>{SITUACAO_LOJA[p.situacao].label}</Badge>
                        {p.venda && <span className="text-sm font-medium">Venda #{p.venda.numero}</span>}
                      </div>
                      {p.mensagem && <p className="mt-1 text-xs text-muted-foreground">{p.mensagem}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!p.venda_id && (p.situacao === 'pendente' || p.situacao === 'atencao') && pode('vendas', 'criar') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reprocessar.isPending}
                          onClick={(e) => {
                            e.stopPropagation()
                            reprocessar.mutate(p.id)
                          }}
                        >
                          <RefreshCw /> Reprocessar
                        </Button>
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
    </>
  )
}
