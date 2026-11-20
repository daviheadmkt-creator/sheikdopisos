import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search, Store, Truck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarVendedores } from '@/features/clientes/api'
import { listarVendas } from '@/features/comercial/api'
import { STATUS_VENDA, type StatusVenda } from '@/features/comercial/tipos'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'

const POR_PAGINA = 20

export function VendasPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [de, setDe] = useState(dataLocalISO(new Date(), -30))
  const [ate, setAte] = useState(dataLocalISO())
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)

  const filtros = { busca: b, status, de, ate, pagina, porPagina: POR_PAGINA }
  const q = useQuery({ queryKey: ['vendas', 'lista', filtros], queryFn: () => listarVendas(filtros), placeholderData: keepPreviousData })
  const vendedores = useQuery({ queryKey: ['vendedores'], queryFn: listarVendedores, staleTime: 5 * 60_000 })
  const nomeVendedor = useMemo(() => new Map((vendedores.data ?? []).map((v) => [v.id, v.nome])), [vendedores.data])
  const f = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Vendas"
        descricao="Pedidos de venda com reserva de estoque por lote e pagamentos à vista, parcelados ou mistos."
        acoes={
          pode('vendas', 'criar') && (
            <Button asChild>
              <Link to="/vendas/nova">
                <Plus /> Nova venda
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_200px_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => f(() => setBusca(e.target.value))} placeholder="Nº da venda" className="pl-9" aria-label="Pesquisar" />
          </div>
          <NativeSelect value={status} onChange={(e) => f(() => setStatus(e.target.value))} aria-label="Status">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_VENDA) as StatusVenda[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_VENDA[s].label}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" value={de} max={ate} onChange={(e) => f(() => setDe(e.target.value))} aria-label="De" />
          <Input type="date" value={ate} min={de} onChange={(e) => f(() => setAte(e.target.value))} aria-label="Até" />
        </div>
        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.linhas.length ? (
          <Vazio titulo="Nenhuma venda no período" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/vendas/${v.id}`)}>
                    <TableCell className="tabular-nums font-medium">#{v.numero}</TableCell>
                    <TableCell>{v.cliente?.nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.vendedor_id ? nomeVendedor.get(v.vendedor_id) ?? '—' : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(v.confirmada_em ?? v.created_at)}</TableCell>
                    <TableCell>
                      {v.tipo_entrega === 'entrega' ? (
                        <span className="flex items-center gap-1 text-sm"><Truck className="h-4 w-4 text-info" /> Entrega</span>
                      ) : (
                        <span className="flex items-center gap-1 text-sm"><Store className="h-4 w-4 text-primary" /> Retirada</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(v.total)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VENDA[v.status].variant}>{STATUS_VENDA[v.status].label}</Badge>
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
