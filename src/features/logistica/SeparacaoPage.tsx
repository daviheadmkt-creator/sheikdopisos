import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, PackageCheck, Search, Store, Truck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { dataLocalISO, formatarData } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { listarEntregas } from './api'
import { JANELAS } from './regras'

export function SeparacaoPage() {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const b = useDebounce(busca)
  const q = useQuery({
    queryKey: ['logistica', 'separacao', b, tipo],
    queryFn: () => listarEntregas({ status: ['aguardando_separacao'], busca: b, tipo }),
  })
  const hoje = dataLocalISO()

  return (
    <>
      <PageHeader titulo="Separação de Pedidos" descricao="Pedidos confirmados aguardando separação. A baixa do estoque acontece ao concluir a separação, consumindo a reserva da venda." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, bairro, nº da entrega ou da venda" className="pl-9" aria-label="Pesquisar" />
        </div>
        <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Entregas e retiradas</option>
          <option value="entrega">Somente entregas</option>
          <option value="retirada">Somente retiradas</option>
        </NativeSelect>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.linhas.length ? (
        <Card><Vazio titulo="Nenhum pedido aguardando separação" descricao="Vendas confirmadas aparecem aqui automaticamente." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.linhas.map((e) => {
            const urgente = e.data_agendada && e.data_agendada <= hoje
            return (
              <Card key={e.id} className={cn('cursor-pointer transition-shadow hover:shadow-md', urgente && 'border-destructive/40')} onClick={() => navigate(`/separacao/${e.id}`)}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Entrega #{e.numero} · Venda #{e.venda_numero}</p>
                      <p className="font-semibold">{e.cliente_nome}</p>
                    </div>
                    {e.tipo === 'retirada' ? (
                      <Badge variant="dark" className="gap-1"><Store className="h-3 w-3" /> Retirada</Badge>
                    ) : (
                      <Badge variant="info" className="gap-1"><Truck className="h-3 w-3" /> Entrega</Badge>
                    )}
                  </div>
                  {e.tipo === 'entrega' && <p className="text-sm text-muted-foreground">{e.bairro} · {e.cidade}/{e.uf}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-md bg-secondary px-2 py-0.5">{e.qtd_itens} item(ns)</span>
                    {Number(e.peso_estimado_kg) > 0 && <span className="rounded-md bg-secondary px-2 py-0.5">≈ {Math.round(Number(e.peso_estimado_kg))} kg</span>}
                    {e.data_agendada ? (
                      <span className={cn('flex items-center gap-1', urgente && 'font-medium text-destructive')}>
                        <CalendarClock className="h-4 w-4" /> {formatarData(`${e.data_agendada}T12:00:00`)}{e.janela && ` · ${JANELAS[e.janela]}`}
                      </span>
                    ) : <span className="text-muted-foreground">Sem data agendada</span>}
                    {e.entrega_origem_id && <Badge variant="default">Saldo</Badge>}
                  </div>
                  <Button className="w-full" variant="dark"><PackageCheck /> Separar</Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
