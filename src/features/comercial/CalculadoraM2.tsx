import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { DecimalInput, Field } from '@/components/common/Field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarCanonico } from '@/lib/decimal'
import { formatarMoeda } from '@/lib/format'
import { calcularRevestimento, calcularValoresItem, deCentavos } from './calculos'

/** Calculadora rápida de revestimento (independe de produto cadastrado). */
export function CalculadoraM2({ sobraPadrao = '10.00' }: { sobraPadrao?: string }) {
  const [area, setArea] = useState('')
  const [sobra, setSobra] = useState(sobraPadrao)
  const [m2cx, setM2cx] = useState('')
  const [preco, setPreco] = useState('')

  const r = calcularRevestimento(area, sobra, m2cx)
  const total = r && preco ? deCentavos(calcularValoresItem(r.m2Coberto, preco, '0').total) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" /> Calculadora de revestimento
        </CardTitle>
        <CardDescription>Simule caixas e m² antes de lançar o item.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Área (m²)">
            <DecimalInput value={area} onChange={setArea} casas={2} />
          </Field>
          <Field label="Sobra (%)">
            <DecimalInput value={sobra} onChange={setSobra} casas={2} />
          </Field>
          <Field label="m² por caixa">
            <DecimalInput value={m2cx} onChange={setM2cx} casas={4} />
          </Field>
          <Field label="Preço por m²">
            <DecimalInput value={preco} onChange={setPreco} casas={2} prefixo="R$" />
          </Field>
        </div>
        <div className="rounded-xl bg-sidebar p-4 text-white">
          {r ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-zinc-400">Caixas</p>
                <p className="text-2xl font-semibold text-primary">{r.caixas}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">m² cobertos</p>
                <p className="text-2xl font-semibold">{formatarCanonico(r.m2Coberto, 2)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Área + sobra</p>
                <p>{formatarCanonico(r.areaComSobra, 2)} m²</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Excedente</p>
                <p>{formatarCanonico(r.excedente, 2)} m²</p>
              </div>
              {total && (
                <div className="col-span-2 border-t border-white/10 pt-2">
                  <p className="text-xs text-zinc-400">Total estimado</p>
                  <p className="text-lg font-semibold text-primary">{formatarMoeda(total)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-zinc-400">Informe a área e o m² por caixa.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
