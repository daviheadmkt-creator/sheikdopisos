import { deCentavos } from '@/features/comercial/calculos'
import { diasEntre, dividirParcelas, encargosAtraso, valorLiquidacao } from './calculos'

describe('encargos por atraso', () => {
  it('multa 2% + juros 1% a.m. pro rata (15 dias sobre R$ 1.000)', () => {
    expect(encargosAtraso('1000.00', '2026-11-01', '2026-11-16', 2, 1)).toEqual({ dias: 15, multa: '20.00', juros: '5.00' })
  })
  it('sem encargos em dia ou dentro da carência', () => {
    expect(encargosAtraso('1000.00', '2026-11-20', '2026-11-19', 2, 1)).toEqual({ dias: 0, multa: '0.00', juros: '0.00' })
    expect(encargosAtraso('1000.00', '2026-11-15', '2026-11-18', 2, 1, 5).multa).toBe('0.00')
  })
  it('arredonda juros em centavos', () => {
    // 333,33 × 1% × 7/30 = 0,7777 → 0,78
    expect(encargosAtraso('333.33', '2026-11-01', '2026-11-08', 0, 1).juros).toBe('0.78')
  })
})

describe('liquidação e parcelas', () => {
  it('valor movimentado = principal + juros − desconto', () => {
    expect(deCentavos(valorLiquidacao('500', '12.5', '2.5'))).toBe('510.00')
  })
  it('divide parcelas com diferença na primeira (igual ao servidor)', () => {
    expect(dividirParcelas('100.00', 3)).toEqual(['33.34', '33.33', '33.33'])
    expect(dividirParcelas('99.99', 1)).toEqual(['99.99'])
  })
  it('conta dias atravessando meses e anos', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3)
  })
})
