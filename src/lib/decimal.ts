/**
 * Valores decimais trafegam como string canônica ("1234.5600") entre formulário e banco,
 * evitando erros de ponto flutuante. O Postgres converte a string para NUMERIC.
 */
const CANONICO = /^\d+(\.\d+)?$/

export const ehDecimalCanonico = (v: string) => CANONICO.test(v)

/** Converte os dígitos digitados (máscara "da direita para a esquerda") em string canônica. */
export function digitosParaCanonico(entrada: string, casas: number): string {
  const d = entrada.replace(/\D/g, '').replace(/^0+/, '')
  if (!d) return ''
  const preenchido = d.padStart(casas + 1, '0')
  const inteiro = preenchido.slice(0, preenchido.length - casas)
  const decimais = preenchido.slice(preenchido.length - casas)
  return casas > 0 ? `${inteiro}.${decimais}` : inteiro
}

/** Formata uma string canônica no padrão brasileiro (1.234,56). */
export function formatarCanonico(v: string, casas: number): string {
  if (!v) return ''
  const [inteiro, dec = ''] = v.split('.')
  const intFmt = inteiro.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return casas > 0 ? `${intFmt},${dec.padEnd(casas, '0').slice(0, casas)}` : intFmt
}

/** Converte valor vindo do banco (number ou string) em string canônica com N casas. */
export function paraCanonico(v: number | string | null | undefined, casas: number): string {
  if (v === null || v === undefined || v === '') return ''
  const s = String(v)
  if (!/^-?\d+(\.\d+)?$/.test(s)) return ''
  const [inteiro, dec = ''] = s.split('.')
  if (casas === 0) return inteiro
  return `${inteiro}.${dec.padEnd(casas, '0').slice(0, casas)}`
}

/** Uso apenas para exibição/indicadores; nunca para persistir. */
export const canonicoParaNumero = (v: string) => (v ? Number(v) : 0)
