// Assinatura das mensagens da loja virtual (plugin "Sheik ERP Conector" → /api/loja-webhook).
// HMAC-SHA256 em hexadecimal sobre "<timestamp>.<corpo bruto>", com a chave compartilhada
// LOJA_WEBHOOK_SECRET. O timestamp (segundos) limita a reutilização de uma mensagem capturada.
// Uso exclusivo no servidor (Node).
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Tolerância de relógio entre a loja e o ERP, em segundos. */
export const TOLERANCIA_SEGUNDOS = 300

export function assinarLoja(chave: string, timestamp: string, corpo: string): string {
  return createHmac('sha256', chave).update(`${timestamp}.${corpo}`, 'utf8').digest('hex')
}

export type ResultadoAssinatura = { ok: true } | { ok: false; motivo: string }

export function verificarAssinaturaLoja(
  chave: string,
  timestamp: string | null,
  assinatura: string | null,
  corpo: string,
  agoraSegundos = Math.floor(Date.now() / 1000),
): ResultadoAssinatura {
  if (!chave || chave.length < 32) return { ok: false, motivo: 'chave do servidor não configurada' }
  if (!timestamp || !/^\d{9,11}$/.test(timestamp)) return { ok: false, motivo: 'timestamp ausente' }
  if (Math.abs(agoraSegundos - Number(timestamp)) > TOLERANCIA_SEGUNDOS) return { ok: false, motivo: 'mensagem expirada' }
  if (!assinatura || !/^[0-9a-f]{64}$/i.test(assinatura)) return { ok: false, motivo: 'assinatura ausente' }

  const esperada = Buffer.from(assinarLoja(chave, timestamp, corpo), 'hex')
  const recebida = Buffer.from(assinatura.toLowerCase(), 'hex')
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida)
    ? { ok: true }
    : { ok: false, motivo: 'assinatura inválida' }
}
