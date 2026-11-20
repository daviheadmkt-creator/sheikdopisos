import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarVendas } from '@/features/comercial/api'
import { STATUS_VENDA } from '@/features/comercial/tipos'
import { formatarData, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'

export function HistoricoCompras({ clienteId }: { clienteId: string }) {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['vendas', 'cliente', clienteId],
    queryFn: () => listarVendas({ busca: '', status: '', de: '', ate: '', pagina: 1, porPagina: 50, clienteId }),
    enabled: pode('vendas'),
  })

  if (!pode('vendas')) return <Vazio titulo="Seu perfil não tem acesso ao módulo de vendas." />
  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroCarregamento mensagem={mensagemErro(q.error)} />
  if (!q.data?.linhas.length) return <Vazio titulo="Nenhuma compra registrada" />

  const confirmadas = q.data.linhas.filter((v) => v.status === 'confirmada' || v.status === 'concluida')
  const total = confirmadas.reduce((s, v) => s + Number(v.total), 0)

  return (
    <>
      <div className="grid gap-3 border-b p-4 text-sm sm:grid-cols-3">
        <p>
          <span className="block text-xs text-muted-foreground">Compras</span>
          <strong className="text-lg">{confirmadas.length}</strong>
        </p>
        <p>
          <span className="block text-xs text-muted-foreground">Total comprado</span>
          <strong className="text-lg">{formatarMoeda(total)}</strong>
        </p>
        <p>
          <span className="block text-xs text-muted-foreground">Ticket médio</span>
          <strong className="text-lg">{confirmadas.length ? formatarMoeda(total / confirmadas.length) : '—'}</strong>
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.linhas.map((v) => (
            <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/vendas/${v.id}`)}>
              <TableCell className="font-medium">#{v.numero}</TableCell>
              <TableCell>{formatarData(v.confirmada_em ?? v.created_at)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(v.total)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VENDA[v.status].variant}>{STATUS_VENDA[v.status].label}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
