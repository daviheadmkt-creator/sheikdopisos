import { deCentavos } from '@/features/comercial/calculos'
import { custoLiquido, custoMedio, previsaoParcelas, totaisPedido, valoresItemCompra } from './calculos'

describe('valores de item de compra (custo com 4 casas)', () => {
  it('144 m² × R$ 38,4567 com 3% de desconto', () => {
    const v = valoresItemCompra('144', '38.4567', '3')
    expect(deCentavos(v.bruto)).toBe('5537.76') // 5537,7648
    expect(deCentavos(v.desconto)).toBe('166.13') // 166,1328
    expect(deCentavos(v.total)).toBe('5371.63')
  })
  it('custo líquido de desconto com 4 casas', () => {
    expect(custoLiquido('38.4567', '3')).toBe('37.3030') // 37,302999
    expect(custoLiquido('10', '')).toBe('10.0000')
  })
})

describe('custo médio ponderado', () => {
  it('pondera estoque atual e entrada', () => {
    // 100 m² a R$ 40 + 50 m² a R$ 46 = R$ 42
    expect(custoMedio('100', '40', '50', '46')).toBe('42.0000')
  })
  it('sem estoque anterior assume o custo da entrada', () => {
    expect(custoMedio('0', '40', '50', '46')).toBe('46.0000')
    expect(custoMedio('100', '0', '50', '46')).toBe('46.0000')
  })
  it('arredonda com 4 casas', () => {
    expect(custoMedio('3', '10', '7', '11.1111')).toBe('10.7778') // 107,7777/10
  })
})

describe('totais e parcelas do pedido', () => {
  it('soma itens e frete', () => {
    const t = totaisPedido(
      [
        { quantidade: '144', custo_unitario: '38.4567', desconto_perc: '3' },
        { quantidade: '20', custo_unitario: '21.5', desconto_perc: '' },
      ],
      '350',
    )
    expect(deCentavos(t.total)).toBe('6151.63')
  })
  it('parcelas 30/60/90 a partir da data base', () => {
    const p = previsaoParcelas('1000.00', 3, '2026-11-19', 30, 30)
    expect(p.map((x) => x.vencimento)).toEqual(['2026-12-19', '2027-01-18', '2027-02-17'])
    expect(p.map((x) => x.valor)).toEqual(['333.34', '333.33', '333.33'])
  })
})
