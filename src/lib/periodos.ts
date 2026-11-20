import { dataLocalISO } from './format'

export type Preset = 'hoje' | '7d' | '30d' | 'mes' | 'mes_anterior' | 'ano'

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Mês atual' },
  { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'ano', label: 'Ano' },
]

export function periodoPreset(p: Preset, hoje = new Date()): { de: string; ate: string } {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const ate = dataLocalISO(h)
  switch (p) {
    case 'hoje':
      return { de: ate, ate }
    case '7d':
      return { de: dataLocalISO(h, -6), ate }
    case '30d':
      return { de: dataLocalISO(h, -29), ate }
    case 'mes':
      return { de: dataLocalISO(new Date(h.getFullYear(), h.getMonth(), 1)), ate }
    case 'mes_anterior':
      return { de: dataLocalISO(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: dataLocalISO(new Date(h.getFullYear(), h.getMonth(), 0)) }
    case 'ano':
      return { de: dataLocalISO(new Date(h.getFullYear(), 0, 1)), ate }
  }
}

/** Período imediatamente anterior, com o mesmo número de dias. */
export function periodoAnterior(de: string, ate: string) {
  const d1 = new Date(`${de}T12:00:00`)
  const d2 = new Date(`${ate}T12:00:00`)
  const dias = Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1
  return { de: dataLocalISO(d1, -dias), ate: dataLocalISO(d1, -1), dias }
}

/** Variação percentual (null quando não há base de comparação). */
export function variacaoPerc(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10
}
