import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
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
import { listarOrcamentos } from '@/features/comercial/api'
import { STATUS_ORCAMENTO, type StatusOrcamento } from '@/features/comercial/tipos'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'

const POR_PAGINA = 20

export function OrcamentosPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [de, setDe] = useState(dataLocalISO(new Date(), -90))
  const [ate, setAte] = useState(dataLocalISO())
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)

  const filtros = { busca: b, status, de, ate, pagina, porPagina: POR_PAGINA }
  const q = useQuery({ queryKey: ['orcamentos', 'lista', filtros], queryFn: () => listarOrcamentos(filtros), placeholderData: keepPreviousData })
  const vendedores = useQuery({ queryKey: ['vendedores'], queryFn: listarVendedores, staleTime: 5 * 60_000 })
  const nomeVendedor = useMemo(() => new Map((vendedores.data ?? []).map((v) => [v.id, v.nome])), [vendedores.data])
  const hoje = dataLocalISO()
  const f = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Orçamentos"
        descricao="Propostas com cálculo de caixas por metragem, aprovação e conversão em venda."
        acoes={
          pode('orcamentos', 'criar') && (
            <Button asChild>
              <Link to="/orcamentos/novo">
                <Plus /> Novo orçamento
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_200px_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => f(() => setBusca(e.target.value))} placeholder="Nº do orçamento ou nome do cliente" className="pl-9" aria-label="Pesquisar" />
          </div>
          <NativeSelect value={status} onChange={(e) => f(() => setStatus(e.target.value))} aria-label="Status">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_ORCAMENTO) as StatusOrcamento[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_ORCAMENTO[s].label}
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
          <Vazio
            titulo="Nenhum orçamento no período"
            acao={
              pode('orcamentos', 'criar') && (
                <Button asChild>
                  <Link to="/orcamentos/novo">
                    <Plus /> Criar orçamento
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((o) => {
                  const vencido = ['rascunho', 'enviado'].includes(o.status) && o.validade < hoje
                  return (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/orcamentos/${o.id}`)}>
                      <TableCell className="tabular-nums font-medium">#{o.numero}</TableCell>
                      <TableCell>
                        {o.cliente?.nome ?? o.cliente_nome}
                        {!o.cliente_id && <span className="ml-2 text-xs text-muted-foreground">(não cadastrado)</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{o.vendedor_id ? nomeVendedor.get(o.vendedor_id) ?? '—' : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatarData(o.created_at)}</TableCell>
                      <TableCell className={vencido ? 'whitespace-nowrap text-destructive' : 'whitespace-nowrap'}>
                        {formatarData(`${o.validade}T12:00:00`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(o.total)}</TableCell>
                      <TableCell>
                        {vencido ? <Badge variant="danger">Vencido</Badge> : <Badge variant={STATUS_ORCAMENTO[o.status].variant}>{STATUS_ORCAMENTO[o.status].label}</Badge>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
          </>
        )}
      </Card>
    </>
  )
}
