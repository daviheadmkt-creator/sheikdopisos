import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CheckCircle2, FileDown, Loader2, Save, Send, ShoppingCart, ThumbsDown, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarVendedores } from '@/features/clientes/api'
import {
  alterarStatusOrcamento,
  converterOrcamentoEmVenda,
  obterOrcamento,
  obterParametros,
  PARAMETROS_PADRAO,
  salvarOrcamento,
  type ClienteResumo,
  type OrcamentoDB,
} from '@/features/comercial/api'
import { totaisDocumento } from '@/features/comercial/calculos'
import { CalculadoraM2 } from '@/features/comercial/CalculadoraM2'
import { ClienteBusca } from '@/features/comercial/ClienteBusca'
import { ItensEditor, validarItens } from '@/features/comercial/ItensEditor'
import { ResumoTotais } from '@/features/comercial/ResumoTotais'
import { itemParaCalculo, itemParaPayload, STATUS_ORCAMENTO, type ItemForm, type StatusOrcamento } from '@/features/comercial/tipos'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData, mascararTelefone } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { somenteDigitos } from '@/lib/validators/documento'

const schema = z.object({
  cliente_nome: z.string().trim().max(150),
  cliente_telefone: z.string(),
  vendedor_id: z.string(),
  validade: z.string().min(1, 'Informe a validade'),
  condicoes_pagamento: z.string().max(500),
  observacoes: z.string().max(2000),
})
type Cabecalho = z.infer<typeof schema>

export function itensDoBanco(itens: OrcamentoDB['orcamento_itens']): ItemForm[] {
  return itens.map((i) => ({
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
    lote_id: '',
    deposito_id: '',
    localizacao_id: '',
    observacao: i.observacao ?? '',
  }))
}

export function OrcamentoFormPage() {
  const { id } = useParams()
  const novo = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode, usuario } = useAuth()

  const orc = useQuery({ queryKey: ['orcamentos', id], queryFn: () => obterOrcamento(id!), enabled: !novo })
  const params = useQuery({ queryKey: ['parametros-comerciais'], queryFn: obterParametros, staleTime: 10 * 60_000 })
  const vendedores = useQuery({ queryKey: ['vendedores'], queryFn: listarVendedores, staleTime: 5 * 60_000 })
  const p = params.data ?? PARAMETROS_PADRAO
  const sobraPadrao = paraCanonico(p.perc_sobra_padrao, 2)

  const [cliente, setCliente] = useState<ClienteResumo | null>(null)
  const [avulso, setAvulso] = useState(false)
  const [itens, setItens] = useState<ItemForm[]>([])
  const [frete, setFrete] = useState('')
  const [motivo, setMotivo] = useState<null | 'recusado' | 'cancelado'>(null)
  const [snapshot, setSnapshot] = useState('')

  const form = useForm<Cabecalho>({
    resolver: zodResolver(schema),
    defaultValues: { cliente_nome: '', cliente_telefone: '', vendedor_id: '', validade: '', condicoes_pagamento: '', observacoes: '' },
  })
  const { register, reset, handleSubmit, formState, setValue } = form

  useEffect(() => {
    if (novo) {
      reset({
        cliente_nome: '',
        cliente_telefone: '',
        vendedor_id: usuario?.id && usuario.id !== 'visualizacao' ? usuario.id : '',
        validade: dataLocalISO(new Date(), p.validade_orcamento_dias),
        condicoes_pagamento: '',
        observacoes: '',
      })
    }
  }, [novo, reset, usuario?.id, p.validade_orcamento_dias])

  useEffect(() => {
    const o = orc.data
    if (!o) return
    reset({
      cliente_nome: o.cliente_nome ?? '',
      cliente_telefone: mascararTelefone(o.cliente_telefone ?? ''),
      vendedor_id: o.vendedor_id ?? '',
      validade: o.validade,
      condicoes_pagamento: o.condicoes_pagamento ?? '',
      observacoes: o.observacoes ?? '',
    })
    const it = itensDoBanco(o.orcamento_itens)
    const fr = Number(o.frete) ? paraCanonico(o.frete, 2) : ''
    setCliente(o.cliente)
    setAvulso(!o.cliente_id)
    setItens(it)
    setFrete(fr)
    setSnapshot(JSON.stringify({ itens: it, frete: fr, c: o.cliente_id ?? null, a: !o.cliente_id }))
  }, [orc.data, reset])

  const alterado =
    formState.isDirty || snapshot !== JSON.stringify({ itens, frete, c: avulso ? null : cliente?.id ?? null, a: avulso })

  const status: StatusOrcamento = orc.data?.status ?? 'rascunho'
  const editavel = (novo ? pode('orcamentos', 'criar') : pode('orcamentos', 'editar')) && ['rascunho', 'enviado'].includes(status)
  const totais = useMemo(() => totaisDocumento(itens.map(itemParaCalculo), frete), [itens, frete])
  const invalidar = () => qc.invalidateQueries({ queryKey: ['orcamentos'] })
  const onErro = (e: unknown) => toast.error(mensagemErro(e))

  const salvar = useMutation({
    mutationFn: (h: Cabecalho) =>
      salvarOrcamento(
        {
          id: id ?? '',
          cliente_id: avulso ? '' : cliente?.id ?? '',
          cliente_nome: avulso ? h.cliente_nome : '',
          cliente_telefone: avulso ? somenteDigitos(h.cliente_telefone) : '',
          vendedor_id: h.vendedor_id,
          validade: h.validade,
          condicoes_pagamento: h.condicoes_pagamento,
          observacoes: h.observacoes,
          frete: frete || '0',
        },
        itens.map((i) => itemParaPayload(i, false)),
      ),
    onSuccess: (novoId) => {
      toast.success(novo ? 'Orçamento criado.' : 'Orçamento salvo.')
      invalidar()
      if (novo) navigate(`/orcamentos/${novoId}`, { replace: true })
    },
    onError: onErro,
  })

  const mudarStatus = useMutation({
    mutationFn: (a: { status: StatusOrcamento; motivo?: string }) => alterarStatusOrcamento(id!, a.status, a.motivo),
    onSuccess: (_d, a) => {
      toast.success(`Orçamento ${STATUS_ORCAMENTO[a.status].label.toLowerCase()}.`)
      setMotivo(null)
      invalidar()
    },
    onError: onErro,
  })

  const converter = useMutation({
    mutationFn: () => converterOrcamentoEmVenda(id!),
    onSuccess: (vendaId) => {
      toast.success('Venda criada a partir do orçamento. Selecione os lotes e as formas de pagamento.')
      qc.invalidateQueries({ queryKey: ['orcamentos'] })
      qc.invalidateQueries({ queryKey: ['vendas'] })
      navigate(`/vendas/${vendaId}`)
    },
    onError: onErro,
  })

  const enviar = handleSubmit((h) => {
    if (!avulso && !cliente) return toast.error('Selecione o cliente ou informe um cliente não cadastrado.')
    if (avulso && h.cliente_nome.trim().length < 2) return form.setError('cliente_nome', { message: 'Informe o nome do cliente' })
    const erro = validarItens(itens, false)
    if (erro) return toast.error(erro)
    salvar.mutate(h)
  })

  if (!novo && orc.isLoading) return <Carregando />
  if (!novo && orc.error) return <ErroCarregamento mensagem={mensagemErro(orc.error)} />
  const o = orc.data

  return (
    <form onSubmit={enviar} noValidate>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" asChild>
            <Link to="/orcamentos" aria-label="Voltar">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {novo ? 'Novo orçamento' : `Orçamento #${o?.numero}`}
              {o && <Badge variant={STATUS_ORCAMENTO[o.status].variant}>{STATUS_ORCAMENTO[o.status].label}</Badge>}
            </h1>
            {o && (
              <p className="text-sm text-muted-foreground">
                Emitido em {formatarData(o.created_at)} · atualizado em {formatarData(o.updated_at, true)}
                {o.motivo_status && ` · Motivo: ${o.motivo_status}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {o && (
            <Button type="button" variant="outline" asChild>
              <Link to={`/orcamentos/${o.id}/imprimir`}>
                <FileDown /> Gerar PDF
              </Link>
            </Button>
          )}
          {o && status === 'rascunho' && pode('orcamentos', 'editar') && (
            <Button type="button" variant="outline" onClick={() => mudarStatus.mutate({ status: 'enviado' })} disabled={mudarStatus.isPending}>
              <Send /> Marcar como enviado
            </Button>
          )}
          {o && ['rascunho', 'enviado'].includes(status) && pode('orcamentos', 'editar') && (
            <>
              <Button type="button" variant="outline" onClick={() => setMotivo('recusado')}>
                <ThumbsDown /> Recusado
              </Button>
              <Button
                type="button"
                variant="dark"
                onClick={() => mudarStatus.mutate({ status: 'aprovado' })}
                disabled={mudarStatus.isPending || !o.cliente_id || alterado}
                title={!o.cliente_id ? 'Vincule um cliente cadastrado' : alterado ? 'Salve as alterações antes' : undefined}
              >
                <CheckCircle2 /> Aprovar
              </Button>
            </>
          )}
          {o && status === 'aprovado' && pode('vendas', 'criar') && (
            <Button type="button" onClick={() => converter.mutate()} disabled={converter.isPending || !o.cliente_id} title={!o.cliente_id ? 'Vincule um cliente cadastrado' : undefined}>
              {converter.isPending ? <Loader2 className="animate-spin" /> : <ShoppingCart />} Converter em venda
            </Button>
          )}
          {o && status === 'convertido' && o.venda_id && (
            <Button type="button" asChild>
              <Link to={`/vendas/${o.venda_id}`}>
                <ShoppingCart /> Ver venda
              </Link>
            </Button>
          )}
          {o && !['convertido', 'cancelado'].includes(status) && pode('orcamentos', 'cancelar') && (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setMotivo('cancelado')}>
              <Ban /> Cancelar
            </Button>
          )}
          {editavel && (
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          )}
        </div>
      </div>

      {o && ['rascunho', 'enviado'].includes(status) && !o.cliente_id && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <UserPlus className="h-4 w-4 text-primary" /> Para aprovar e converter em venda, cadastre o cliente e selecione-o neste orçamento.
          {pode('clientes', 'criar') && (
            <Link to="/clientes/novo" target="_blank" className="font-medium text-info hover:underline">
              Cadastrar cliente
            </Link>
          )}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <fieldset disabled={!editavel} className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={avulso} onChange={(e) => setAvulso(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  Cliente ainda não cadastrado (orçamento rápido)
                </label>
                {avulso ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome do cliente" obrigatorio erro={formState.errors.cliente_nome?.message}>
                      <Input {...register('cliente_nome')} />
                    </Field>
                    <Field label="Telefone / WhatsApp">
                      <Input inputMode="tel" {...register('cliente_telefone', { onChange: (e) => setValue('cliente_telefone', mascararTelefone(e.target.value)) })} />
                    </Field>
                  </div>
                ) : (
                  <ClienteBusca valor={cliente} onSelecionar={setCliente} disabled={!editavel} />
                )}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            <CardContent>
              <ItensEditor itens={itens} onChange={setItens} editavel={editavel} sobraPadrao={sobraPadrao} descontoLimite={Number(p.desconto_max_sem_aprovacao)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condições e observações</CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset disabled={!editavel} className="grid gap-4 sm:grid-cols-2">
                <Field label="Condições de pagamento" ajuda="Ex.: 10% de entrada + 3x no cartão">
                  <Textarea rows={3} {...register('condicoes_pagamento')} />
                </Field>
                <Field label="Observações ao cliente">
                  <Textarea rows={3} {...register('observacoes')} />
                </Field>
              </fieldset>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset disabled={!editavel} className="grid grid-cols-2 gap-3">
                <Field label="Validade" obrigatorio erro={formState.errors.validade?.message}>
                  <Input type="date" {...register('validade')} />
                </Field>
                <Field label="Vendedor">
                  <NativeSelect {...register('vendedor_id')}>
                    <option value="">—</option>
                    {vendedores.data?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nome}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </fieldset>
              <ResumoTotais
                subtotal={totais.subtotal}
                desconto={totais.desconto}
                total={totais.total}
                frete={frete}
                onFrete={setFrete}
                editavel={editavel}
                descontoLimite={Number(p.desconto_max_sem_aprovacao)}
              />
            </CardContent>
          </Card>
          {editavel && <CalculadoraM2 sobraPadrao={sobraPadrao} />}
        </div>
      </div>

      <MotivoDialog
        aberto={!!motivo}
        titulo={motivo === 'recusado' ? 'Orçamento recusado pelo cliente' : 'Cancelar orçamento'}
        rotuloConfirmar={motivo === 'recusado' ? 'Registrar recusa' : 'Cancelar orçamento'}
        destrutivo
        carregando={mudarStatus.isPending}
        onConfirmar={(m) => mudarStatus.mutate({ status: motivo!, motivo: m })}
        onFechar={() => setMotivo(null)}
      />
    </form>
  )
}
