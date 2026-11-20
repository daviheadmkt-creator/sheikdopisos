import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, ListOrdered, Loader2, Plus, Printer, Search, Settings2, Store, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { addDays } from '@/features/compras/datas'
import { dataLocalISO, formatarData, formatarTelefone, mascararTelefone } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { somenteDigitos } from '@/lib/validators/documento'
import {
  alterarAtivoLogistica,
  criarCadastroLogistica,
  iniciarRota,
  listarEntregas,
  listarMotoristas,
  listarTransportadoras,
  listarVeiculos,
  type Entrega,
} from './api'
import { JANELAS, normalizarPlaca, STATUS_ENTREGA, validarPlaca, type StatusEntrega } from './regras'

const diaSemana = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

export function EntregasPage() {
  const [params] = useSearchParams()
  const venda = params.get('venda') ?? ''
  return (
    <>
      <PageHeader titulo="Entregas" descricao="Agenda, rotas, motoristas, veículos, transportadoras, comprovantes, entregas parciais e devoluções." />
      <Tabs defaultValue={venda ? 'todas' : 'agenda'}>
        <TabsList>
          <TabsTrigger value="agenda"><CalendarDays /> Agenda</TabsTrigger>
          <TabsTrigger value="todas"><ListOrdered /> Todas</TabsTrigger>
          <TabsTrigger value="cadastros"><Settings2 /> Motoristas e veículos</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda"><AgendaTab /></TabsContent>
        <TabsContent value="todas"><TodasTab vendaId={venda} /></TabsContent>
        <TabsContent value="cadastros"><CadastrosTab /></TabsContent>
      </Tabs>
    </>
  )
}

function CardEntrega({ e, selecionavel, selecionado, onSelecionar }: { e: Entrega; selecionavel?: boolean; selecionado?: boolean; onSelecionar?: (v: boolean) => void }) {
  const navigate = useNavigate()
  return (
    <div className={cn('flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md', selecionado && 'border-primary')} onClick={() => navigate(`/entregas/${e.id}`)}>
      {selecionavel && <Checkbox checked={selecionado} onClick={(ev) => ev.stopPropagation()} onCheckedChange={(v) => onSelecionar?.(v === true)} className="mt-1" aria-label="Selecionar para rota" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{e.cliente_nome}</p>
          <Badge variant={STATUS_ENTREGA[e.status].variant}>{STATUS_ENTREGA[e.status].label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          #{e.numero} · Venda #{e.venda_numero} · {e.logradouro}, {e.numero_endereco} — {e.bairro}, {e.cidade}/{e.uf}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {e.janela ? JANELAS[e.janela] : 'Sem janela'} · {e.motorista_nome ?? e.transportadora_nome ?? 'sem motorista'}{e.veiculo_placa && ` · ${e.veiculo_placa}`}
          {Number(e.peso_estimado_kg) > 0 && ` · ≈ ${Math.round(Number(e.peso_estimado_kg))} kg`} · {formatarTelefone(e.cliente_whatsapp || e.cliente_telefone)}
        </p>
      </div>
    </div>
  )
}

function AgendaTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [data, setData] = useState(dataLocalISO())
  const [sel, setSel] = useState<Set<string>>(new Set())
  const q = useQuery({ queryKey: ['logistica', 'agenda', data], queryFn: () => listarEntregas({ data, tipo: 'entrega' }) })
  const pendentes = useQuery({ queryKey: ['logistica', 'sem-data'], queryFn: () => listarEntregas({ status: ['aguardando_separacao', 'separado'], tipo: 'entrega' }) })
  const semData = (pendentes.data?.linhas ?? []).filter((e) => !e.data_agendada)
  const prontas = (q.data?.linhas ?? []).filter((e) => e.status === 'agendado')

  const rota = useMutation({
    mutationFn: () => iniciarRota([...sel]),
    onSuccess: (n) => { toast.success(`${n} entrega(s) saíram para rota.`); setSel(new Set()); qc.invalidateQueries({ queryKey: ['logistica'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const porJanela = useMemo(() => {
    const g = new Map<string, Entrega[]>()
    for (const e of q.data?.linhas ?? []) {
      const k = e.janela ?? 'sem'
      g.set(k, [...(g.get(k) ?? []), e])
    }
    return [...g]
  }, [q.data])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setData(addDays(data, -1))} aria-label="Dia anterior"><ChevronLeft /></Button>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-44" />
          <Button variant="outline" size="icon" onClick={() => setData(addDays(data, 1))} aria-label="Próximo dia"><ChevronRight /></Button>
          <Button variant="ghost" onClick={() => setData(dataLocalISO())}>Hoje</Button>
          <span className="text-sm capitalize text-muted-foreground">{diaSemana(data)}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" asChild><Link to={`/entregas/romaneio?data=${data}`}><Printer /> Romaneio do dia</Link></Button>
            {pode('entregas', 'editar') && (
              <Button onClick={() => rota.mutate()} disabled={!sel.size || rota.isPending}>
                {rota.isPending ? <Loader2 className="animate-spin" /> : <Truck />} Saiu para entrega ({sel.size})
              </Button>
            )}
          </div>
        </div>
        {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.linhas.length ? (
          <Card><Vazio titulo="Nenhuma entrega agendada para este dia" /></Card>
        ) : (
          porJanela.map(([janela, lista]) => (
            <div key={janela}>
              <p className="mb-2 text-sm font-semibold">{janela === 'sem' ? 'Sem janela definida' : JANELAS[janela]} <span className="font-normal text-muted-foreground">({lista.length})</span></p>
              <div className="space-y-2">
                {lista.map((e) => (
                  <CardEntrega
                    key={e.id}
                    e={e}
                    selecionavel={e.status === 'agendado' && pode('entregas', 'editar')}
                    selecionado={sel.has(e.id)}
                    onSelecionar={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(e.id); else n.delete(e.id); return n })}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        {prontas.length > 0 && !sel.size && <p className="text-xs text-muted-foreground">Marque as entregas agendadas que estão saindo para registrar a saída em rota.</p>}
      </div>
      <Card className="h-fit">
        <CardHeader><CardTitle>Sem data agendada</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pendentes.isLoading ? <Carregando /> : !semData.length ? <p className="text-sm text-muted-foreground">Todas as entregas estão agendadas.</p> : semData.map((e) => (
            <Link key={e.id} to={`/entregas/${e.id}`} className="block rounded-lg border p-3 text-sm hover:bg-accent">
              <span className="flex items-center justify-between gap-2"><strong>{e.cliente_nome}</strong><Badge variant={STATUS_ENTREGA[e.status].variant}>{STATUS_ENTREGA[e.status].label}</Badge></span>
              <span className="text-xs text-muted-foreground">#{e.numero} · {e.bairro}, {e.cidade}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function TodasTab({ vendaId }: { vendaId: string }) {
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [tipo, setTipo] = useState('')
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)
  const f = { busca: b, status: status ? [status as StatusEntrega] : undefined, tipo, vendaId, pagina, porPagina: 25 }
  const q = useQuery({ queryKey: ['logistica', 'entregas', f], queryFn: () => listarEntregas(f), placeholderData: keepPreviousData })
  return (
    <Card>
      <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1) }} placeholder="Cliente, bairro, cidade, nº da entrega ou da venda" className="pl-9" aria-label="Pesquisar" />
        </div>
        <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1) }} aria-label="Status">
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_ENTREGA) as StatusEntrega[]).map((s) => <option key={s} value={s}>{STATUS_ENTREGA[s].label}</option>)}
        </NativeSelect>
        <NativeSelect value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1) }} aria-label="Tipo">
          <option value="">Entregas e retiradas</option>
          <option value="entrega">Entregas</option>
          <option value="retirada">Retiradas</option>
        </NativeSelect>
      </div>
      {vendaId && <p className="border-b bg-accent px-4 py-2 text-sm">Filtrando entregas de uma venda. <Link to="/entregas" className="text-info hover:underline">Limpar</Link></p>}
      {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !q.data?.linhas.length ? <Vazio titulo="Nenhuma entrega" /> : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente / destino</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Motorista / transportadora</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.linhas.map((e) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(`/entregas/${e.id}`)}>
                  <TableCell className="font-medium">#{e.numero}<span className="block text-xs text-muted-foreground">Venda #{e.venda_numero}</span></TableCell>
                  <TableCell>{e.cliente_nome}<span className="block text-xs text-muted-foreground">{e.tipo === 'entrega' ? `${e.bairro}, ${e.cidade}/${e.uf}` : 'Retirada na loja'}</span></TableCell>
                  <TableCell>{e.tipo === 'entrega' ? <Truck className="h-4 w-4 text-info" /> : <Store className="h-4 w-4 text-primary" />}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.entregue_em ? formatarData(e.entregue_em) : e.data_agendada ? formatarData(`${e.data_agendada}T12:00:00`) : '—'}</TableCell>
                  <TableCell>{e.motorista_nome ?? e.transportadora_nome ?? '—'}</TableCell>
                  <TableCell><Badge variant={STATUS_ENTREGA[e.status].variant}>{STATUS_ENTREGA[e.status].label}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination pagina={pagina} porPagina={25} total={q.data.total} onChange={setPagina} />
        </>
      )}
    </Card>
  )
}

function CadastrosTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const veiculos = useQuery({ queryKey: ['logistica', 'veiculos'], queryFn: listarVeiculos })
  const motoristas = useQuery({ queryKey: ['logistica', 'motoristas'], queryFn: listarMotoristas })
  const transp = useQuery({ queryKey: ['logistica', 'transportadoras'], queryFn: listarTransportadoras })
  const [v, setV] = useState({ placa: '', descricao: '', capacidade: '' })
  const [m, setM] = useState({ nome: '', telefone: '', cnh: '' })
  const [t, setT] = useState({ nome: '', telefone: '' })
  const inv = () => qc.invalidateQueries({ queryKey: ['logistica'] })
  const criar = useMutation({
    mutationFn: (a: { tabela: 'veiculos' | 'motoristas' | 'transportadoras'; dados: Record<string, unknown> }) => criarCadastroLogistica(a.tabela, a.dados),
    onSuccess: (_d, a) => {
      toast.success('Cadastro incluído.')
      if (a.tabela === 'veiculos') setV({ placa: '', descricao: '', capacidade: '' })
      if (a.tabela === 'motoristas') setM({ nome: '', telefone: '', cnh: '' })
      if (a.tabela === 'transportadoras') setT({ nome: '', telefone: '' })
      inv()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const ativo = useMutation({
    mutationFn: (a: { tabela: 'veiculos' | 'motoristas' | 'transportadoras'; id: string; ativo: boolean }) => alterarAtivoLogistica(a.tabela, a.id, a.ativo),
    onSuccess: inv,
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const podeCriar = pode('entregas', 'criar')
  const podeEditar = pode('entregas', 'editar')

  const lista = (tabela: 'veiculos' | 'motoristas' | 'transportadoras', itens: { id: string; ativo: boolean; titulo: string; sub: string }[]) => (
    <ul className="divide-y rounded-lg border">
      {!itens.length && <li className="p-4 text-center text-sm text-muted-foreground">Nenhum cadastro.</li>}
      {itens.map((x) => (
        <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
          <span className={cn(!x.ativo && 'text-muted-foreground line-through')}>{x.titulo}<span className="block text-xs text-muted-foreground">{x.sub}</span></span>
          <Switch checked={x.ativo} disabled={!podeEditar} onCheckedChange={(a) => ativo.mutate({ tabela, id: x.id, ativo: a })} aria-label="Ativo" />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Veículos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {podeCriar && (
            <div className="grid gap-2">
              <Input placeholder="Placa (ABC1D23)" value={v.placa} onChange={(e) => setV({ ...v, placa: normalizarPlaca(e.target.value) })} />
              <Input placeholder="Descrição (ex.: Caminhão 3/4)" value={v.descricao} onChange={(e) => setV({ ...v, descricao: e.target.value })} />
              <Input placeholder="Capacidade (kg)" inputMode="numeric" value={v.capacidade} onChange={(e) => setV({ ...v, capacidade: e.target.value.replace(/\D/g, '') })} />
              <Button variant="outline" disabled={!validarPlaca(v.placa) || v.descricao.trim().length < 2} onClick={() => criar.mutate({ tabela: 'veiculos', dados: { placa: v.placa, descricao: v.descricao.trim(), capacidade_kg: v.capacidade || null } })}><Plus /> Incluir veículo</Button>
            </div>
          )}
          {lista('veiculos', (veiculos.data ?? []).map((x) => ({ id: x.id, ativo: x.ativo, titulo: x.placa, sub: `${x.descricao}${x.capacidade_kg ? ` · ${x.capacidade_kg} kg` : ''}` })))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Motoristas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {podeCriar && (
            <div className="grid gap-2">
              <Input placeholder="Nome" value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} />
              <Input placeholder="Telefone" inputMode="tel" value={m.telefone} onChange={(e) => setM({ ...m, telefone: mascararTelefone(e.target.value) })} />
              <Input placeholder="CNH (opcional)" value={m.cnh} onChange={(e) => setM({ ...m, cnh: e.target.value })} />
              <Button variant="outline" disabled={m.nome.trim().length < 2} onClick={() => criar.mutate({ tabela: 'motoristas', dados: { nome: m.nome.trim(), telefone: somenteDigitos(m.telefone) || null, cnh: m.cnh.trim() || null } })}><Plus /> Incluir motorista</Button>
            </div>
          )}
          {lista('motoristas', (motoristas.data ?? []).map((x) => ({ id: x.id, ativo: x.ativo, titulo: x.nome, sub: formatarTelefone(x.telefone) })))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Transportadoras</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {podeCriar && (
            <div className="grid gap-2">
              <Input placeholder="Nome" value={t.nome} onChange={(e) => setT({ ...t, nome: e.target.value })} />
              <Input placeholder="Telefone" inputMode="tel" value={t.telefone} onChange={(e) => setT({ ...t, telefone: mascararTelefone(e.target.value) })} />
              <Button variant="outline" disabled={t.nome.trim().length < 2} onClick={() => criar.mutate({ tabela: 'transportadoras', dados: { nome: t.nome.trim(), telefone: somenteDigitos(t.telefone) || null } })}><Plus /> Incluir transportadora</Button>
            </div>
          )}
          {lista('transportadoras', (transp.data ?? []).map((x) => ({ id: x.id, ativo: x.ativo, titulo: x.nome, sub: formatarTelefone(x.telefone) })))}
        </CardContent>
      </Card>
    </div>
  )
}
