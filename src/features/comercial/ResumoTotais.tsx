import { DecimalInput, Field } from '@/components/common/Field'
import { formatarCanonico } from '@/lib/decimal'
import { formatarMoeda } from '@/lib/format'
import { deCentavos, percentualDescontoTotal } from './calculos'

export function ResumoTotais({
  subtotal,
  desconto,
  total,
  frete,
  onFrete,
  editavel,
  descontoLimite,
}: {
  subtotal: bigint
  desconto: bigint
  total: bigint
  frete: string
  onFrete: (v: string) => void
  editavel: boolean
  descontoLimite: number
}) {
  const perc = percentualDescontoTotal(subtotal, desconto)
  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">{formatarMoeda(deCentavos(subtotal))}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Descontos ({formatarCanonico(perc, 2)}%)</span>
        <span className="tabular-nums text-destructive">− {formatarMoeda(deCentavos(desconto))}</span>
      </div>
      {Number(perc) > descontoLimite && (
        <p className="rounded-md bg-primary/10 px-2 py-1 text-xs text-[#7a5c0f]">Desconto acima de {descontoLimite}%: exige aprovação de gerente.</p>
      )}
      <Field label="Frete">
        <DecimalInput value={frete} onChange={onFrete} casas={2} prefixo="R$" disabled={!editavel} />
      </Field>
      <div className="flex items-end justify-between border-t pt-3">
        <span className="font-medium">Total</span>
        <span className="text-2xl font-semibold tabular-nums">{formatarMoeda(deCentavos(total))}</span>
      </div>
    </div>
  )
}
