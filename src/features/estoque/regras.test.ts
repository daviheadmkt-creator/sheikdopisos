import { caixasParaQuantidade, descreverCaixas, quantidadeEmCaixas, TIPOS_MOVIMENTACAO } from './regras'

describe('conversão caixas ↔ m²', () => {
  it('converte caixas em m² sem perda', () => {
    expect(caixasParaQuantidade('10', '1.4400')).toBe('14.4000')
    expect(caixasParaQuantidade('3', '1.7258')).toBe('5.1774')
    expect(caixasParaQuantidade('0', '1.4400')).toBe('')
    expect(caixasParaQuantidade('2,5', '1.4400')).toBe('')
  })

  it('decompõe m² em caixas inteiras e sobra', () => {
    expect(quantidadeEmCaixas('14.4', '1.44')).toEqual({ caixas: 10n, resto: '0.0000', exato: true })
    expect(quantidadeEmCaixas('15.12', '1.44')).toEqual({ caixas: 10n, resto: '0.7200', exato: false })
    expect(quantidadeEmCaixas('1', '')).toBeNull()
  })

  it('descreve quantidades para exibição', () => {
    expect(descreverCaixas(14.4, 1.44)).toBe('10 cx')
    expect(descreverCaixas(15.12, 1.44)).toBe('10 cx + 0,7200 m²')
    expect(descreverCaixas(5, null)).toBe('')
  })
})

describe('tipos de movimentação', () => {
  it('transferência exige origem e destino e não altera o físico total', () => {
    const t = TIPOS_MOVIMENTACAO.transferencia
    expect(t.origem && t.destino).toBe(true)
    expect(t.sinal).toBe(0)
  })
  it('ajustes, avarias e devoluções exigem motivo', () => {
    for (const k of ['ajuste_entrada', 'ajuste_saida', 'avaria', 'baixa_avaria', 'devolucao'] as const) {
      expect(TIPOS_MOVIMENTACAO[k].motivoObrigatorio).toBe(true)
    }
  })
})
