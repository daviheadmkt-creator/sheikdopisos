import { desescalar, dividirArredondando, escalar } from '@/features/produtos/regras'

/** Dias entre duas datas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const d1 = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  const d2 = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.round((d2 - d1) / 86_400_000)
}

/**
 * Encargos sugeridos por atraso: multa fixa (%) + juros simples pro rata dia (% ao mês / 30).
 * Só incidem após a carência. Retorna strings canônicas (2 casas).
 */
export function encargosAtraso(
  valorAberto: string,
  vencimento: string,
  dataPagamento: string,
  multaPerc: number,
  jurosMesPerc: number,
  carenciaDias = 0,
) {
  const dias = Math.max(0, diasEntre(vencimento, dataPagamento))
  if (dias <= carenciaDias || !valorAberto) return { dias, multa: '0.00', juros: '0.00' }
  const v = escalar(valorAberto, 2)
  const M = escalar(String(multaPerc), 2)
  const J = escalar(String(jurosMesPerc), 2)
  const multa = dividirArredondando(v * M, 10000n)
  const juros = dividirArredondando(v * J * BigInt(dias), 10000n * 30n)
  return { dias, multa: desescalar(multa, 2), juros: desescalar(juros, 2) }
}

/** Valor efetivamente movimentado: principal + juros − desconto (centavos). */
export function valorLiquidacao(principal: string, juros: string, desconto: string): bigint {
  return escalar(principal || '0', 2) + escalar(juros || '0', 2) - escalar(desconto || '0', 2)
}

/** Divide um valor em N parcelas (diferença na 1ª) — mesma regra do servidor (_criar_titulo). */
export function dividirParcelas(valor: string, n: number): string[] {
  const total = escalar(valor || '0', 2)
  const q = BigInt(Math.max(1, n))
  const base = total / q
  const resto = total - base * q
  return Array.from({ length: Number(q) }, (_, i) => desescalar(i === 0 ? base + resto : base, 2))
}
