import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CalendarClock, Check, FileCheck2, Loader2, MapPin, PackageCheck, Paperclip, Phone, RotateCcw, Store, Truck, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarEnderecosCliente } from '@/features/comercial/api'
import { Qtd, QuantidadeInput } from '@/features/estoque/componentes'
import { escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData, formatarMoeda, formatarTelefone, mascararCEP } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  agendarEntrega,
  alterarTipoEntrega,
  cancelarEntrega,
  confirmarEntrega,
  enviarComprovante,
  iniciarRota,
  listarMotoristas,
  listarTransportadoras,
  listarVeiculos,
  obterEntrega,
  registrarDevolucao,
  urlComprovante,
  type Entrega,
  type EntregaItem,
} from './api'
import { etapasEntrega, JANELAS, STATUS_ENTREGA } from './regras'

export function EntregaPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode } = useAuth()
  const q = useQuery({ queryKey: ['logistica', 'entrega', id], queryFn: () => obterEntrega(id!) })
  const [agendar, setAgendar] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [devolver, setDevolver] = useState(false)
  const [cancelar, setCancelar] = useState(false)
  const [tipo, setTipo] = useState(false)
  const inv = () => { qc.invalidateQueries({ queryKey: ['logistica'] }); qc.invalidateQueries({ queryKey: ['vendas'] }); qc.invalidateQueries({ queryKey: ['estoque'] }) }

  const rota = useMutation({ mutationFn: () => iniciarRota([id!]), onSuccess: () => { toast.success('Entrega em rota.'); inv() }, onError: (e) => toast.error(mensagemErro(e)) })
  const cancelarM = useMutation({ mutationFn: (m: string) => cancelarEntrega(id!, m), onSuccess: () => { toast.success('Entrega cancelada.'); setCancelar(false); inv() }, onError: (e) => toast.error(mensagemErro(e)) })
  const comprovante = useMutation({ mutationFn: (p: string) => urlComprovante(p), onSuccess: (url) => window.open(url, '_blank', 'noopener'), onError: (e) => toast.error(mensagemErro(e)) })

  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroCarregamento mensagem={mensagemErro(q.error)} />
  const { entrega: e, itens } = q.data!
  const etapas = etapasEntrega(e.tipo)
  const idx = etapas.indexOf(e.status)
  const editar = pode('entregas', 'editar')
  const preSaida = ['aguardando_separacao', 'separado', 'agendado'].includes(e.status)

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild><Link to="/entregas" aria-label="Voltar"><ArrowLeft /></Link></Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {e.tipo === 'retirada' ? 'Retirada' : 'Entrega'} #{e.numero} <Badge variant={STATUS_ENTREGA[e.status].variant}>{STATUS_ENTREGA[e.status].label}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              <Link to={`/vendas/${e.venda_id}`} className="text-info hover:underline">Venda #{e.venda_numero}</Link> · {e.cliente_nome}
              {e.entrega_origem_id && <> · <Link to={`/entregas/${e.entrega_origem_id}`} className="text-info hover:underline">originada de outra entrega</Link></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {e.status === 'aguardando_separacao' && (pode('separacao', 'editar') || pode('separacao', 'criar')) && (
            <Button variant="dark" onClick={() => navigate(`/separacao/${e.id}`)}><PackageCheck /> Separar</Button>
          )}
          {editar && preSaida && <Button variant="outline" onClick={() => setTipo(true)}>{e.tipo === 'entrega' ? <Store /> : <Truck />} {e.tipo === 'entrega' ? 'Mudar para retirada' : 'Mudar para entrega'}</Button>}
          {editar && e.tipo === 'entrega' && preSaida && <Button variant="outline" onClick={() => setAgendar(true)}><CalendarClock /> {e.data_agendada ? 'Reagendar' : 'Agendar'}</Button>}
          {editar && e.status === 'agendado' && <Button onClick={() => rota.mutate()} disabled={rota.isPending}>{rota.isPending ? <Loader2 className="animate-spin" /> : <Truck />} Saiu para entrega</Button>}
          {editar && ((e.tipo === 'entrega' && e.status === 'em_rota') || (e.tipo === 'retirada' && e.status === 'separado')) && (
            <Button onClick={() => setConfirmar(true)}><Check /> {e.tipo === 'retirada' ? 'Confirmar retirada' : 'Confirmar entrega'}</Button>
          )}
          {editar && ['em_rota', 'separado', 'agendado'].includes(e.status) && <Button variant="outline" onClick={() => setDevolver(true)}><Undo2 /> Registrar devolução</Button>}
          {e.status === 'aguardando_separacao' && pode('entregas', 'cancelar') && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelar(true)}><Ban /> Cancelar</Button>}
        </div>
      </div>

      {!['cancelado', 'devolvido'].includes(e.status) && (
        <ol className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}>
          {etapas.map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5">
              <span className={cn('h-1.5 rounded-full', i <= idx ? 'bg-primary' : 'bg-secondary')} />
              <span className={cn('text-xs', i === idx ? 'font-semibold' : 'text-muted-foreground')}>{STATUS_ENTREGA[s].label}</span>
            </li>
          ))}
        </ol>
      )}
      {e.motivo_ocorrencia && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Ocorrência: {e.motivo_ocorrencia}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Lote / local</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Separado</TableHead>
                <TableHead className="text-right">Devolvido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell><p className="font-medium">{i.produto_descricao}</p><p className="font-mono text-xs text-muted-foreground">{i.sku}</p>{i.divergencia && <p className="text-xs text-destructive">{i.divergencia}</p>}</TableCell>
                  <TableCell className="text-sm">{i.lote_codigo ? `Lote ${i.lote_codigo}${i.tonalidade ? ` · ${i.tonalidade}` : ''}` : '—'}<span className="block text-xs text-muted-foreground">{i.deposito_nome}{i.localizacao_codigo && ` · ${i.localizacao_codigo}`}</span></TableCell>
                  <TableCell className="text-right"><Qtd valor={i.quantidade} unidade={i.unidade} m2PorCaixa={i.eh_revestimento ? i.m2_por_caixa : null} /></TableCell>
                  <TableCell className="text-right">{i.quantidade_separada > 0 ? <span className="flex items-center justify-end gap-1">{i.conferido && <Check className="h-4 w-4 text-success" />}<Qtd valor={i.quantidade_separada} unidade={i.unidade} /></span> : '—'}</TableCell>
                  <TableCell className="text-right">{i.quantidade_devolvida > 0 ? <Qtd valor={i.quantidade_devolvida} unidade={i.unidade} className="text-destructive" /> : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{e.tipo === 'retirada' ? 'Retirada na loja' : 'Destino'}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {e.tipo === 'entrega' && (
                <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{e.logradouro}, {e.numero_endereco}{e.complemento && ` — ${e.complemento}`}<br />{e.bairro} · {e.cidade}/{e.uf} · CEP {mascararCEP(e.cep ?? '')}{e.referencia && <><br /><span className="text-muted-foreground">Ref.: {e.referencia}</span></>}</span></p>
              )}
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> {formatarTelefone(e.cliente_whatsapp || e.cliente_telefone)}</p>
              {e.observacoes && <p className="text-muted-foreground">{e.observacoes}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Execução</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Linha rotulo="Agendada" valor={e.data_agendada ? `${formatarData(`${e.data_agendada}T12:00:00`)}${e.janela ? ` · ${JANELAS[e.janela]}` : ''}` : '—'} />
              <Linha rotulo="Motorista" valor={e.motorista_nome ?? '—'} />
              <Linha rotulo="Veículo" valor={e.veiculo_placa ? `${e.veiculo_placa} · ${e.veiculo_descricao}` : '—'} />
              <Linha rotulo="Transportadora" valor={e.transportadora_nome ?? '—'} />
              <Linha rotulo="Custo do frete" valor={formatarMoeda(e.frete_custo)} />
              <Linha rotulo="Peso estimado" valor={Number(e.peso_estimado_kg) > 0 ? `${Math.round(Number(e.peso_estimado_kg))} kg` : '—'} />
              <Linha rotulo="Separado" valor={e.separado_em ? `${formatarData(e.separado_em, true)} · ${e.separador_nome}` : '—'} />
              <Linha rotulo="Saída" valor={e.saiu_em ? formatarData(e.saiu_em, true) : '—'} />
              <Linha rotulo="Entregue" valor={e.entregue_em ? formatarData(e.entregue_em, true) : '—'} />
              {e.recebedor_nome && <Linha rotulo="Recebido por" valor={`${e.recebedor_nome}${e.recebedor_documento ? ` (${e.recebedor_documento})` : ''}`} />}
              {e.comprovante_path && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => comprovante.mutate(e.comprovante_path!)}><FileCheck2 /> Ver comprovante</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AgendarDialog aberto={agendar} entrega={e} onFechar={() => setAgendar(false)} onOk={inv} />
      <ConfirmarDialog aberto={confirmar} entrega={e} itens={itens} onFechar={() => setConfirmar(false)} onOk={inv} />
      <DevolucaoDialog aberto={devolver} entrega={e} onFechar={() => setDevolver(false)} onOk={(nova) => { inv(); if (nova) navigate(`/entregas/${nova}`) }} />
      <TipoDialog aberto={tipo} entrega={e} onFechar={() => setTipo(false)} onOk={inv} />
      <MotivoDialog aberto={cancelar} titulo="Cancelar entrega" descricao="Somente entregas ainda não separadas podem ser canceladas." rotuloConfirmar="Cancelar entrega" destrutivo carregando={cancelarM.isPending} onConfirmar={(m) => cancelarM.mutate(m)} onFechar={() => setCancelar(false)} />
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <p className="flex justify-between gap-3"><span className="text-muted-foreground">{rotulo}</span><span className="text-right">{valor}</span></p>
}

function AgendarDialog({ aberto, entrega: e, onFechar, onOk }: { aberto: boolean; entrega: Entrega; onFechar: () => void; onOk: () => void }) {
  const motoristas = useQuery({ queryKey: ['logistica', 'motoristas'], queryFn: listarMotoristas, enabled: aberto })
  const veiculos = useQuery({ queryKey: ['logistica', 'veiculos'], queryFn: listarVeiculos, enabled: aberto })
  const transp = useQuery({ queryKey: ['logistica', 'transportadoras'], queryFn: listarTransportadoras, enabled: aberto })
  const [d, setD] = useState({ data: '', janela: '', motorista: '', veiculo: '', transportadora: '', frete: '', obs: '' })
  useEffect(() => {
    if (aberto) setD({ data: e.data_agendada ?? dataLocalISO(new Date(), 1), janela: e.janela ?? '', motorista: e.motorista_id ?? '', veiculo: e.veiculo_id ?? '', transportadora: e.transportadora_id ?? '', frete: Number(e.frete_custo) ? paraCanonico(e.frete_custo, 2) : '', obs: '' })
  }, [aberto, e])
  const veic = veiculos.data?.find((v) => v.id === d.veiculo)
  const excesso = veic?.capacidade_kg && Number(e.peso_estimado_kg) > Number(veic.capacidade_kg)
  const salvar = useMutation({
    mutationFn: () => agendarEntrega({ entrega_id: e.id, data_agendada: d.data, janela: d.janela, motorista_id: d.motorista, veiculo_id: d.veiculo, transportadora_id: d.transportadora, frete_custo: d.frete || '0', observacoes: d.obs }),
    onSuccess: () => { toast.success('Entrega agendada.'); onOk(); onFechar() },
    onError: (err) => toast.error(mensagemErro(err)),
  })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agendar entrega #{e.numero}</DialogTitle><DialogDescription>Frota própria (motorista + veículo) ou transportadora.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" obrigatorio><Input type="date" value={d.data} min={dataLocalISO()} onChange={(x) => setD({ ...d, data: x.target.value })} /></Field>
          <Field label="Janela"><NativeSelect value={d.janela} onChange={(x) => setD({ ...d, janela: x.target.value })}><option value="">—</option>{Object.entries(JANELAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
          <Field label="Motorista"><NativeSelect value={d.motorista} onChange={(x) => setD({ ...d, motorista: x.target.value })}><option value="">—</option>{motoristas.data?.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</NativeSelect></Field>
          <Field label="Veículo" erro={excesso ? `Peso estimado (${Math.round(Number(e.peso_estimado_kg))} kg) acima da capacidade` : undefined}>
            <NativeSelect value={d.veiculo} onChange={(x) => setD({ ...d, veiculo: x.target.value })}><option value="">—</option>{veiculos.data?.filter((v) => v.ativo).map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.descricao}</option>)}</NativeSelect>
          </Field>
          <Field label="Transportadora" ajuda="Use em vez de motorista/veículo próprio"><NativeSelect value={d.transportadora} onChange={(x) => setD({ ...d, transportadora: x.target.value })}><option value="">—</option>{transp.data?.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</NativeSelect></Field>
          <Field label="Custo do frete"><DecimalInput value={d.frete} onChange={(v) => setD({ ...d, frete: v })} casas={2} prefixo="R$" /></Field>
          <Field label="Observações" className="sm:col-span-2"><Input value={d.obs} onChange={(x) => setD({ ...d, obs: x.target.value })} placeholder="Ex.: ligar antes, acesso por rua lateral" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={!d.data || salvar.isPending}>{salvar.isPending && <Loader2 className="animate-spin" />} Salvar agenda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmarDialog({ aberto, entrega: e, itens, onFechar, onOk }: { aberto: boolean; entrega: Entrega; itens: EntregaItem[]; onFechar: () => void; onOk: () => void }) {
  const [recebedor, setRecebedor] = useState('')
  const [doc, setDoc] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [comDevolucao, setComDevolucao] = useState(false)
  const [dev, setDev] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (aberto) { setRecebedor(''); setDoc(''); setArquivo(null); setComDevolucao(false); setDev({}); setMotivo('') } }, [aberto])

  const devolucoes = comDevolucao ? itens.filter((i) => dev[i.id]).map((i) => ({ item_id: i.id, quantidade_devolvida: dev[i.id] })) : []
  const excede = itens.some((i) => dev[i.id] && escalar(dev[i.id], 4) > escalar(paraCanonico(i.quantidade_separada - i.quantidade_devolvida, 4), 4))

  const salvar = useMutation({
    mutationFn: async () => {
      const caminho = arquivo ? await enviarComprovante(e.id, arquivo) : ''
      await confirmarEntrega({ entrega_id: e.id, recebedor_nome: recebedor, recebedor_documento: doc, comprovante_path: caminho, devolucoes, motivo_devolucao: motivo })
    },
    onSuccess: () => { toast.success(devolucoes.length ? 'Entrega confirmada com devolução parcial (itens retornaram ao estoque).' : 'Entrega confirmada.'); onOk(); onFechar() },
    onError: (err) => toast.error(mensagemErro(err)),
  })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{e.tipo === 'retirada' ? 'Confirmar retirada' : 'Confirmar entrega'} #{e.numero}</DialogTitle><DialogDescription>Registre quem recebeu e anexe o comprovante assinado (foto ou PDF).</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recebido por" obrigatorio><Input value={recebedor} onChange={(x) => setRecebedor(x.target.value)} /></Field>
            <Field label="Documento (opcional)"><Input value={doc} onChange={(x) => setDoc(x.target.value)} placeholder="RG ou CPF" /></Field>
          </div>
          <div>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(x) => setArquivo(x.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" onClick={() => input.current?.click()}><Paperclip /> {arquivo ? arquivo.name : 'Anexar comprovante'}</Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm font-medium">Houve devolução parcial (avaria, recusa de parte)?</span>
            <Switch checked={comDevolucao} onCheckedChange={setComDevolucao} />
          </div>
          {comDevolucao && (
            <div className="space-y-3 rounded-lg border bg-background/60 p-3">
              {itens.map((i) => (
                <Field key={i.id} label={`${i.produto_descricao} — entregue ${paraCanonico(i.quantidade_separada - i.quantidade_devolvida, 4).replace('.', ',')} ${i.unidade}`}>
                  <QuantidadeInput valor={dev[i.id] ?? ''} onChange={(v) => setDev({ ...dev, [i.id]: v })} unidade={i.unidade} m2PorCaixa={i.eh_revestimento ? i.m2_por_caixa : null} />
                </Field>
              ))}
              {excede && <p className="text-sm text-destructive">Devolução maior que a quantidade entregue.</p>}
              <Field label="Motivo da devolução" obrigatorio><Textarea rows={2} value={motivo} onChange={(x) => setMotivo(x.target.value)} /></Field>
              <p className="text-xs text-muted-foreground">Os itens devolvidos retornam ao estoque (mesmo lote e local). O ajuste financeiro com o cliente deve ser tratado no Financeiro.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button onClick={() => salvar.mutate()} disabled={recebedor.trim().length < 2 || excede || (devolucoes.length > 0 && motivo.trim().length < 3) || salvar.isPending}>
            {salvar.isPending && <Loader2 className="animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DevolucaoDialog({ aberto, entrega: e, onFechar, onOk }: { aberto: boolean; entrega: Entrega; onFechar: () => void; onOk: (nova: string | null) => void }) {
  const [motivo, setMotivo] = useState('')
  const [reentregar, setReentregar] = useState(true)
  useEffect(() => { if (aberto) { setMotivo(''); setReentregar(true) } }, [aberto])
  const salvar = useMutation({
    mutationFn: () => registrarDevolucao(e.id, motivo, reentregar),
    onSuccess: (nova) => { toast.success(reentregar ? 'Devolução registrada e nova entrega criada.' : 'Devolução registrada. Mercadoria retornou ao estoque.'); onFechar(); onOk(nova) },
    onError: (err) => toast.error(mensagemErro(err)),
  })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Devolução total da entrega #{e.numero}</DialogTitle><DialogDescription>Ex.: cliente ausente, endereço não localizado, recusa. Toda a mercadoria separada retorna ao estoque.</DialogDescription></DialogHeader>
        <Textarea rows={3} value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Motivo (obrigatório)" />
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <span className="text-sm"><RotateCcw className="mr-1 inline h-4 w-4 text-primary" /> Criar nova entrega para reentregar</span>
          <Switch checked={reentregar} onCheckedChange={setReentregar} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button variant="destructive" onClick={() => salvar.mutate()} disabled={motivo.trim().length < 3 || salvar.isPending}>{salvar.isPending && <Loader2 className="animate-spin" />} Registrar devolução</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TipoDialog({ aberto, entrega: e, onFechar, onOk }: { aberto: boolean; entrega: Entrega; onFechar: () => void; onOk: () => void }) {
  const novoTipo = e.tipo === 'entrega' ? 'retirada' : 'entrega'
  const enderecos = useQuery({ queryKey: ['clientes', e.cliente_id, 'enderecos'], queryFn: () => listarEnderecosCliente(e.cliente_id), enabled: aberto && novoTipo === 'entrega' })
  const [end, setEnd] = useState('')
  useEffect(() => { if (aberto) setEnd('') }, [aberto])
  const salvar = useMutation({
    mutationFn: () => alterarTipoEntrega(e.id, novoTipo, end),
    onSuccess: () => { toast.success('Tipo alterado.'); onOk(); onFechar() },
    onError: (err) => toast.error(mensagemErro(err)),
  })
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{novoTipo === 'retirada' ? 'Mudar para retirada na loja' : 'Mudar para entrega'}</DialogTitle></DialogHeader>
        {novoTipo === 'entrega' ? (
          <Field label="Endereço de entrega" obrigatorio>
            <NativeSelect value={end} onChange={(x) => setEnd(x.target.value)}>
              <option value="">{enderecos.data?.length ? 'Selecione' : 'Cliente sem endereço cadastrado'}</option>
              {enderecos.data?.map((x) => <option key={x.id} value={x.id}>{x.logradouro}, {x.numero} — {x.bairro}, {x.cidade}/{x.uf}</option>)}
            </NativeSelect>
          </Field>
        ) : <p className="text-sm text-muted-foreground">A agenda (data, motorista, veículo) será removida.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button onClick={() => salvar.mutate()} disabled={(novoTipo === 'entrega' && !end) || salvar.isPending}>{salvar.isPending && <Loader2 className="animate-spin" />} Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
