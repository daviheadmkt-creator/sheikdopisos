import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ClienteResumo } from '@/features/comercial/api'
import { ClienteBusca } from '@/features/comercial/ClienteBusca'
import { FORMAS_PAGAMENTO, LISTA_FORMAS, type FormaPagamento } from '@/features/comercial/tipos'
import { addDays } from '@/features/compras/datas'
import { listarFornecedoresAtivos } from '@/features/fornecedores/api'
import { escalar } from '@/features/produtos/regras'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import {
  cancelarTitulo,
  criarTitulo,
  estornarMovimento,
  listarCategorias,
  listarCentros,
  listarContas,
  listarMovimentos,
  parcelasDoTitulo,
  type Movimento,
  type Parcela,
  type TipoTitulo,
} from './api'
import { dividirParcelas } from './calculos'
import { LiquidarDialog } from './LiquidarDialog'

export const STATUS_PARCELA: Record<string, { label: string; variant: 'default' | 'success' | 'danger' | 'info' | 'neutral' }> = {
  aberta: { label: 'Aberta', variant: 'info' },
  parcial: { label: 'Parcial', variant: 'default' },
  paga: { label: 'Liquidada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'neutral' },
}

export function NovoTituloDialog({
  aberto,
  onFechar,
  tipoInicial,
  contaFixa,
  somenteAVista,
}: {
  aberto: boolean
  onFechar: () => void
  tipoInicial: TipoTitulo
  /** usado no Caixa: lançamento já liquidado no caixa aberto */
  contaFixa?: string
  somenteAVista?: boolean
}) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoTitulo>(tipoInicial)
  const [descricao, setDescricao] = useState('')
  const [cliente, setCliente] = useState<ClienteResumo | null>(null)
  const [fornecedor, setFornecedor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [centro, setCentro] = useState('')
  const [competencia, setCompetencia] = useState(dataLocalISO())
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [primeiro, setPrimeiro] = useState(dataLocalISO())
  const [intervalo, setIntervalo] = useState('30')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [pago, setPago] = useState(!!somenteAVista)
  const [conta, setConta] = useState(contaFixa ?? '')
  const [obs, setObs] = useState('')
  const [chave, setChave] = useState('')

  useEffect(() => {
    if (!aberto) return
    setTipo(tipoInicial); setDescricao(''); setCliente(null); setFornecedor(''); setCategoria(''); setCentro('')
    setCompetencia(dataLocalISO()); setValor(''); setParcelas('1'); setPrimeiro(dataLocalISO()); setIntervalo('30')
    setForma(contaFixa ? 'dinheiro' : 'pix'); setPago(!!somenteAVista); setConta(contaFixa ?? ''); setObs(''); setChave(crypto.randomUUID())
  }, [aberto, tipoInicial, contaFixa, somenteAVista])

  const categorias = useQuery({ queryKey: ['financeiro', 'categorias'], queryFn: listarCategorias, enabled: aberto })
  const centros = useQuery({ queryKey: ['financeiro', 'centros'], queryFn: listarCentros, enabled: aberto })
  const contas = useQuery({ queryKey: ['financeiro', 'contas'], queryFn: listarContas, enabled: aberto && !contaFixa })
  const fornecedores = useQuery({ queryKey: ['fornecedores', 'ativos'], queryFn: listarFornecedoresAtivos, enabled: aberto && tipo === 'pagar' })

  const n = pago ? 1 : Math.max(1, Number(parcelas || '1'))
  const previa = valor ? dividirParcelas(valor, n).map((v, i) => ({ v, venc: addDays(primeiro || dataLocalISO(), i * Number(intervalo || '30')) })) : []

  const salvar = useMutation({
    mutationFn: () =>
      criarTitulo({
        tipo, descricao, cliente_id: cliente?.id ?? '', fornecedor_id: fornecedor, categoria_id: categoria, centro_custo_id: centro,
        competencia, valor, parcelas: String(n), primeiro_vencimento: pago ? competencia : primeiro, intervalo_dias: intervalo,
        forma, pago, conta_id: conta, observacoes: obs, chave_idempotencia: chave,
      }),
    onSuccess: () => {
      toast.success(pago ? 'Lançamento registrado e liquidado.' : 'Título lançado.')
      qc.invalidateQueries({ queryKey: ['financeiro'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const erro = descricao.trim().length < 3 ? 'Informe a descrição' : !categoria ? 'Selecione a categoria' : !valor || escalar(valor, 2) <= 0n ? 'Informe o valor' : pago && !conta ? 'Selecione a conta' : null
  const recebe = tipo === 'receber'

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contaFixa ? (recebe ? 'Entrada no caixa' : 'Despesa paga pelo caixa') : recebe ? 'Nova conta a receber' : 'Nova conta a pagar'}</DialogTitle>
          <DialogDescription>Títulos de vendas e compras são gerados automaticamente; use este lançamento para despesas e receitas avulsas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!contaFixa && (
            <Field label="Tipo">
              <NativeSelect value={tipo} onChange={(e) => { setTipo(e.target.value as TipoTitulo); setCategoria('') }}>
                <option value="pagar">A pagar (despesa)</option>
                <option value="receber">A receber (receita)</option>
              </NativeSelect>
            </Field>
          )}
          <Field label="Descrição" obrigatorio className={contaFixa ? 'sm:col-span-2' : ''}>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={recebe ? 'Ex.: Aluguel de espaço' : 'Ex.: Conta de energia — novembro'} />
          </Field>
          <Field label="Categoria" obrigatorio>
            <NativeSelect value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Selecione</option>
              {categorias.data?.filter((c) => c.tipo === tipo && c.ativo && !c.sistema).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Centro de custo">
            <NativeSelect value={centro} onChange={(e) => setCentro(e.target.value)}>
              <option value="">—</option>
              {centros.data?.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          </Field>
          {recebe ? (
            <Field label="Cliente (opcional)" className="sm:col-span-2"><ClienteBusca valor={cliente} onSelecionar={setCliente} /></Field>
          ) : (
            <Field label="Fornecedor (opcional)" className="sm:col-span-2">
              <NativeSelect value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                <option value="">—</option>
                {fornecedores.data?.map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Valor total" obrigatorio><DecimalInput value={valor} onChange={setValor} casas={2} prefixo="R$" /></Field>
          <Field label="Competência" ajuda="Mês de referência na DRE"><Input type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></Field>
          {!somenteAVista && (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
              <span className="text-sm font-medium">{recebe ? 'Já recebido (à vista)' : 'Já pago (à vista)'}</span>
              <Switch checked={pago} onCheckedChange={setPago} />
            </div>
          )}
          {pago ? (
            <>
              {!contaFixa && (
                <Field label="Conta" obrigatorio>
                  <NativeSelect value={conta} onChange={(e) => setConta(e.target.value)}>
                    <option value="">Selecione</option>
                    {contas.data?.filter((c) => c.ativo).map((c) => (
                      <option key={c.id} value={c.id} disabled={c.tipo === 'caixa' && !c.sessao_aberta_id}>{c.nome}{c.tipo === 'caixa' && !c.sessao_aberta_id ? ' (fechado)' : ''}</option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <Field label="Forma">
                <NativeSelect value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                  {LISTA_FORMAS.map((f) => <option key={f} value={f}>{FORMAS_PAGAMENTO[f].label}</option>)}
                </NativeSelect>
              </Field>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <Field label="Parcelas"><Input inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 3) || '1')} /></Field>
              <Field label="1º vencimento"><Input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} /></Field>
              <Field label="Intervalo (dias)"><Input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, '').slice(0, 3) || '30')} /></Field>
            </div>
          )}
          {!pago && previa.length > 1 && (
            <div className="flex flex-wrap gap-2 text-xs sm:col-span-2">
              {previa.map((p, i) => <span key={i} className="rounded bg-secondary px-2 py-1 tabular-nums">{i + 1}ª {formatarData(`${p.venc}T12:00:00`)} · {formatarMoeda(p.v)}</span>)}
            </div>
          )}
          <Field label="Observações" className="sm:col-span-2"><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={!!erro || salvar.isPending} title={erro ?? undefined}>
            {salvar.isPending && <Loader2 className="animate-spin" />} Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Detalhe do título: parcelas, movimentos (com estorno) e cancelamento. */
export function TituloDetalheDialog({ tituloId, onFechar }: { tituloId: string | null; onFechar: () => void }) {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [liquidando, setLiquidando] = useState<Parcela | null>(null)
  const [estornando, setEstornando] = useState<Movimento | null>(null)
  const [cancelando, setCancelando] = useState(false)

  const parcelas = useQuery({ queryKey: ['financeiro', 'titulo', tituloId, 'parcelas'], queryFn: () => parcelasDoTitulo(tituloId!), enabled: !!tituloId })
  const movs = useQuery({ queryKey: ['financeiro', 'titulo', tituloId, 'movs'], queryFn: () => listarMovimentos({ conta: '', de: '', ate: '', tituloId: tituloId! }), enabled: !!tituloId })
  const t = parcelas.data?.[0]
  const invalidar = () => qc.invalidateQueries({ queryKey: ['financeiro'] })

  const estornar = useMutation({
    mutationFn: (m: string) => estornarMovimento(estornando!.id, m),
    onSuccess: () => { toast.success('Movimento estornado; a parcela foi reaberta.'); setEstornando(null); invalidar() },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const cancelar = useMutation({
    mutationFn: (m: string) => cancelarTitulo(tituloId!, m),
    onSuccess: () => { toast.success('Título cancelado.'); setCancelando(false); invalidar() },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const origem = t?.documento_tipo === 'venda' ? `/vendas/${t.documento_id}` : null

  return (
    <Dialog open={!!tituloId} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Título #{t?.titulo_numero} {t && <Badge variant={t.tipo === 'receber' ? 'info' : 'default'} className="ml-2">{t.tipo === 'receber' ? 'A receber' : 'A pagar'}</Badge>}</DialogTitle>
          {t && (
            <DialogDescription>
              {t.descricao} · {t.pessoa_nome ?? 'sem pessoa vinculada'} · {t.categoria_nome}
              {t.centro_custo_nome && ` · ${t.centro_custo_nome}`}
              {origem && <> · <Link to={origem} className="text-info hover:underline" onClick={onFechar}>abrir venda</Link></>}
            </DialogDescription>
          )}
        </DialogHeader>
        {parcelas.isLoading ? <Carregando /> : (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">Parcelas</p>
              <div className="divide-y rounded-lg border">
                {parcelas.data?.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="w-14 tabular-nums">{p.numero}/{p.total_parcelas}</span>
                    <span className="w-28">{formatarData(`${p.vencimento}T12:00:00`)}{p.dias_atraso > 0 && <span className="block text-xs text-destructive">{p.dias_atraso}d atraso</span>}</span>
                    <span className="w-28 text-right tabular-nums">{formatarMoeda(p.valor)}</span>
                    <span className="w-28 text-right tabular-nums text-muted-foreground">pago {formatarMoeda(p.valor_pago)}</span>
                    <Badge variant={STATUS_PARCELA[p.status].variant}>{STATUS_PARCELA[p.status].label}</Badge>
                    {['aberta', 'parcial'].includes(p.status) && pode('contas', 'editar') ? (
                      <Button size="sm" onClick={() => setLiquidando(p)}>{p.tipo === 'receber' ? 'Receber' : 'Pagar'}</Button>
                    ) : <span className="w-[72px]" />}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Movimentações</p>
              {!movs.data?.length ? <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : (
                <div className="divide-y rounded-lg border">
                  {movs.data.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>#{m.numero} · {formatarData(`${m.data}T12:00:00`)} · {m.conta_nome}{m.forma_pagamento && ` · ${FORMAS_PAGAMENTO[m.forma_pagamento].label}`}</span>
                      <span className="flex items-center gap-2">
                        <span className={m.tipo === 'entrada' ? 'tabular-nums text-success' : 'tabular-nums text-destructive'}>{m.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(m.valor)}</span>
                        {m.natureza === 'estorno' && <Badge variant="neutral">Estorno</Badge>}
                        {m.estornado && <Badge variant="neutral">Estornado</Badge>}
                        {!m.estornado && m.natureza !== 'estorno' && (pode('contas', 'cancelar') || pode('financeiro', 'cancelar')) && (
                          <Button size="sm" variant="ghost" onClick={() => setEstornando(m)}><RotateCcw /> Estornar</Button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          {t && t.titulo_status !== 'cancelado' && t.documento_tipo !== 'venda' && pode('contas', 'cancelar') && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => setCancelando(true)}><Ban /> Cancelar título</Button>
          )}
          <Button variant="outline" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
        <LiquidarDialog parcela={liquidando} onFechar={() => setLiquidando(null)} />
        <MotivoDialog aberto={!!estornando} titulo={`Estornar movimento #${estornando?.numero ?? ''}`} descricao="Será lançado um movimento inverso e a parcela volta a ficar em aberto." rotuloConfirmar="Estornar" destrutivo carregando={estornar.isPending} onConfirmar={(m) => estornar.mutate(m)} onFechar={() => setEstornando(null)} />
        <MotivoDialog aberto={cancelando} titulo="Cancelar título" descricao="Só é possível cancelar títulos sem pagamentos." rotuloConfirmar="Cancelar título" destrutivo carregando={cancelar.isPending} onConfirmar={(m) => cancelar.mutate(m)} onFechar={() => setCancelando(false)} />
      </DialogContent>
    </Dialog>
  )
}
