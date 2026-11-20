import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { deCentavos } from '@/features/comercial/calculos'
import { FORMAS_PAGAMENTO, LISTA_FORMAS, type FormaPagamento } from '@/features/comercial/tipos'
import { escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { liquidarParcela, listarContas, obterParametrosFin, PARAMETROS_FIN_PADRAO, type Parcela } from './api'
import { encargosAtraso, valorLiquidacao } from './calculos'

/** Baixa (total ou parcial) de uma parcela, com juros/multa sugeridos e desconto. */
export function LiquidarDialog({
  parcela,
  onFechar,
  contaFixa,
}: {
  parcela: Parcela | null
  onFechar: () => void
  /** no Caixa, a conta é a do caixa aberto */
  contaFixa?: string
}) {
  const qc = useQueryClient()
  const contas = useQuery({ queryKey: ['financeiro', 'contas'], queryFn: listarContas, enabled: !!parcela })
  const params = useQuery({ queryKey: ['financeiro', 'parametros'], queryFn: obterParametrosFin, staleTime: 10 * 60_000 })
  const pr = params.data ?? PARAMETROS_FIN_PADRAO

  const [conta, setConta] = useState('')
  const [data, setData] = useState(dataLocalISO())
  const [principal, setPrincipal] = useState('')
  const [juros, setJuros] = useState('')
  const [desconto, setDesconto] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [chave, setChave] = useState('')

  useEffect(() => {
    if (!parcela) return
    setConta(contaFixa ?? '')
    setData(dataLocalISO())
    setPrincipal(paraCanonico(parcela.valor_aberto, 2))
    setDesconto('')
    setForma(parcela.forma_prevista ?? (parcela.tipo === 'receber' ? 'pix' : 'boleto'))
    setChave(crypto.randomUUID())
  }, [parcela, contaFixa])

  // juros + multa sugeridos para recebimentos em atraso (editáveis)
  useEffect(() => {
    if (!parcela || parcela.tipo !== 'receber') return setJuros('')
    const e = encargosAtraso(paraCanonico(parcela.valor_aberto, 2), parcela.vencimento, data, pr.multa_perc, pr.juros_mes_perc, pr.dias_carencia)
    const total = escalar(e.multa, 2) + escalar(e.juros, 2)
    setJuros(total > 0n ? deCentavos(total) : '')
  }, [parcela, data, pr.multa_perc, pr.juros_mes_perc, pr.dias_carencia])

  const total = valorLiquidacao(principal, juros, desconto)
  const aberto = parcela ? escalar(paraCanonico(parcela.valor_aberto, 2), 2) : 0n
  const principalEsc = escalar(principal || '0', 2)
  const erro = !principal || principalEsc <= 0n ? 'Informe o valor' : principalEsc > aberto ? 'Maior que o valor em aberto' : total <= 0n ? 'Desconto maior que o valor' : null

  const liquidar = useMutation({
    mutationFn: () => liquidarParcela({ parcela_id: parcela!.id, conta_id: conta, data, principal, juros: juros || '0', desconto: desconto || '0', forma, chave_idempotencia: chave }),
    onSuccess: () => {
      toast.success(parcela!.tipo === 'receber' ? 'Recebimento registrado.' : 'Pagamento registrado.')
      qc.invalidateQueries({ queryKey: ['financeiro'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const recebe = parcela?.tipo === 'receber'
  return (
    <Dialog open={!!parcela} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{recebe ? 'Registrar recebimento' : 'Registrar pagamento'}</DialogTitle>
          {parcela && (
            <DialogDescription>
              Título #{parcela.titulo_numero} · parcela {parcela.numero}/{parcela.total_parcelas} · {parcela.pessoa_nome ?? parcela.descricao}
              <br />
              Vencimento {formatarData(`${parcela.vencimento}T12:00:00`)} · em aberto {formatarMoeda(parcela.valor_aberto)}
              {parcela.dias_atraso > 0 && <span className="text-destructive"> · {parcela.dias_atraso} dia(s) de atraso</span>}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!contaFixa && (
            <Field label={recebe ? 'Conta de entrada' : 'Conta de saída'} obrigatorio className="sm:col-span-2">
              <NativeSelect value={conta} onChange={(e) => setConta(e.target.value)}>
                <option value="">Selecione</option>
                {contas.data?.filter((c) => c.ativo).map((c) => (
                  <option key={c.id} value={c.id} disabled={c.tipo === 'caixa' && !c.sessao_aberta_id}>
                    {c.nome} — saldo {formatarMoeda(c.saldo_atual)}{c.tipo === 'caixa' && !c.sessao_aberta_id ? ' (caixa fechado)' : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Data"><Input type="date" value={data} max={dataLocalISO()} onChange={(e) => setData(e.target.value)} /></Field>
          <Field label="Forma">
            <NativeSelect value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              {LISTA_FORMAS.map((f) => <option key={f} value={f}>{FORMAS_PAGAMENTO[f].label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Valor principal" erro={erro && erro !== 'Desconto maior que o valor' ? erro : undefined} ajuda="Menor que o aberto = baixa parcial">
            <DecimalInput value={principal} onChange={setPrincipal} casas={2} prefixo="R$" />
          </Field>
          <Field label="Juros / multa" ajuda={recebe ? `Sugestão: multa ${pr.multa_perc}% + ${pr.juros_mes_perc}% a.m.` : undefined}>
            <DecimalInput value={juros} onChange={setJuros} casas={2} prefixo="R$" />
          </Field>
          <Field label="Desconto" erro={erro === 'Desconto maior que o valor' ? erro : undefined}>
            <DecimalInput value={desconto} onChange={setDesconto} casas={2} prefixo="R$" />
          </Field>
          <div className="flex flex-col justify-end rounded-lg bg-sidebar px-4 py-3 text-white">
            <span className="text-xs text-zinc-400">{recebe ? 'Valor recebido' : 'Valor pago'}</span>
            <span className="text-xl font-semibold text-primary tabular-nums">{formatarMoeda(deCentavos(total > 0n ? total : 0n))}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => liquidar.mutate()} disabled={!!erro || !(contaFixa || conta) || liquidar.isPending}>
            {liquidar.isPending && <Loader2 className="animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
