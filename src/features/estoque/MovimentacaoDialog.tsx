import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ProdutoLista } from '@/features/produtos/api'
import { escalar } from '@/features/produtos/regras'
import { ehDecimalCanonico, paraCanonico } from '@/lib/decimal'
import { formatarNumero } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import {
  criarLote,
  listarDepositos,
  listarLocalizacoes,
  listarLotesDoProduto,
  listarSaldosDoProduto,
  registrarMovimentacao,
  type SaldoDetalhe,
} from './api'
import { ProdutoBusca, QuantidadeInput } from './componentes'
import { LISTA_TIPOS, TIPOS_MOVIMENTACAO, type TipoMovimentacao } from './regras'

const schema = z.object({
  tipo: z.enum(LISTA_TIPOS as [TipoMovimentacao, ...TipoMovimentacao[]]),
  saldo_origem_id: z.string(),
  lote_id: z.string(),
  deposito_destino_id: z.string(),
  localizacao_destino_id: z.string(),
  quantidade: z.string().refine((v) => ehDecimalCanonico(v) && escalar(v, 4) > 0n, 'Informe a quantidade'),
  custo_unitario: z.string(),
  motivo: z.string().trim().max(200),
  documento: z.string().trim().max(60),
  observacoes: z.string().trim().max(500),
})
type Form = z.infer<typeof schema>

const vazio = (tipo: TipoMovimentacao): Form => ({
  tipo,
  saldo_origem_id: '',
  lote_id: '',
  deposito_destino_id: '',
  localizacao_destino_id: '',
  quantidade: '',
  custo_unitario: '',
  motivo: '',
  documento: '',
  observacoes: '',
})

const rotuloSaldo = (s: SaldoDetalhe, casas = 4) =>
  [
    s.deposito_nome,
    s.localizacao_codigo && `Local ${s.localizacao_codigo}`,
    s.lote_codigo && `Lote ${s.lote_codigo}${s.tonalidade ? ` / Ton. ${s.tonalidade}` : ''}${s.calibre ? ` / Cal. ${s.calibre}` : ''}`,
    `Disp. ${formatarNumero(s.quantidade_disponivel, casas)}`,
    s.quantidade_avariada > 0 && `Avariado ${formatarNumero(s.quantidade_avariada, casas)}`,
  ]
    .filter(Boolean)
    .join(' · ')

export function MovimentacaoDialog({
  aberto,
  onFechar,
  tipoInicial = 'entrada',
}: {
  aberto: boolean
  onFechar: () => void
  tipoInicial?: TipoMovimentacao
}) {
  const qc = useQueryClient()
  const { pode } = useAuth()
  const [produto, setProduto] = useState<ProdutoLista | null>(null)
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const [novoLote, setNovoLote] = useState<{ codigo: string; tonalidade: string; calibre: string } | null>(null)

  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: vazio(tipoInicial) })
  const { register, control, watch, setValue, handleSubmit, reset, setError, formState } = form
  const erros = formState.errors
  const tipo = watch('tipo')
  const info = TIPOS_MOVIMENTACAO[tipo]
  const depDestino = watch('deposito_destino_id')
  const saldoOrigemId = watch('saldo_origem_id')

  useEffect(() => {
    if (aberto) {
      reset(vazio(tipoInicial))
      setProduto(null)
      setNovoLote(null)
      setChave(crypto.randomUUID()) // nova chave de idempotência por operação
    }
  }, [aberto, tipoInicial, reset])

  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos, enabled: aberto })
  const locaisDestino = useQuery({
    queryKey: ['estoque', 'localizacoes', depDestino],
    queryFn: () => listarLocalizacoes(depDestino),
    enabled: aberto && !!depDestino,
  })
  const saldos = useQuery({
    queryKey: ['estoque', 'saldos-produto', produto?.id],
    queryFn: () => listarSaldosDoProduto(produto!.id),
    enabled: aberto && !!produto && info.origem,
  })
  const lotes = useQuery({
    queryKey: ['estoque', 'lotes-produto', produto?.id],
    queryFn: () => listarLotesDoProduto(produto!.id),
    enabled: aberto && !!produto && !info.origem,
  })

  // depósito padrão como destino
  useEffect(() => {
    const padrao = depositos.data?.find((d) => d.padrao && d.ativo)
    if (aberto && padrao && !form.getValues('deposito_destino_id')) setValue('deposito_destino_id', padrao.id)
  }, [aberto, depositos.data, form, setValue])

  const saldoOrigem = useMemo(() => saldos.data?.find((s) => s.id === saldoOrigemId), [saldos.data, saldoOrigemId])
  const saldosOrigem = useMemo(() => {
    if (!saldos.data) return []
    if (tipo === 'baixa_avaria' || tipo === 'recuperacao_avaria') return saldos.data.filter((s) => s.quantidade_avariada > 0)
    return saldos.data.filter((s) => s.quantidade_disponivel > 0)
  }, [saldos.data, tipo])

  const salvar = useMutation({
    mutationFn: async (v: Form) => {
      let loteId = v.lote_id
      if (!info.origem && novoLote) {
        if (!novoLote.codigo.trim()) throw new Error('Informe o código do novo lote')
        loteId = (await criarLote({ produto_id: produto!.id, ...novoLote, data_fabricacao: '', observacoes: '' })).id
        // se a movimentação falhar, uma nova tentativa reutiliza o lote já criado
        setValue('lote_id', loteId)
        setNovoLote(null)
        void qc.invalidateQueries({ queryKey: ['estoque', 'lotes-produto', produto!.id] })
      }
      return registrarMovimentacao({
        tipo: v.tipo,
        produto_id: produto!.id,
        lote_id: info.origem ? saldoOrigem?.lote_id ?? '' : loteId,
        quantidade: v.quantidade,
        deposito_origem_id: info.origem ? saldoOrigem?.deposito_id ?? '' : '',
        localizacao_origem_id: info.origem ? saldoOrigem?.localizacao_id ?? '' : '',
        deposito_destino_id: info.destino ? v.deposito_destino_id : '',
        localizacao_destino_id: info.destino ? v.localizacao_destino_id : '',
        custo_unitario: v.tipo === 'entrada' ? v.custo_unitario : '',
        motivo: v.motivo,
        documento: v.documento,
        observacoes: v.observacoes,
        chave_idempotencia: chave,
      })
    },
    onSuccess: () => {
      toast.success('Movimentação registrada.')
      qc.invalidateQueries({ queryKey: ['estoque'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const enviar = handleSubmit((v) => {
    if (!produto) return toast.error('Selecione o produto')
    if (info.origem && !saldoOrigem) return setError('saldo_origem_id', { message: 'Selecione a origem' })
    if (info.destino && !v.deposito_destino_id) return setError('deposito_destino_id', { message: 'Selecione o depósito' })
    if (!info.origem && produto.eh_revestimento && !v.lote_id && !novoLote)
      return setError('lote_id', { message: 'Revestimentos exigem lote' })
    if (info.motivoObrigatorio && !v.motivo.trim()) return setError('motivo', { message: 'Informe o motivo' })
    if (saldoOrigem) {
      const limite =
        v.tipo === 'baixa_avaria' || v.tipo === 'recuperacao_avaria' ? saldoOrigem.quantidade_avariada : saldoOrigem.quantidade_disponivel
      if (escalar(v.quantidade, 4) > escalar(paraCanonico(limite, 4), 4))
        return setError('quantidade', { message: `Máximo disponível: ${formatarNumero(limite, 4)}` })
      if (v.tipo === 'transferencia' && saldoOrigem.deposito_id === v.deposito_destino_id && (saldoOrigem.localizacao_id ?? '') === v.localizacao_destino_id)
        return setError('localizacao_destino_id', { message: 'Destino igual à origem' })
    }
    salvar.mutate(v)
  })

  const tiposPermitidos = pode('movimentacoes', 'criar') ? LISTA_TIPOS : []

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova movimentação de estoque</DialogTitle>
          <DialogDescription>{info.descricao}. O lançamento é definitivo e fica registrado no histórico.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" obrigatorio>
              <NativeSelect
                {...register('tipo', {
                  onChange: () => {
                    setValue('saldo_origem_id', '')
                    setValue('lote_id', '')
                    setNovoLote(null)
                  },
                })}
              >
                {tiposPermitidos.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_MOVIMENTACAO[t].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Produto" obrigatorio>
              <ProdutoBusca
                valor={produto}
                onSelecionar={(p) => {
                  setProduto(p)
                  setValue('saldo_origem_id', '')
                  setValue('lote_id', '')
                  setValue('quantidade', '')
                  setNovoLote(null)
                }}
              />
            </Field>
          </div>

          {produto && info.origem && (
            <Field label="Origem (depósito, local e lote)" obrigatorio erro={erros.saldo_origem_id?.message}>
              <NativeSelect {...register('saldo_origem_id')} aria-invalid={!!erros.saldo_origem_id}>
                <option value="">{saldos.isLoading ? 'Carregando saldos…' : saldosOrigem.length ? 'Selecione' : 'Sem saldo disponível'}</option>
                {saldosOrigem.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.lote_bloqueado && tipo === 'saida'}>
                    {rotuloSaldo(s)}
                    {s.lote_bloqueado ? ' · LOTE BLOQUEADO' : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          {produto && !info.origem && (
            <Field
              label="Lote / tonalidade / calibre"
              obrigatorio={produto.eh_revestimento}
              erro={erros.lote_id?.message}
              ajuda={produto.eh_revestimento ? undefined : 'Opcional para produtos que não são revestimentos.'}
            >
              {novoLote ? (
                <div className="grid gap-2 rounded-lg border bg-background/60 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input placeholder="Código do lote" value={novoLote.codigo} onChange={(e) => setNovoLote({ ...novoLote, codigo: e.target.value })} />
                  <Input placeholder="Tonalidade" value={novoLote.tonalidade} onChange={(e) => setNovoLote({ ...novoLote, tonalidade: e.target.value })} />
                  <Input placeholder="Calibre" value={novoLote.calibre} onChange={(e) => setNovoLote({ ...novoLote, calibre: e.target.value })} />
                  <Button type="button" variant="ghost" onClick={() => setNovoLote(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <NativeSelect {...register('lote_id')} aria-invalid={!!erros.lote_id}>
                    <option value="">{produto.eh_revestimento ? 'Selecione o lote' : 'Sem lote'}</option>
                    {lotes.data?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo}
                        {l.tonalidade ? ` · Ton. ${l.tonalidade}` : ''}
                        {l.calibre ? ` · Cal. ${l.calibre}` : ''}
                        {l.bloqueado ? ' · BLOQUEADO' : ''}
                      </option>
                    ))}
                  </NativeSelect>
                  {(pode('lotes', 'criar') || pode('movimentacoes', 'criar')) && (
                    <Button type="button" variant="outline" onClick={() => setNovoLote({ codigo: '', tonalidade: '', calibre: '' })}>
                      <Plus /> Novo lote
                    </Button>
                  )}
                </div>
              )}
            </Field>
          )}

          {produto && info.destino && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Depósito de destino" obrigatorio erro={erros.deposito_destino_id?.message}>
                <NativeSelect
                  {...register('deposito_destino_id', { onChange: () => setValue('localizacao_destino_id', '') })}
                  aria-invalid={!!erros.deposito_destino_id}
                >
                  <option value="">Selecione</option>
                  {depositos.data
                    ?.filter((d) => d.ativo)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Localização de destino" erro={erros.localizacao_destino_id?.message}>
                <NativeSelect {...register('localizacao_destino_id')} disabled={!depDestino}>
                  <option value="">Sem localização específica</option>
                  {locaisDestino.data
                    ?.filter((l) => l.ativo)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo}
                        {l.descricao ? ` — ${l.descricao}` : ''}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            </div>
          )}

          {produto && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={produto.m2_por_caixa ? 'Quantidade (caixas ou m²)' : 'Quantidade'}
                obrigatorio
                erro={erros.quantidade?.message}
                className={tipo === 'entrada' ? '' : 'sm:col-span-2'}
              >
                <Controller
                  control={control}
                  name="quantidade"
                  render={({ field }) => (
                    <QuantidadeInput
                      valor={field.value}
                      onChange={field.onChange}
                      unidade={produto.unidade}
                      m2PorCaixa={produto.eh_revestimento ? produto.m2_por_caixa : null}
                      invalido={!!erros.quantidade}
                    />
                  )}
                />
              </Field>
              {tipo === 'entrada' && (
                <Field label={`Custo unitário (por ${produto.unidade})`} ajuda="Opcional. Usado no cálculo de custo (Fase 4).">
                  <Controller
                    control={control}
                    name="custo_unitario"
                    render={({ field }) => <DecimalInput value={field.value} onChange={field.onChange} casas={4} prefixo="R$" />}
                  />
                </Field>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Motivo" obrigatorio={info.motivoObrigatorio} erro={erros.motivo?.message}>
              <Input {...register('motivo')} aria-invalid={!!erros.motivo} />
            </Field>
            <Field label="Documento de referência" ajuda="Ex.: nº da NF, pedido do fornecedor">
              <Input {...register('documento')} />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={2} {...register('observacoes')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending || !produto}>
              {salvar.isPending && <Loader2 className="animate-spin" />}
              Registrar {info.label.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
