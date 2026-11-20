import { Plus, Trash2, Wand2 } from 'lucide-react'
import { DecimalInput, Field } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { dataLocalISO, formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import { centavos, deCentavos, gerarParcelas } from './calculos'
import { FORMAS_PAGAMENTO, LISTA_FORMAS, type FormaPagamento, type PagamentoForm } from './tipos'

export const novoPagamento = (forma: FormaPagamento, valor: string): PagamentoForm => ({
  forma,
  valor,
  parcelas: '1',
  primeiro_vencimento: FORMAS_PAGAMENTO[forma].prazo ? dataLocalISO(new Date(), 30) : '',
  intervalo_dias: '30',
  observacao: '',
})

export function somaPagamentos(p: PagamentoForm[]) {
  return p.reduce((s, x) => s + centavos(x.valor), 0n)
}

export function PagamentosEditor({
  pagamentos,
  onChange,
  totalCentavos,
  editavel = true,
}: {
  pagamentos: PagamentoForm[]
  onChange: (p: PagamentoForm[]) => void
  totalCentavos: bigint
  editavel?: boolean
}) {
  const pago = somaPagamentos(pagamentos)
  const falta = totalCentavos - pago
  const atualizar = (i: number, parcial: Partial<PagamentoForm>) => onChange(pagamentos.map((p, j) => (j === i ? { ...p, ...parcial } : p)))

  return (
    <div className="space-y-3">
      {editavel && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([novoPagamento('pix', deCentavos(totalCentavos))])}>
            À vista (PIX)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([novoPagamento('dinheiro', deCentavos(totalCentavos))])}>
            À vista (dinheiro)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([{ ...novoPagamento('cartao_credito', deCentavos(totalCentavos)), parcelas: '3' }])}>
            Cartão 3x
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...pagamentos, novoPagamento('pix', falta > 0n ? deCentavos(falta) : '')])}>
            <Plus /> Forma de pagamento
          </Button>
        </div>
      )}

      {pagamentos.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma forma de pagamento informada.</p>}

      {pagamentos.map((p, i) => {
        const info = FORMAS_PAGAMENTO[p.forma]
        const n = Number(p.parcelas || '1')
        const parcelas = info.parcelavel && n > 1 && p.valor ? gerarParcelas(p.valor, n, p.primeiro_vencimento || dataLocalISO(new Date(), 30), Number(p.intervalo_dias || '30')) : []
        return (
          <fieldset key={i} disabled={!editavel} className="rounded-xl border bg-background/50 p-3">
            <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_90px_1fr_auto] sm:items-end">
              <Field label="Forma">
                <NativeSelect
                  value={p.forma}
                  onChange={(e) => {
                    const f = e.target.value as FormaPagamento
                    atualizar(i, { forma: f, parcelas: FORMAS_PAGAMENTO[f].parcelavel ? p.parcelas : '1', primeiro_vencimento: FORMAS_PAGAMENTO[f].prazo ? p.primeiro_vencimento || dataLocalISO(new Date(), 30) : '' })
                  }}
                >
                  {LISTA_FORMAS.map((f) => (
                    <option key={f} value={f}>
                      {FORMAS_PAGAMENTO[f].label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Valor">
                <div className="flex gap-1">
                  <DecimalInput value={p.valor} onChange={(v) => atualizar(i, { valor: v })} casas={2} prefixo="R$" />
                  {editavel && falta !== 0n && (
                    <Button type="button" variant="ghost" size="icon" title="Completar com o restante" onClick={() => atualizar(i, { valor: deCentavos(centavos(p.valor) + falta) })}>
                      <Wand2 />
                    </Button>
                  )}
                </div>
              </Field>
              <Field label="Parcelas">
                <Input inputMode="numeric" value={p.parcelas} disabled={!info.parcelavel} onChange={(e) => atualizar(i, { parcelas: e.target.value.replace(/\D/g, '').slice(0, 2) || '1' })} />
              </Field>
              <Field label={info.prazo ? '1º vencimento' : 'Observação'}>
                {info.prazo ? (
                  <Input type="date" value={p.primeiro_vencimento} onChange={(e) => atualizar(i, { primeiro_vencimento: e.target.value })} />
                ) : (
                  <Input value={p.observacao} onChange={(e) => atualizar(i, { observacao: e.target.value })} placeholder="Ex.: NSU, bandeira" />
                )}
              </Field>
              {editavel && (
                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onChange(pagamentos.filter((_, j) => j !== i))} aria-label="Remover forma">
                  <Trash2 />
                </Button>
              )}
            </div>
            {parcelas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {parcelas.map((x) => (
                  <span key={x.numero} className="rounded-md bg-secondary px-2 py-1 tabular-nums">
                    {x.numero}/{parcelas.length} · {info.prazo ? `${formatarData(`${x.vencimento}T12:00:00`)} · ` : ''}
                    {formatarMoeda(x.valor)}
                  </span>
                ))}
              </div>
            )}
          </fieldset>
        )
      })}

      <div className={cn('flex flex-wrap justify-between gap-2 rounded-lg px-4 py-2.5 text-sm', falta === 0n ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
        <span>Pagamentos: {formatarMoeda(deCentavos(pago))}</span>
        <span className="font-semibold">
          {falta === 0n ? 'Pagamento fechado' : falta > 0n ? `Falta ${formatarMoeda(deCentavos(falta))}` : `Excede ${formatarMoeda(deCentavos(-falta))}`}
        </span>
      </div>
    </div>
  )
}
