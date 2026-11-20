import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CheckCircle2, Loader2, PackageCheck, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { deCentavos } from '@/features/comercial/calculos'
import { listarDepositos } from '@/features/estoque/api'
import { ProdutoBusca, Qtd, QuantidadeInput } from '@/features/estoque/componentes'
import { listarFornecedoresAtivos } from '@/features/fornecedores/api'
import { escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { aprovarPedidoCompra, encerrarPedidoCompra, obterPedidoCompra, salvarPedidoCompra, type Solicitacao } from './api'
import { previsaoParcelas, totaisPedido, valoresItemCompra } from './calculos'
import { STATUS_PEDIDO_COMPRA, STATUS_RECEBIMENTO, type ItemCompraForm } from './tipos'

export function PedidoCompraPage() {
  const { id } = useParams()
  const novo = !id
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { pode } = useAuth()

  const pedido = useQuery({ queryKey: ['compras', 'pedido', id], queryFn: () => obterPedidoCompra(id!), enabled: !novo })
  const fornecedores = useQuery({ queryKey: ['fornecedores', 'ativos'], queryFn: listarFornecedoresAtivos })
  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos })

  const [fornecedorId, setFornecedorId] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [depositoId, setDepositoId] = useState('')
  const [condicao, setCondicao] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [primeiroVenc, setPrimeiroVenc] = useState('30')
  const [intervalo, setIntervalo] = useState('30')
  const [frete, setFrete] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState<ItemCompraForm[]>([])
  const [encerrando, setEncerrando] = useState(false)

  // novo pedido a partir de solicitações selecionadas
  useEffect(() => {
    const sol = (location.state as { solicitacoes?: Solicitacao[] } | null)?.solicitacoes
    if (novo && sol?.length) {
      setItens(
        sol.map((s) => ({
          produto_id: s.produto_id,
          sku: s.sku,
          descricao: s.produto_descricao,
          unidade: s.unidade,
          eh_revestimento: s.eh_revestimento,
          m2_por_caixa: s.m2_por_caixa,
          codigo_fornecedor: '',
          quantidade: paraCanonico(s.quantidade, 4),
          custo_unitario: '',
          desconto_perc: '',
          solicitacao_id: s.id,
        })),
      )
    }
  }, [novo, location.state])

  useEffect(() => {
    if (novo && !depositoId) setDepositoId(depositos.data?.find((d) => d.padrao)?.id ?? '')
  }, [novo, depositoId, depositos.data])

  useEffect(() => {
    const p = pedido.data
    if (!p) return
    setFornecedorId(p.fornecedor_id)
    setPrevisao(p.previsao_entrega ?? '')
    setDepositoId(p.deposito_destino_id ?? '')
    setCondicao(p.condicao_pagamento ?? '')
    setParcelas(String(p.parcelas))
    setPrimeiroVenc(String(p.primeiro_vencimento_dias))
    setIntervalo(String(p.intervalo_dias))
    setFrete(Number(p.frete) ? paraCanonico(p.frete, 2) : '')
    setObservacoes(p.observacoes ?? '')
    setItens(
      p.itens.map((i) => ({
        produto_id: i.produto_id,
        sku: i.sku,
        descricao: i.descricao,
        unidade: i.unidade,
        eh_revestimento: i.eh_revestimento,
        m2_por_caixa: i.m2_por_caixa,
        codigo_fornecedor: i.codigo_fornecedor ?? '',
        quantidade: paraCanonico(i.quantidade, 4),
        custo_unitario: paraCanonico(i.custo_unitario, 4),
        desconto_perc: Number(i.desconto_perc) ? paraCanonico(i.desconto_perc, 2) : '',
        solicitacao_id: i.solicitacao_id ?? '',
        quantidade_recebida: i.quantidade_recebida,
      })),
    )
  }, [pedido.data])

  const status = pedido.data?.status ?? 'rascunho'
  const editavel = (novo ? pode('compras', 'criar') : pode('compras', 'editar')) && status === 'rascunho'
  const totais = useMemo(() => totaisPedido(itens, frete), [itens, frete])
  const parcelasPrev = useMemo(
    () => (totais.total > 0n ? previsaoParcelas(deCentavos(totais.total), Number(parcelas || '1'), dataLocalISO(), Number(primeiroVenc || '0'), Number(intervalo || '30')) : []),
    [totais.total, parcelas, primeiroVenc, intervalo],
  )
  const atualizar = (i: number, p: Partial<ItemCompraForm>) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const salvar = useMutation({
    mutationFn: () =>
      salvarPedidoCompra(
        {
          id: id ?? '',
          fornecedor_id: fornecedorId,
          previsao_entrega: previsao,
          deposito_destino_id: depositoId,
          condicao_pagamento: condicao,
          parcelas,
          primeiro_vencimento_dias: primeiroVenc,
          intervalo_dias: intervalo,
          frete: frete || '0',
          observacoes,
        },
        itens.map((i) => ({
          produto_id: i.produto_id,
          codigo_fornecedor: i.codigo_fornecedor,
          quantidade: i.quantidade,
          custo_unitario: i.custo_unitario,
          desconto_perc: i.desconto_perc || '0',
          solicitacao_id: i.solicitacao_id,
        })),
      ),
    onSuccess: (pid) => {
      toast.success(novo ? 'Pedido de compra criado.' : 'Pedido salvo.')
      qc.invalidateQueries({ queryKey: ['compras'] })
      if (novo) navigate(`/compras/pedidos/${pid}`, { replace: true })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const aprovar = useMutation({
    mutationFn: () => aprovarPedidoCompra(id!),
    onSuccess: () => { toast.success('Pedido aprovado. Já pode ser enviado ao fornecedor e recebido.'); qc.invalidateQueries({ queryKey: ['compras'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const encerrar = useMutation({
    mutationFn: (m: string) => encerrarPedidoCompra(id!, m),
    onSuccess: () => { toast.success(status === 'parcialmente_recebido' ? 'Saldo pendente encerrado.' : 'Pedido cancelado.'); setEncerrando(false); qc.invalidateQueries({ queryKey: ['compras'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const validarESalvar = () => {
    if (!fornecedorId) return toast.error('Selecione o fornecedor.')
    if (!itens.length) return toast.error('Inclua ao menos um item.')
    const ruim = itens.findIndex((i) => !i.quantidade || escalar(i.quantidade, 4) <= 0n || !i.custo_unitario)
    if (ruim >= 0) return toast.error(`Item ${ruim + 1}: informe quantidade e custo.`)
    salvar.mutate()
  }

  if (!novo && pedido.isLoading) return <Carregando />
  if (!novo && pedido.error) return <ErroCarregamento mensagem={mensagemErro(pedido.error)} />
  const p = pedido.data
  const forn = fornecedores.data?.find((f) => f.id === fornecedorId)

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to="/compras" aria-label="Voltar"><ArrowLeft /></Link>
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {novo ? 'Novo pedido de compra' : `Pedido de compra #${p?.numero}`}
              {p && <Badge variant={STATUS_PEDIDO_COMPRA[p.status].variant}>{STATUS_PEDIDO_COMPRA[p.status].label}</Badge>}
            </h1>
            {p && (
              <p className="text-sm text-muted-foreground">
                Emitido em {formatarData(p.created_at)}
                {p.aprovado_em && ` · aprovado em ${formatarData(p.aprovado_em, true)}`}
                {p.motivo_encerramento && ` · ${p.motivo_encerramento}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p && ['rascunho', 'aprovado', 'parcialmente_recebido'].includes(status) && pode('compras', 'cancelar') && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setEncerrando(true)}>
              <Ban /> {status === 'parcialmente_recebido' ? 'Encerrar saldo' : 'Cancelar pedido'}
            </Button>
          )}
          {p && status === 'rascunho' && pode('compras', 'aprovar') && (
            <Button variant="dark" onClick={() => aprovar.mutate()} disabled={aprovar.isPending}>
              {aprovar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Aprovar pedido
            </Button>
          )}
          {p && ['aprovado', 'parcialmente_recebido'].includes(status) && (pode('compras', 'editar') || pode('movimentacoes', 'criar')) && (
            <Button asChild>
              <Link to={`/compras/recebimentos/novo?pedido=${p.id}`}><PackageCheck /> Registrar recebimento</Link>
            </Button>
          )}
          {editavel && (
            <Button onClick={validarESalvar} disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Fornecedor e entrega</CardTitle></CardHeader>
            <CardContent>
              <fieldset disabled={!editavel} className="grid gap-4 sm:grid-cols-3">
                <Field label="Fornecedor" obrigatorio className="sm:col-span-3">
                  <NativeSelect
                    value={fornecedorId}
                    onChange={(e) => {
                      setFornecedorId(e.target.value)
                      const f = fornecedores.data?.find((x) => x.id === e.target.value)
                      if (f?.condicoes_pagamento && !condicao) setCondicao(f.condicoes_pagamento)
                      if (f?.prazo_entrega_dias && !previsao) setPrevisao(dataLocalISO(new Date(), f.prazo_entrega_dias))
                    }}
                  >
                    <option value="">{fornecedores.data?.length ? 'Selecione' : 'Nenhum fornecedor ativo — cadastre em Fornecedores'}</option>
                    {fornecedores.data?.map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Previsão de entrega"><Input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} /></Field>
                <Field label="Depósito de destino">
                  <NativeSelect value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
                    <option value="">—</option>
                    {depositos.data?.filter((d) => d.ativo).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </NativeSelect>
                </Field>
                {forn?.prazo_entrega_dias !== undefined && forn?.prazo_entrega_dias !== null && (
                  <p className="self-end pb-2 text-xs text-muted-foreground">Prazo médio do fornecedor: {forn.prazo_entrega_dias} dias</p>
                )}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!itens.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum item.</p>}
              {itens.map((i, n) => {
                const v = valoresItemCompra(i.quantidade, i.custo_unitario, i.desconto_perc)
                const recebido = i.quantidade_recebida ?? 0
                return (
                  <div key={`${i.produto_id}-${n}`} className="rounded-xl border p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium"><span className="mr-2 text-muted-foreground">{n + 1}.</span>{i.descricao}</p>
                        <p className="font-mono text-xs text-muted-foreground">{i.sku} · {i.unidade}{i.solicitacao_id && ' · vinculado a solicitação'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold tabular-nums">{formatarMoeda(deCentavos(v.total))}</p>
                        {editavel && (
                          <button type="button" onClick={() => setItens((l) => l.filter((_, j) => j !== n))} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remover">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Quantidade" className="sm:col-span-2">
                        <QuantidadeInput valor={i.quantidade} onChange={(q) => atualizar(n, { quantidade: q })} unidade={i.unidade} m2PorCaixa={i.eh_revestimento ? i.m2_por_caixa : null} />
                      </Field>
                      <Field label={`Custo por ${i.unidade}`}>
                        <DecimalInput value={i.custo_unitario} onChange={(c) => atualizar(n, { custo_unitario: c })} casas={4} prefixo="R$" />
                      </Field>
                      <Field label="Desconto (%)">
                        <DecimalInput value={i.desconto_perc} onChange={(d) => atualizar(n, { desconto_perc: d })} casas={2} />
                      </Field>
                      <Field label="Código no fornecedor" className="sm:col-span-2">
                        <Input value={i.codigo_fornecedor} onChange={(e) => atualizar(n, { codigo_fornecedor: e.target.value })} className="h-9" />
                      </Field>
                    </fieldset>
                    {p && status !== 'rascunho' && (
                      <div className="mt-3 flex items-center gap-3 text-sm">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full bg-success" style={{ width: `${Math.min(100, (recebido / Number(i.quantidade || 1)) * 100)}%` }} />
                        </div>
                        <span className="whitespace-nowrap text-muted-foreground">
                          Recebido <Qtd valor={recebido} unidade={i.unidade} /> de <Qtd valor={Number(i.quantidade)} unidade={i.unidade} />
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
              {editavel && (
                <div className="rounded-xl border bg-background/50 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Adicionar produto</p>
                  <ProdutoBusca
                    valor={null}
                    onSelecionar={(pr) =>
                      pr &&
                      setItens((l) => [
                        ...l,
                        {
                          produto_id: pr.id,
                          sku: pr.sku,
                          descricao: pr.descricao,
                          unidade: pr.unidade,
                          eh_revestimento: pr.eh_revestimento,
                          m2_por_caixa: pr.m2_por_caixa,
                          codigo_fornecedor: '',
                          quantidade: '',
                          custo_unitario: '',
                          desconto_perc: '',
                          solicitacao_id: '',
                        },
                      ])
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {p && p.recebimentos.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recebimentos</CardTitle></CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Conferente</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.recebimentos.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/compras/recebimentos/${r.id}`)}>
                      <TableCell className="font-medium">#{r.numero}</TableCell>
                      <TableCell>{formatarData(`${r.data_recebimento}T12:00:00`)}</TableCell>
                      <TableCell>{r.nota_fiscal ?? '—'}</TableCell>
                      <TableCell>{r.conferido_por_nome ?? '—'}</TableCell>
                      <TableCell><Badge variant={STATUS_RECEBIMENTO[r.status].variant}>{STATUS_RECEBIMENTO[r.status].label}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="xl:sticky xl:top-20">
            <CardHeader><CardTitle>Totais e pagamento</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatarMoeda(deCentavos(totais.subtotal))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Descontos</span><span className="tabular-nums text-destructive">− {formatarMoeda(deCentavos(totais.desconto))}</span></div>
              <Field label="Frete"><DecimalInput value={frete} onChange={setFrete} casas={2} prefixo="R$" disabled={!editavel} /></Field>
              <div className="flex items-end justify-between border-t pt-3">
                <span className="font-medium">Total</span>
                <span className="text-2xl font-semibold tabular-nums">{formatarMoeda(deCentavos(totais.total))}</span>
              </div>
              <fieldset disabled={!editavel} className="space-y-3 border-t pt-3">
                <Field label="Condição de pagamento"><Input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: boleto 30/60/90" /></Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Parcelas"><Input inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2) || '1')} /></Field>
                  <Field label="1º venc. (dias)"><Input inputMode="numeric" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
                  <Field label="Intervalo"><Input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, '').slice(0, 3) || '30')} /></Field>
                </div>
              </fieldset>
              {parcelasPrev.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Previsão de pagamentos (Contas a Pagar — Fase 5)</p>
                  <ul className="space-y-1">
                    {parcelasPrev.map((x) => (
                      <li key={x.numero} className={cn('flex justify-between rounded bg-secondary/60 px-2 py-1 text-xs tabular-nums')}>
                        <span>{x.numero}/{parcelasPrev.length} · {formatarData(`${x.vencimento}T12:00:00`)}</span>
                        <span>{formatarMoeda(x.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Field label="Observações"><Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} disabled={!editavel} /></Field>
            </CardContent>
          </Card>
          {status === 'rascunho' && !pode('compras', 'aprovar') && (
            <Card><CardHeader><CardDescription>Após salvar, um gerente precisa aprovar o pedido antes do recebimento.</CardDescription></CardHeader></Card>
          )}
        </div>
      </div>

      <MotivoDialog
        aberto={encerrando}
        titulo={status === 'parcialmente_recebido' ? 'Encerrar saldo pendente' : 'Cancelar pedido de compra'}
        descricao={status === 'parcialmente_recebido' ? 'As quantidades já recebidas são mantidas; o restante deixa de ser aguardado.' : 'Nenhuma mercadoria foi recebida neste pedido.'}
        rotuloConfirmar={status === 'parcialmente_recebido' ? 'Encerrar saldo' : 'Cancelar pedido'}
        destrutivo
        carregando={encerrar.isPending}
        onConfirmar={(m) => encerrar.mutate(m)}
        onFechar={() => setEncerrando(false)}
      />
    </div>
  )
}
