import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatarData } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { liberarReserva, listarReservas, type Reserva } from './api'
import { Qtd } from './componentes'

export function ReservasTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [status, setStatus] = useState('ativa')
  const [busca, setBusca] = useState('')
  const [liberando, setLiberando] = useState<Reserva | null>(null)
  const b = useDebounce(busca)

  const q = useQuery({ queryKey: ['estoque', 'reservas', status, b], queryFn: () => listarReservas(status, b) })

  const liberar = useMutation({
    mutationFn: (motivo: string) => liberarReserva(liberando!.id, motivo),
    onSuccess: () => {
      toast.success('Reserva liberada. A quantidade voltou a ficar disponível.')
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setLiberando(null)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <Card>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Produto, SKU, referência ou cliente" className="pl-9" aria-label="Pesquisar reservas" />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ativa">Ativas</option>
          <option value="consumida">Consumidas</option>
          <option value="liberada">Liberadas</option>
          <option value="">Todas</option>
        </NativeSelect>
      </div>
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <ErroCarregamento mensagem={mensagemErro(q.error)} />
      ) : !q.data?.length ? (
        <Vazio titulo="Nenhuma reserva" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Lote / Local</TableHead>
              <TableHead className="text-right">Restante</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums text-muted-foreground">{r.numero}</TableCell>
                <TableCell>
                  <p className="font-medium">{r.produto_descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatarData(r.created_at, true)} · {r.created_by_nome ?? '—'}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.lote_codigo ? `Lote ${r.lote_codigo}` : 'Sem lote'}
                  {r.tonalidade && <span className="text-muted-foreground"> / {r.tonalidade}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {r.deposito_nome}
                    {r.localizacao_codigo && ` · ${r.localizacao_codigo}`}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Qtd valor={r.quantidade_restante} unidade={r.unidade} m2PorCaixa={r.m2_por_caixa} />
                </TableCell>
                <TableCell className="max-w-[180px] truncate">{r.cliente_nome ?? r.documento_id ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{r.validade ? formatarData(r.validade) : '—'}</TableCell>
                <TableCell>
                  {r.status === 'ativa' ? (
                    r.vencida ? <Badge variant="danger">Vencida</Badge> : <Badge variant="info">Ativa</Badge>
                  ) : r.status === 'consumida' ? (
                    <Badge variant="success">Consumida</Badge>
                  ) : (
                    <Badge variant="neutral" title={r.motivo_encerramento ?? ''}>
                      Liberada
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {r.status === 'ativa' && pode('estoque', 'editar') && (
                    <Button variant="ghost" size="sm" onClick={() => setLiberando(r)}>
                      <Unlock /> Liberar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MotivoDialog
        aberto={!!liberando}
        titulo={`Liberar reserva nº ${liberando?.numero ?? ''}`}
        descricao="A quantidade restante volta para o disponível. A operação fica registrada."
        rotuloConfirmar="Liberar reserva"
        carregando={liberar.isPending}
        onConfirmar={(m) => liberar.mutate(m)}
        onFechar={() => setLiberando(null)}
      />
    </Card>
  )
}
