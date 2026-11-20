export interface ColunaCsv<T> {
  titulo: string
  valor: (linha: T) => string | number | null | undefined
}

const escapar = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Gera CSV no padrão do Excel brasileiro: separador ";" e decimais com vírgula. */
export function gerarCsv<T>(linhas: T[], colunas: ColunaCsv<T>[]): string {
  const cab = colunas.map((c) => escapar(c.titulo)).join(';')
  const corpo = linhas.map((l) =>
    colunas
      .map((c) => {
        const v = c.valor(l)
        if (v === null || v === undefined) return ''
        if (typeof v === 'number') return String(v).replace('.', ',')
        return escapar(v)
      })
      .join(';'),
  )
  return [cab, ...corpo].join('\r\n')
}

/** Baixa o CSV com BOM UTF-8 (acentos corretos no Excel). */
export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
