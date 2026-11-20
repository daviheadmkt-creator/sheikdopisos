/**
 * Cálculos comerciais em aritmética inteira (BigInt) — mesma regra da função SQL
 * public.calcular_item_comercial. Arredondamento: meio para longe de zero (igual ao round do PostgreSQL).
 */
import { desescalar, dividirArredondando, escalar } from '@/features/produtos/regras'

export interface ResultadoRevestimento {
  /** área solicitada acrescida da sobra (m², 4 casas) */
  areaComSobra: string
  /** caixas inteiras necessárias (arredondadas para cima) */
  caixas: number
  /** m² efetivamente coberto pelas caixas (4 casas) */
  m2Coberto: string
  /** m² excedente em relação à área solicitada (4 casas) */
  excedente: string
}

/** caixas = teto(área × (1 + sobra%) ÷ m²/caixa) */
export function calcularRevestimento(area: string, percSobra: string, m2PorCaixa: string): ResultadoRevestimento | null {
  const A = escalar(area || '0', 4)
  const S = escalar(percSobra || '0', 2)
  const M = escalar(m2PorCaixa || '0', 4)
  if (A <= 0n || M <= 0n || S < 0n) return null
  const numerador = A * (10000n + S) // escala 1e8
  const denominador = 10000n * M // escala 1e8
  const caixas = (numerador + denominador - 1n) / denominador
  const coberto = caixas * M
  return {
    areaComSobra: desescalar(dividirArredondando(numerador, 10000n), 4),
    caixas: Number(caixas),
    m2Coberto: desescalar(coberto, 4),
    excedente: desescalar(coberto - A, 4),
  }
}

export interface ValoresItem {
  bruto: bigint
  desconto: bigint
  total: bigint
}

/** Valores do item em centavos: bruto = round(qtd × preço, 2); desconto = round(bruto × %/100, 2). */
export function calcularValoresItem(quantidade: string, precoUnitario: string, descontoPerc: string): ValoresItem {
  const q = escalar(quantidade || '0', 4)
  const p = escalar(precoUnitario || '0', 2)
  const d = escalar(descontoPerc || '0', 2)
  const bruto = dividirArredondando(q * p, 10000n)
  const desconto = dividirArredondando(bruto * d, 10000n)
  return { bruto, desconto, total: bruto - desconto }
}

export interface ItemCalculavel {
  eh_revestimento: boolean
  unidade: string
  m2_por_caixa: string
  area_m2: string
  perc_sobra: string
  quantidade: string
  preco_unitario: string
  desconto_perc: string
}

/** Quantidade efetiva do item (quando informada a área, deriva das caixas). */
export function quantidadeEfetiva(item: ItemCalculavel): { quantidade: string; caixas: number | null; calc: ResultadoRevestimento | null } {
  if (item.eh_revestimento && item.area_m2 && item.m2_por_caixa) {
    const calc = calcularRevestimento(item.area_m2, item.perc_sobra, item.m2_por_caixa)
    if (calc) return { quantidade: item.unidade === 'CX' ? String(calc.caixas) : calc.m2Coberto, caixas: calc.caixas, calc }
  }
  let caixas: number | null = null
  if (item.eh_revestimento && item.m2_por_caixa && item.quantidade && item.unidade !== 'CX') {
    const M = escalar(item.m2_por_caixa, 4)
    const Q = escalar(item.quantidade, 4)
    if (M > 0n) caixas = Number((Q + M - 1n) / M)
  }
  return { quantidade: item.quantidade, caixas, calc: null }
}

export function totaisDocumento(itens: ItemCalculavel[], frete: string) {
  let subtotal = 0n
  let desconto = 0n
  for (const i of itens) {
    const v = calcularValoresItem(quantidadeEfetiva(i).quantidade, i.preco_unitario, i.desconto_perc)
    subtotal += v.bruto
    desconto += v.desconto
  }
  const f = escalar(frete || '0', 2)
  return { subtotal, desconto, frete: f, total: subtotal - desconto + f }
}

/** Maior desconto percentual entre os itens e desconto total sobre o bruto (para alerta de aprovação). */
export function percentualDescontoTotal(subtotal: bigint, desconto: bigint): string {
  if (subtotal === 0n) return '0.00'
  return desescalar(dividirArredondando(desconto * 10000n, subtotal), 2)
}

export const centavos = (v: string) => escalar(v || '0', 2)
export const deCentavos = (c: bigint) => desescalar(c, 2)

export interface Parcela {
  numero: number
  vencimento: string
  valor: string
}

/** Divide o valor em parcelas iguais; a diferença de centavos vai para a 1ª parcela. */
export function gerarParcelas(valor: string, quantidade: number, primeiroVencimento: string, intervaloDias: number): Parcela[] {
  const total = centavos(valor)
  const n = BigInt(Math.max(1, quantidade))
  const base = total / n
  const resto = total - base * n
  const inicio = primeiroVencimento ? new Date(`${primeiroVencimento}T12:00:00`) : new Date()
  return Array.from({ length: Number(n) }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(d.getDate() + i * intervaloDias)
    const p = (x: number) => String(x).padStart(2, '0')
    return {
      numero: i + 1,
      vencimento: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      valor: deCentavos(i === 0 ? base + resto : base),
    }
  })
}
