import { desescalar, escalar, m2PorCaixaPorDimensoes, margemPercentual, markupPercentual } from './regras'

describe('escala decimal', () => {
  it('ida e volta sem perda', () => {
    expect(escalar('2.16', 4)).toBe(21600n)
    expect(desescalar(21600n, 4)).toBe('2.1600')
    expect(desescalar(5n, 2)).toBe('0.05')
    expect(escalar('', 2)).toBe(0n)
  })
})

describe('m² por caixa', () => {
  it('porcelanato 60x60 com 4 peças = 1,44 m²', () => {
    expect(m2PorCaixaPorDimensoes('60.00', '60.00', '4')).toBe('1.4400')
  })
  it('porcelanato 90x90 com 2 peças = 1,62 m²', () => {
    expect(m2PorCaixaPorDimensoes('90.00', '90.00', '2')).toBe('1.6200')
  })
  it('revestimento 32,5x59 com 9 peças = 1,7258 m² (arredondado)', () => {
    // 32,5 * 59 = 1917,5 cm² ; * 9 = 17257,5 cm² = 1,72575 m² -> 1,7258
    expect(m2PorCaixaPorDimensoes('32.50', '59.00', '9')).toBe('1.7258')
  })
  it('retorna null com dados incompletos', () => {
    expect(m2PorCaixaPorDimensoes('', '60.00', '4')).toBeNull()
    expect(m2PorCaixaPorDimensoes('60.00', '60.00', '')).toBeNull()
  })
})

describe('margem e markup', () => {
  it('calcula margem sobre o preço', () => {
    expect(margemPercentual('60.0000', '100.00')).toBe('40.00')
    expect(margemPercentual('0.1000', '0.30')).toBe('66.67')
  })
  it('calcula markup sobre o custo', () => {
    expect(markupPercentual('60.0000', '100.00')).toBe('66.67')
  })
  it('margem negativa quando preço < custo', () => {
    expect(margemPercentual('120.0000', '100.00')).toBe('-20.00')
  })
  it('sem preço ou custo retorna null', () => {
    expect(margemPercentual('10.0000', '')).toBeNull()
    expect(markupPercentual('', '10.00')).toBeNull()
  })
})
