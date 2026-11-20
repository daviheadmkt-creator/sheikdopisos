import { baixarCsv, gerarCsv } from './csv'
import { formatarData, formatarMoeda, formatarNumero } from './format'

export type TipoColuna = 'texto' | 'moeda' | 'numero' | 'inteiro' | 'percentual' | 'data' | 'mes'

export interface ColunaRelatorio<T = Record<string, unknown>> {
  chave: keyof T & string
  titulo: string
  tipo: TipoColuna
  casas?: number
  /** soma (moeda/numero) ou média no rodapé */
  total?: 'soma' | 'media'
  largura?: number
  rotulos?: Record<string, string>
}

const vazio = (v: unknown) => v === null || v === undefined || v === ''

/** Texto exibido na tela e no PDF. */
export function formatarCelula(v: unknown, c: Pick<ColunaRelatorio, 'tipo' | 'casas' | 'rotulos'>): string {
  if (vazio(v)) return '—'
  if (c.rotulos && typeof v === 'string') return c.rotulos[v] ?? v
  switch (c.tipo) {
    case 'moeda':
      return formatarMoeda(v as number)
    case 'numero':
      return formatarNumero(v as number, c.casas ?? 2)
    case 'inteiro':
      return formatarNumero(v as number, 0)
    case 'percentual':
      return `${formatarNumero(v as number, c.casas ?? 1)}%`
    case 'data':
      return formatarData(`${String(v).slice(0, 10)}T12:00:00`)
    case 'mes': {
      const [a, m] = String(v).split('-')
      return `${m}/${a}`
    }
    default:
      return typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v)
  }
}

export function totalizar<T>(linhas: T[], c: ColunaRelatorio<T>): number | null {
  if (!c.total) return null
  const nums = linhas.map((l) => Number((l as Record<string, unknown>)[c.chave])).filter((n) => Number.isFinite(n))
  if (!nums.length) return 0
  // soma em centavos/milésimos inteiros para evitar acumular erro de ponto flutuante
  const escala = 10 ** (c.tipo === 'moeda' ? 2 : c.casas ?? 4)
  const soma = nums.reduce((s, n) => s + Math.round(n * escala), 0) / escala
  return c.total === 'soma' ? soma : Math.round((soma / nums.length) * escala) / escala
}

const nomeArquivo = (titulo: string, sufixo: string, ext: string) =>
  `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').toLowerCase()}_${sufixo}.${ext}`

export function exportarCsv<T>(titulo: string, sufixo: string, colunas: ColunaRelatorio<T>[], linhas: T[]) {
  const csv = gerarCsv(
    linhas,
    colunas.map((c) => ({
      titulo: c.titulo,
      valor: (l: T) => {
        const v = (l as Record<string, unknown>)[c.chave]
        if (vazio(v)) return null
        if (['moeda', 'numero', 'inteiro', 'percentual'].includes(c.tipo)) return Number(v)
        return formatarCelula(v, c)
      },
    })),
  )
  baixarCsv(nomeArquivo(titulo, sufixo, 'csv'), csv)
}

/** Excel (.xlsx) real, com tipos numéricos e formatos — biblioteca carregada sob demanda. */
export async function exportarExcel<T>(titulo: string, sufixo: string, colunas: ColunaRelatorio<T>[], linhas: T[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const formato = (c: ColunaRelatorio<T>) =>
    c.tipo === 'moeda' ? '#,##0.00' : c.tipo === 'inteiro' ? '0' : c.tipo === 'percentual' ? '0.0"%"' : c.tipo === 'numero' ? `#,##0.${'0'.repeat(c.casas ?? 2)}` : undefined
  const cabecalho = colunas.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const }))
  const corpo = linhas.map((l) =>
    colunas.map((c) => {
      const v = (l as Record<string, unknown>)[c.chave]
      if (vazio(v)) return null
      if (['moeda', 'numero', 'inteiro', 'percentual'].includes(c.tipo)) return { value: Number(v), type: Number, format: formato(c) }
      return { value: formatarCelula(v, c), type: String }
    }),
  )
  const temTotal = colunas.some((c) => c.total)
  const rodape = temTotal
    ? [colunas.map((c, i) => {
        const t = totalizar(linhas, c)
        if (t === null) return i === 0 ? { value: 'TOTAL', fontWeight: 'bold' as const } : null
        return { value: t, type: Number, format: formato(c), fontWeight: 'bold' as const }
      })]
    : []
  await writeXlsxFile([cabecalho, ...corpo, ...rodape], {
    sheet: titulo.slice(0, 31),
    columns: colunas.map((c) => ({ width: c.largura ?? (c.tipo === 'texto' ? 32 : 16) })),
    stickyRowsCount: 1,
  }).toFile(nomeArquivo(titulo, sufixo, 'xlsx'))
}
