export const somenteDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/** Normaliza CNPJ (numérico ou alfanumérico): remove pontuação e converte para maiúsculas. */
export const normalizarCNPJ = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

export function validarCPF(valor: string): boolean {
  const c = somenteDigitos(valor)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (len: number) => {
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(c[i]) * (len + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/**
 * Valida CNPJ numérico e alfanumérico (IN RFB 2.229/2024, vigente desde julho/2026).
 * Cada caractere vale (código ASCII - 48); os dois dígitos verificadores são numéricos.
 */
export function validarCNPJ(valor: string): boolean {
  const c = normalizarCNPJ(valor)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false
  const v = (ch: string) => ch.charCodeAt(0) - 48
  const dv = (len: number) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < len; i++) soma += v(c[i]) * pesos[i]
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}

/** Valida código de barras GTIN-8/12/13/14 pelo dígito verificador. */
export function validarGTIN(valor: string): boolean {
  const c = somenteDigitos(valor)
  if (![8, 12, 13, 14].includes(c.length) || c !== valor.trim()) return false
  const corpo = c.slice(0, -1)
  let soma = 0
  for (let i = 0; i < corpo.length; i++) {
    const peso = (corpo.length - i) % 2 === 1 ? 3 : 1
    soma += Number(corpo[i]) * peso
  }
  return (10 - (soma % 10)) % 10 === Number(c[c.length - 1])
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const
