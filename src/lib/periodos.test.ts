import { formatarCelula, totalizar } from './exportacao'
import { periodoAnterior, periodoPreset, variacaoPerc } from './periodos'

const ref = new Date(2026, 10, 19) // 19/11/2026

describe('períodos', () => {
  it('presets', () => {
    expect(periodoPreset('hoje', ref)).toEqual({ de: '2026-11-19', ate: '2026-11-19' })
    expect(periodoPreset('7d', ref)).toEqual({ de: '2026-11-13', ate: '2026-11-19' })
    expect(periodoPreset('mes', ref)).toEqual({ de: '2026-11-01', ate: '2026-11-19' })
    expect(periodoPreset('mes_anterior', ref)).toEqual({ de: '2026-10-01', ate: '2026-10-31' })
    expect(periodoPreset('ano', ref)).toEqual({ de: '2026-01-01', ate: '2026-11-19' })
  })
  it('período anterior com o mesmo tamanho', () => {
    expect(periodoAnterior('2026-11-01', '2026-11-19')).toEqual({ de: '2026-10-13', ate: '2026-10-31', dias: 19 })
  })
  it('variação percentual', () => {
    expect(variacaoPerc(1500, 1000)).toBe(50)
    expect(variacaoPerc(800, 1000)).toBe(-20)
    expect(variacaoPerc(100, 0)).toBeNull()
  })
})

describe('células e totais de relatório', () => {
  it('formata por tipo', () => {
    expect(formatarCelula(1234.5, { tipo: 'moeda' })).toMatch(/1\.234,50/)
    expect(formatarCelula(12.345, { tipo: 'percentual' })).toBe('12,3%')
    expect(formatarCelula('2026-11', { tipo: 'mes' })).toBe('11/2026')
    expect(formatarCelula(null, { tipo: 'texto' })).toBe('—')
    expect(formatarCelula('A', { tipo: 'texto', rotulos: { A: 'Classe A' } })).toBe('Classe A')
  })
  it('soma moedas sem erro de ponto flutuante', () => {
    const linhas = [{ v: 0.1 }, { v: 0.2 }, { v: 0.3 }]
    expect(totalizar(linhas, { chave: 'v', titulo: 'V', tipo: 'moeda', total: 'soma' })).toBe(0.6)
    expect(totalizar(linhas, { chave: 'v', titulo: 'V', tipo: 'moeda', total: 'media' })).toBe(0.2)
    expect(totalizar(linhas, { chave: 'v', titulo: 'V', tipo: 'moeda' })).toBeNull()
  })
})
