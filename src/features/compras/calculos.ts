/**
 * Cálculos de compras (mesma regra das funções SQL de compras).
 * Custo unitário com 4 casas; valores monetários com 2 casas.
 */
import { addDays } from './datas'
import { desescalar, dividirArredondando, escalar } from '@/features/produtos/regras'
import { gerarParcelas } from '@/features/comercial/calculos'

export function valoresItemCompra(quantidade: string, custoUnitario: string, descontoPerc: string) {
  const q = escalar(quantidade || '0', 4)
  const c = escalar(custoUnitario || '0', 4)
  const d = escalar(descontoPerc || '0', 2)
  const bruto = dividirArredondando(q * c, 1_000_000n) // escala 1e8 → centavos
  const desconto = dividirArredondando(bruto * d, 10000n)
  return { bruto, desconto, total: bruto - desconto }
}

/** Custo unitário líquido do desconto (4 casas) — valor que entra no estoque. */
export function custoLiquido(custoUnitario: string, descontoPerc: string): string {
  const c = escalar(custoUnitario || '0', 4)
  const d = escalar(descontoPerc || '0', 2)
  return desescalar(dividirArredondando(c * (10000n - d), 10000n), 4)
}

/** Custo médio ponderado após uma entrada (4 casas). */
export function custoMedio(fisicoAtual: string, custoAtual: string, quantidade: string, custoEntrada: string): string {
  const F = escalar(fisicoAtual || '0', 4)
  const Ca = escalar(custoAtual || '0', 4)
  const Q = escalar(quantidade || '0', 4)
  const Cn = escalar(custoEntrada || '0', 4)
  if (F <= 0n || Ca === 0n) return desescalar(Cn, 4)
  if (F + Q === 0n) return desescalar(Ca, 4)
  return desescalar(dividirArredondando(F * Ca + Q * Cn, F + Q), 4)
}

export function totaisPedido(itens: { quantidade: string; custo_unitario: string; desconto_perc: string }[], frete: string) {
  let subtotal = 0n
  let desconto = 0n
  for (const i of itens) {
    const v = valoresItemCompra(i.quantidade, i.custo_unitario, i.desconto_perc)
    subtotal += v.bruto
    desconto += v.desconto
  }
  const f = escalar(frete || '0', 2)
  return { subtotal, desconto, frete: f, total: subtotal - desconto + f }
}

/** Previsão das parcelas a pagar (base para Contas a Pagar — Fase 5). */
export function previsaoParcelas(total: string, parcelas: number, dataBase: string, primeiroVencimentoDias: number, intervaloDias: number) {
  return gerarParcelas(total, parcelas, addDays(dataBase, primeiroVencimentoDias), intervaloDias)
}
