import { normalizarCNPJ, somenteDigitos } from './validators/documento'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatarMoeda = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : moeda.format(Number(v))

export const formatarNumero = (v: number | string | null | undefined, casas = 2) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Number(v))

export function formatarDocumento(v: string | null | undefined): string {
  if (!v) return '—'
  const cpf = somenteDigitos(v)
  if (cpf.length === 11 && cpf === v) return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  const cnpj = normalizarCNPJ(v)
  if (cnpj.length === 14) return cnpj.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
  return v
}

/** Máscara progressiva enquanto o usuário digita CPF/CNPJ. */
export function mascararDocumento(v: string, tipo: 'PF' | 'PJ'): string {
  if (tipo === 'PF') {
    const d = somenteDigitos(v).slice(0, 11)
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  const c = normalizarCNPJ(v).slice(0, 14)
  return c
    .replace(/^(.{2})(.)/, '$1.$2')
    .replace(/^(.{2})\.(.{3})(.)/, '$1.$2.$3')
    .replace(/^(.{2})\.(.{3})\.(.{3})(.)/, '$1.$2.$3/$4')
    .replace(/\/(.{4})(.{1,2})$/, '/$1-$2')
}

export function formatarTelefone(v: string | null | undefined): string {
  const d = somenteDigitos(v)
  if (!d) return '—'
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return d
}

export function mascararTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function mascararCEP(v: string): string {
  const d = somenteDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export const formatarData = (v: string | null | undefined, comHora = false) =>
  v
    ? new Intl.DateTimeFormat('pt-BR', comHora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(
        new Date(v),
      )
    : '—'

/** Data local no formato AAAA-MM-DD (evita o deslocamento de fuso do toISOString). */
export function dataLocalISO(d = new Date(), somarDias = 0) {
  const x = new Date(d)
  x.setDate(x.getDate() + somarDias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

export const iniciais =(nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
