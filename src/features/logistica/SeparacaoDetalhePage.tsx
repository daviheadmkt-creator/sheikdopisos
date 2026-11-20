import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CheckCheck, ListChecks, Loader2, MapPin, PackageCheck, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Logo } from '@/components/common/Logo'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { Qtd, QuantidadeInput } from '@/features/estoque/componentes'
import { paraCanonico } from '@/lib/decimal'
import { formatarData } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { concluirSeparacao, obterEntrega } from './api'
import { JANELAS, ordenarParaSeparacao, resumoSeparacao, STATUS_ENTREGA } from './regras'

interface Conferencia {
  separada: string
  conferido: boolean
  divergencia: string
}

export function SeparacaoDetalhePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode } = useAuth()
  const q = useQuery({ queryKey: ['logistica', 'entrega', id], queryFn: () => obterEntrega(id!) })
  const [conf, setConf] = useState<Record<string, Conferencia>>({})
  const [confirmar, setConfirmar] = useState(false)

  const itens = useMemo(() => ordenarParaSeparacao(q.data?.itens ?? []), [q.data])
  useEffect(() => {
    if (q.data) setConf(Object.fromEntries(q.data.itens.map((i) => [i.id, { separada: '', conferido: false, divergencia: '' }])))
  }, [q.data])

  const resumo = resumoSeparacao(itens.map((i) => ({ quantidade: paraCanonico(i.quantidade, 4), separada: conf[i.id]?.separada ?? '' })))
  const atualizar = (itemId: string, p: Partial<Conferencia>) => setConf((c) => ({ ...c, [itemId]: { ...c[itemId], ...p } }))

  const concluir = useMutation({
    mutationFn: () => concluirSeparacao(id!, itens.map((i) => ({ item_id: i.id, quantidade_separada: conf[i.id]?.separada || '0', conferido: conf[i.id]?.conferido ?? false, divergencia: conf[i.id]?.divergencia ?? '' }))),
    onSuccess: (saldo) => {
      toast.success(saldo ? 'Separação concluída. O saldo não separado gerou uma nova entrega.' : 'Separação concluída. Estoque baixado e reserva consumida.')
      qc.invalidateQueries({ queryKey: ['logistica'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      qc.invalidateQueries({ queryKey: ['vendas'] })
      navigate(`/entregas/${id}`, { replace: true })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroCarregamento mensagem={mensagemErro(q.error)} />
  const e = q.data!.entrega
  const editavel = e.status === 'aguardando_separacao' && (pode('separacao', 'editar') || pode('separacao', 'criar'))

  return (
    <div>
      <div className="no-print mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild><Link to="/separacao" aria-label="Voltar"><ArrowLeft /></Link></Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              Separação — entrega #{e.numero} <Badge variant={STATUS_ENTREGA[e.status].variant}>{STATUS_ENTREGA[e.status].label}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Venda #{e.venda_numero} · {e.cliente_nome} · {e.tipo === 'retirada' ? 'Retirada na loja' : `${e.bairro}, ${e.cidade}/${e.uf}`}
              {e.data_agendada && ` · ${formatarData(`${e.data_agendada}T12:00:00`)}${e.janela ? ` (${JANELAS[e.janela]})` : ''}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir lista</Button>
          {editavel && (
            <>
              <Button variant="outline" onClick={() => setConf(Object.fromEntries(itens.map((i) => [i.id, { ...conf[i.id], separada: paraCanonico(i.quantidade, 4), conferido: true }])))}>
                <ListChecks /> Separar tudo
              </Button>
              <Button onClick={() => setConfirmar(true)} disabled={resumo.nenhum}><PackageCheck /> Concluir separação</Button>
            </>
          )}
        </div>
      </div>

      {/* Cabeçalho impresso */}
      <div className="mb-4 hidden items-center justify-between border-b-2 border-black pb-2 print:flex">
        <div className="flex items-center gap-3"><Logo className="h-12 w-12" compacto /><strong>LISTA DE SEPARAÇÃO — Entrega #{e.numero}</strong></div>
        <span>Venda #{e.venda_numero} · {e.cliente_nome} · {formatarData(new Date().toISOString(), true)}</span>
      </div>

      <div className="space-y-3">
        {itens.map((i, n) => {
          const c = conf[i.id] ?? { separada: '', conferido: false, divergencia: '' }
          const parcial = c.separada && Number(c.separada) < Number(i.quantidade)
          return (
            <Card key={i.id} className={cn('documento break-inside-avoid', c.conferido && 'border-success/50 bg-success/5')}>
              <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar text-sm font-semibold text-primary">{n + 1}</span>
                  <div>
                    <p className="font-medium">{i.produto_descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">{i.sku}</p>
                    {i.lote_codigo && (
                      <p className="mt-1 text-sm">
                        Lote <strong>{i.lote_codigo}</strong>{i.tonalidade && <> · Ton. <strong>{i.tonalidade}</strong></>}{i.calibre && <> · Cal. <strong>{i.calibre}</strong></>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <p className="flex items-center gap-1 font-medium"><MapPin className="h-4 w-4 text-primary" /> {i.deposito_nome ?? '—'}{i.localizacao_codigo && ` · ${i.localizacao_codigo}`}</p>
                  <p className="mt-1 text-muted-foreground">A separar: <Qtd valor={i.quantidade} unidade={i.unidade} m2PorCaixa={i.eh_revestimento ? i.m2_por_caixa : null} className="inline font-semibold text-foreground" /></p>
                </div>
                <div className="no-print space-y-2">
                  <QuantidadeInput valor={c.separada} onChange={(v) => atualizar(i.id, { separada: v })} unidade={i.unidade} m2PorCaixa={i.eh_revestimento ? i.m2_por_caixa : null} />
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={c.conferido} disabled={!editavel} onCheckedChange={(v) => atualizar(i.id, { conferido: v === true, separada: v === true && !c.separada ? paraCanonico(i.quantidade, 4) : c.separada })} />
                      Lote e quantidade conferidos
                    </label>
                  </div>
                  {(parcial || c.divergencia) && (
                    <Input value={c.divergencia} onChange={(ev) => atualizar(i.id, { divergencia: ev.target.value })} placeholder="Motivo da diferença (ex.: caixa avariada)" className="h-9" disabled={!editavel} />
                  )}
                </div>
                <div className="hidden print:block">Separado: ________ ☐ conferido</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir separação</DialogTitle>
            <DialogDescription>A quantidade separada será baixada do estoque agora, consumindo a reserva da venda.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2"><CheckCheck className="h-4 w-4 text-success" /> {resumo.completos} item(ns) separados por completo</li>
            {resumo.parciais > 0 && <li className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> {resumo.parciais} item(ns) separados parcialmente</li>}
            {resumo.zerados > 0 && <li className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> {resumo.zerados} item(ns) não separados</li>}
          </ul>
          {resumo.geraSaldo && <p className="rounded-lg bg-primary/10 p-3 text-sm text-[#7a5c0f]">O que não foi separado irá para uma nova entrega, aguardando separação (entrega parcial).</p>}
          {itens.some((i) => !conf[i.id]?.conferido && conf[i.id]?.separada) && <p className="text-sm text-destructive">Há itens separados sem a marcação de conferência.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>Voltar</Button>
            <Button onClick={() => concluir.mutate()} disabled={concluir.isPending}>{concluir.isPending && <Loader2 className="animate-spin" />} Concluir e baixar estoque</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
