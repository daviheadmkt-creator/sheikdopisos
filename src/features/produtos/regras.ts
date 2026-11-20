/**
 * Regras de negócio de produtos, independentes da interface.
 * Cálculos feitos em inteiros escalados para evitar erros de ponto flutuante.
 */

/** Converte string canônica para inteiro escalado por 10^casas (ex.: "2.16", 4 -> 21600n). */
export function escalar(v: string, casas: number): bigint {
  if (!v) return 0n
  const [i, d = ''] = v.split('.')
  return BigInt(i + d.padEnd(casas, '0').slice(0, casas))
}

/** Formata inteiro escalado de volta para string canônica. */
export function desescalar(v: bigint, casas: number): string {
  const neg = v < 0n
  const s = (neg ? -v : v).toString().padStart(casas + 1, '0')
  const r = casas ? `${s.slice(0, -casas)}.${s.slice(-casas)}` : s
  return neg ? `-${r}` : r
}

/**
 * m² por caixa calculado a partir das dimensões da peça (cm) e peças por caixa.
 * Resultado com 4 casas decimais, arredondado meio-para-cima.
 */
export function m2PorCaixaPorDimensoes(larguraCm: string, comprimentoCm: string, pecas: string): string | null {
  if (!larguraCm || !comprimentoCm || !pecas) return null
  const l = escalar(larguraCm, 2) // cm * 100
  const c = escalar(comprimentoCm, 2)
  const p = BigInt(pecas)
  if (l <= 0n || c <= 0n || p <= 0n) return null
  // área em cm² escalada por 10^4  -> m² = cm² / 10^4 ; queremos m² com 4 casas => cm² (escala 10^4) / 10^4
  // l*c tem escala 10^4 (cm²); m² com 4 casas = (l*c*p) / 10^4 (para converter cm²→m²) e mantém escala 10^4.
  const areaEscalada = l * c * p // cm² * 10^4
  const m2x10000 = (areaEscalada + 5000n) / 10000n // m² * 10^4, arredondado
  return desescalar(m2x10000, 4)
}

/** Divisão inteira com arredondamento meio-para-longe-de-zero (d > 0). */
export function dividirArredondando(n: bigint, d: bigint): bigint {
  return n >= 0n ? (2n * n + d) / (2n * d) : -((-2n * n + d) / (2n * d))
}

/** Margem bruta sobre o preço de venda, em % com 2 casas. null se preço for zero. */
export function margemPercentual(custo: string, preco: string): string | null {
  const c = escalar(custo || '0', 4)
  const p = escalar(preco || '0', 4)
  if (p === 0n) return null
  return desescalar(dividirArredondando((p - c) * 10000n, p), 2)
}

/** Markup sobre o custo, em % com 2 casas. null se custo for zero. */
export function markupPercentual(custo: string, preco: string): string | null {
  const c = escalar(custo || '0', 4)
  const p = escalar(preco || '0', 4)
  if (c === 0n) return null
  return desescalar(dividirArredondando((p - c) * 10000n, c), 2)
}
