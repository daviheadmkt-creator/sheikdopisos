import {
  calcularRevestimento,
  calcularValoresItem,
  deCentavos,
  gerarParcelas,
  percentualDescontoTotal,
  quantidadeEfetiva,
  totaisDocumento,
  type ItemCalculavel,
} from './calculos'

describe('cálculo de revestimento (m² → caixas)', () => {
  it('20 m² com 10% de sobra e caixa de 1,44 m² = 16 caixas (23,04 m²)', () => {
    expect(calcularRevestimento('20', '10', '1.44')).toEqual({
      areaComSobra: '22.0000',
      caixas: 16,
      m2Coberto: '23.0400',
      excedente: '3.0400',
    })
  })
  it('área exata sem sobra não acrescenta caixa', () => {
    expect(calcularRevestimento('14.4', '0', '1.44')?.caixas).toBe(10)
  })
  it('arredonda sempre para cima, mesmo por fração mínima', () => {
    expect(calcularRevestimento('14.4001', '0', '1.44')?.caixas).toBe(11)
  })
  it('caixa de 1,7258 m²: 10 m² + 5% = 7 caixas (12,0806 m²)', () => {
    const r = calcularRevestimento('10', '5', '1.7258')
    expect(r?.caixas).toBe(7)
    expect(r?.m2Coberto).toBe('12.0806')
  })
  it('retorna null sem área ou m²/caixa', () => {
    expect(calcularRevestimento('', '10', '1.44')).toBeNull()
    expect(calcularRevestimento('10', '10', '')).toBeNull()
  })
})

describe('valores do item', () => {
  it('23,04 m² × R$ 89,90 com 5% de desconto', () => {
    const v = calcularValoresItem('23.04', '89.90', '5')
    expect(deCentavos(v.bruto)).toBe('2071.30') // 2071,296
    expect(deCentavos(v.desconto)).toBe('103.57') // 103,565 → meio para cima
    expect(deCentavos(v.total)).toBe('1967.73')
  })
  it('sem desconto', () => {
    expect(deCentavos(calcularValoresItem('3', '42.50', '').total)).toBe('127.50')
  })
})

const item = (o: Partial<ItemCalculavel>): ItemCalculavel => ({
  eh_revestimento: false,
  unidade: 'UN',
  m2_por_caixa: '',
  area_m2: '',
  perc_sobra: '0',
  quantidade: '',
  preco_unitario: '0',
  desconto_perc: '0',
  ...o,
})

describe('quantidade efetiva e totais', () => {
  it('revestimento vendido em m² usa o m² coberto', () => {
    const r = quantidadeEfetiva(item({ eh_revestimento: true, unidade: 'M2', m2_por_caixa: '1.44', area_m2: '20', perc_sobra: '10' }))
    expect(r.quantidade).toBe('23.0400')
    expect(r.caixas).toBe(16)
  })
  it('revestimento vendido em caixa usa o número de caixas', () => {
    const r = quantidadeEfetiva(item({ eh_revestimento: true, unidade: 'CX', m2_por_caixa: '1.44', area_m2: '20', perc_sobra: '10' }))
    expect(r.quantidade).toBe('16')
  })
  it('soma itens, descontos e frete', () => {
    const t = totaisDocumento(
      [
        item({ eh_revestimento: true, unidade: 'M2', m2_por_caixa: '1.44', area_m2: '20', perc_sobra: '10', preco_unitario: '89.90', desconto_perc: '5' }),
        item({ unidade: 'SC', quantidade: '4', preco_unitario: '32.90' }),
      ],
      '150',
    )
    expect(deCentavos(t.subtotal)).toBe('2202.90')
    expect(deCentavos(t.desconto)).toBe('103.57')
    expect(deCentavos(t.total)).toBe('2249.33')
    expect(percentualDescontoTotal(t.subtotal, t.desconto)).toBe('4.70')
  })
})

describe('parcelas', () => {
  it('distribui centavos residuais na primeira parcela', () => {
    const p = gerarParcelas('100.00', 3, '2026-12-10', 30)
    expect(p.map((x) => x.valor)).toEqual(['33.34', '33.33', '33.33'])
    expect(p.map((x) => x.vencimento)).toEqual(['2026-12-10', '2027-01-09', '2027-02-08'])
  })
})
