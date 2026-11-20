import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CheckCircle2, FileDown, Info, Loader2, Save, Store, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarVendedores } from '@/features/clientes/api'
import {
  cancelarVenda,
  confirmarVenda,
  listarEnderecosCliente,
  obterParametros,
  obterVenda,
  PARAMETROS_PADRAO,
  salvarVenda,
  type ClienteResumo,
  type VendaDB,
} from '@/features/comercial/api'
import { totaisDocumento } from '@/features/comercial/calculos'
import { ClienteBusca } from '@/features/comercial/ClienteBusca'
import { ItensEditor, validarItens } from '@/features/comercial/ItensEditor'
import { PagamentosEditor, somaPagamentos } from '@/features/comercial/PagamentosEditor'
import { ResumoTotais } from '@/features/comercial/ResumoTotais'
import { itemParaCalculo, itemParaPayload, STATUS_VENDA, type ItemForm, type PagamentoForm } from '@/features/comercial/tipos'
import { paraCanonico } from '@/lib/decimal'
import { formatarData } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function itensVenda(v: VendaDB): ItemForm[] {
  return v.venda_itens.map((i) => ({
    produto_id: i.produto_id,
    sku: i.produto?.sku ?? '',
    descricao: i.descricao,
    unidade: i.unidade,
    eh_revestimento: i.produto?.eh_revestimento ?? false,
    m2_por_caixa: paraCanonico(i.m2_por_caixa, 4),
    modo: i.area_m2 !== null ? 'area' : 'quantidade',
    area_m2: paraCanonico(i.area_m2, 2),
    perc_sobra: paraCanonico(i.perc_sobra, 2),
    quantidade: paraCanonico(i.quantidade, 4),
    preco_unitario: paraCanonico(i.preco_unitario, 2),
    desconto_perc: Number(i.desconto_perc) ? paraCanonico(i.desconto_perc, 2) : '',
    saldo_id: '',
    lote_id: i.lote_id ?? '',
    deposito_id: i.deposito_id ?? '',
    localizacao_id: i.localizacao_id ?? '',
    observacao: i.observacao ?? '',
  }))
}

export function VendaFormPage() {
  const { id } = useParams()
  const nova = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode, usuario } = useAuth()

  const venda = useQuery({ queryKey: ['vendas', id], queryFn: () => obterVenda(id!), enabled: !nova })
  const params = useQuery({ queryKey: ['parametros-comerciais'], queryFn: obterParametros, staleTime: 10 * 60_000 })
  const vendedores = useQuery({ queryKey: ['vendedores'], queryFn: listarVendedores, staleTime: 5 * 60_000 })
  const p = params.data ?? PARAMETROS_PADRAO

  const [cliente, setCliente] = useState<ClienteResumo | null>(null)
  const [vendedorId, setVendedorId] = useState('')
  const [tipoEntrega, setTipoEntrega] = useState<'retirada' | 'entrega'>('retirada')
  const [enderecoId, setEnderecoId] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [frete, setFrete] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoForm[]>([])
  const [cancelando, setCancelando] = useState(false)
  const criada = useRef<string | null>(null)

  const enderecos = useQuery({
    queryKey: ['clientes', cliente?.id, 'enderecos'],
    queryFn: () => listarEnderecosCliente(cliente!.id),
    enabled: !!cliente,
  })

  useEffect(() => {
    if (nova && usuario?.id && usuario.id !== 'visualizacao') setVendedorId(usuario.id)
  }, [nova, usuario?.id])

  useEffect(() => {
    const v = venda.data
    if (!v) return
    setCliente(v.cliente)
    setVendedorId(v.vendedor_id ?? '')
    setTipoEntrega(v.tipo_entrega)
    setEnderecoId(v.endereco_entrega_id ?? '')
    setObservacoes(v.observacoes ?? '')
    setFrete(Number(v.frete) ? paraCanonico(v.frete, 2) : '')
    setItens(itensVenda(v))
    setPagamentos(
      v.venda_pagamentos.map((x) => ({
        forma: x.forma,
        valor: paraCanonico(x.valor, 2),
        parcelas: String(x.parcelas),
        primeiro_vencimento: x.primeiro_vencimento ?? '',
        intervalo_dias: String(x.intervalo_dias),
        observacao: x.observacao ?? '',
      })),
    )
  }, [venda.data])

  // endereço principal como padrão para entrega
  useEffect(() => {
    if (tipoEntrega === 'entrega' && !enderecoId && enderecos.data?.length) setEnderecoId(enderecos.data[0].id)
  }, [tipoEntrega, enderecoId, enderecos.data])

  const status = venda.data?.status ?? 'rascunho'
  const editavel = (nova ? pode('vendas', 'criar') : pode('vendas', 'editar')) && status === 'rascunho'
  const totais = useMemo(() => totaisDocumento(itens.map(itemParaCalculo), frete), [itens, frete])
  const limite = Number(p.desconto_max_sem_aprovacao)

  const validar = (exigirPagamento: boolean): string | null => {
    if (!cliente) return 'Selecione o cliente.'
    if (tipoEntrega === 'entrega' && !enderecoId) return 'Selecione o endereço de entrega.'
    const e = validarItens(itens, exigirPagamento)
    if (e) return e
    if (exigirPagamento) {
      if (itens.some((i) => !i.deposito_id)) return 'Selecione o lote/local de estoque de todos os itens.'
      if (somaPagamentos(pagamentos) !== totais.total) return 'A soma dos pagamentos deve ser igual ao total da venda.'
      if (pagamentos.some((x) => !x.valor)) return 'Informe o valor de todas as formas de pagamento.'
    }
    return null
  }

  const gravar = () =>
    salvarVenda(
      {
        id: id ?? '',
        cliente_id: cliente!.id,
        vendedor_id: vendedorId,
        tipo_entrega: tipoEntrega,
        endereco_entrega_id: tipoEntrega === 'entrega' ? enderecoId : '',
        frete: frete || '0',
        observacoes,
      },
      itens.map((i) => itemParaPayload(i, true)),
      pagamentos.map((x) => ({ ...x, parcelas: x.parcelas || '1' })),
    )

  const aposGravar = (vendaId: string, msg: string) => {
    toast.success(msg)
    qc.invalidateQueries({ queryKey: ['vendas'] })
    qc.invalidateQueries({ queryKey: ['estoque'] })
    if (nova) navigate(`/vendas/${vendaId}`, { replace: true })
  }

  const salvar = useMutation({ mutationFn: gravar, onSuccess: (vid) => aposGravar(vid, 'Venda salva como rascunho.'), onError: (e) => toast.error(mensagemErro(e)) })
  const confirmar = useMutation({
    mutationFn: async () => {
      const vid = await gravar()
      criada.current = vid
      await confirmarVenda(vid)
      return vid
    },
    onSuccess: (vid) => aposGravar(vid, p.reservar_ao_confirmar ? 'Venda confirmada. Estoque reservado por lote.' : 'Venda confirmada.'),
    onError: (e) => {
      toast.error(mensagemErro(e))
      qc.invalidateQueries({ queryKey: ['vendas'] })
      // rascunho já gravado: evita criar outra venda numa nova tentativa
      if (nova && criada.current) navigate(`/vendas/${criada.current}`, { replace: true })
    },
  })
  const cancelar = useMutation({
    mutationFn: (motivo: string) => cancelarVenda(id!, motivo),
    onSuccess: () => {
      toast.success('Venda cancelada. Reservas liberadas.')
      setCancelando(false)
      qc.invalidateQueries({ queryKey: ['vendas'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  if (!nova && venda.isLoading) return <Carregando />
  if (!nova && venda.error) return <ErroCarregamento mensagem={mensagemErro(venda.error)} />
  const v = venda.data

  const acionar = (tipo: 'salvar' | 'confirmar') => {
    const erro = validar(tipo === 'confirmar')
    if (erro) return toast.error(erro)
    if (tipo === 'salvar') salvar.mutate()
    else confirmar.mutate()
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to="/vendas" aria-label="Voltar">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {nova ? 'Nova venda' : `Venda #${v?.numero}`}
              {v && <Badge variant={STATUS_VENDA[v.status].variant}>{STATUS_VENDA[v.status].label}</Badge>}
            </h1>
            {v && (
              <p className="text-sm text-muted-foreground">
                Criada em {formatarData(v.created_at, true)}
                {v.orcamento && ` · originada do orçamento #${v.orcamento.numero}`}
                {v.motivo_cancelamento && ` · Cancelada: ${v.motivo_cancelamento}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {v && (
            <Button variant="outline" asChild>
              <Link to={`/vendas/${v.id}/imprimir`}>
                <FileDown /> Imprimir pedido
              </Link>
            </Button>
          )}
          {v && ['rascunho', 'confirmada'].includes(status) && pode('vendas', 'cancelar') && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelando(true)}>
              <Ban /> Cancelar venda
            </Button>
          )}
          {editavel && (
            <>
              <Button variant="outline" onClick={() => acionar('salvar')} disabled={salvar.isPending || confirmar.isPending}>
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar rascunho
              </Button>
              <Button onClick={() => acionar('confirmar')} disabled={salvar.isPending || confirmar.isPending}>
                {confirmar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar venda
              </Button>
            </>
          )}
        </div>
      </div>

      {(status === 'confirmada' || status === 'concluida') && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {status === 'concluida'
              ? 'Venda concluída: todas as mercadorias foram entregues.'
              : 'Venda confirmada: mercadorias reservadas por lote, parcelas em Contas a Receber e entrega criada (a baixa física ocorre na separação). Este pedido não é documento fiscal.'}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/entregas?venda=${v?.id}`}><Truck /> Ver entregas</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cliente e entrega</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Cliente" obrigatorio>
                <ClienteBusca
                  valor={cliente}
                  onSelecionar={(c) => {
                    setCliente(c)
                    setEnderecoId('')
                  }}
                  disabled={!editavel}
                />
              </Field>
              <fieldset disabled={!editavel} className="grid gap-4 sm:grid-cols-2">
                <Field label="Recebimento da mercadoria">
                  <div className="grid grid-cols-2 gap-2">
                    {(['retirada', 'entrega'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipoEntrega(t)}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          tipoEntrega === t ? 'border-sidebar bg-sidebar text-white' : 'bg-card hover:bg-accent',
                        )}
                      >
                        {t === 'retirada' ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                        {t === 'retirada' ? 'Retirada na loja' : 'Entrega'}
                      </button>
                    ))}
                  </div>
                </Field>
                {tipoEntrega === 'entrega' && (
                  <Field label="Endereço de entrega" obrigatorio>
                    <NativeSelect value={enderecoId} onChange={(e) => setEnderecoId(e.target.value)} disabled={!cliente}>
                      <option value="">{!cliente ? 'Selecione o cliente' : enderecos.data?.length ? 'Selecione' : 'Cliente sem endereço cadastrado'}</option>
                      {enderecos.data?.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.descricao ? `${e.descricao}: ` : ''}
                          {e.logradouro}, {e.numero} — {e.bairro}, {e.cidade}/{e.uf}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
              <CardDescription>Cada item é atendido por um único lote. Para usar dois lotes, inclua duas linhas — o cliente deve estar ciente da diferença de tonalidade.</CardDescription>
            </CardHeader>
            <CardContent>
              <ItensEditor itens={itens} onChange={setItens} comEstoque editavel={editavel} sobraPadrao={paraCanonico(p.perc_sobra_padrao, 2)} descontoLimite={limite} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagamento</CardTitle>
              <CardDescription>À vista, parcelado ou combinando várias formas (pagamento misto).</CardDescription>
            </CardHeader>
            <CardContent>
              <PagamentosEditor pagamentos={pagamentos} onChange={setPagamentos} totalCentavos={totais.total} editavel={editavel} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Vendedor">
                <NativeSelect value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} disabled={!editavel}>
                  <option value="">—</option>
                  {vendedores.data?.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <ResumoTotais subtotal={totais.subtotal} desconto={totais.desconto} total={totais.total} frete={frete} onFrete={setFrete} editavel={editavel} descontoLimite={limite} />
              <Field label="Observações">
                <Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} disabled={!editavel} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>

      <MotivoDialog
        aberto={cancelando}
        titulo={`Cancelar venda #${v?.numero ?? ''}`}
        descricao="As reservas de estoque desta venda serão liberadas."
        rotuloConfirmar="Cancelar venda"
        destrutivo
        carregando={cancelar.isPending}
        onConfirmar={(m) => cancelar.mutate(m)}
        onFechar={() => setCancelando(false)}
      />
    </div>
  )
}
