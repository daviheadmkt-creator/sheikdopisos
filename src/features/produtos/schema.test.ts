import { produtoParaPayload, produtoSchema, produtoVazio } from './schema'

const base = {
  ...produtoVazio,
  sku: 'por-60x60-cinza',
  descricao: 'Porcelanato Cinza Polido 60x60',
  categoria_id: 'cat',
  unidade: 'M2',
  preco_venda: '89.90',
}

describe('produtoSchema', () => {
  it('aceita produto simples', () => {
    expect(produtoSchema.safeParse(base).success).toBe(true)
  })

  it('exige peças/caixa e m²/caixa para revestimentos', () => {
    const r = produtoSchema.safeParse({ ...base, eh_revestimento: true })
    expect(r.success).toBe(false)
    if (!r.success) {
      const campos = r.error.issues.map((i) => i.path[0])
      expect(campos).toContain('pecas_por_caixa')
      expect(campos).toContain('m2_por_caixa')
    }
    expect(
      produtoSchema.safeParse({ ...base, eh_revestimento: true, pecas_por_caixa: '4', m2_por_caixa: '1.4400' }).success,
    ).toBe(true)
  })

  it('valida GTIN, NCM e SKU', () => {
    expect(produtoSchema.safeParse({ ...base, codigo_barras: '4006381333932' }).success).toBe(false)
    expect(produtoSchema.safeParse({ ...base, codigo_barras: '4006381333931' }).success).toBe(true)
    expect(produtoSchema.safeParse({ ...base, ncm: '6907' }).success).toBe(false)
    expect(produtoSchema.safeParse({ ...base, sku: 'SKU COM ESPAÇO' }).success).toBe(false)
  })

  it('exige preço de venda', () => {
    expect(produtoSchema.safeParse({ ...base, preco_venda: '' }).success).toBe(false)
  })
})

describe('produtoParaPayload', () => {
  it('normaliza SKU, mantém decimais como string e limpa campos de revestimento', () => {
    const p = produtoParaPayload({ ...base, acabamento: 'Polido', pecas_por_caixa: '4', custo: '' })
    expect(p.sku).toBe('POR-60X60-CINZA')
    expect(p.preco_venda).toBe('89.90')
    expect(p.custo).toBe('0')
    expect(p.acabamento).toBeNull()
    expect(p.pecas_por_caixa).toBeNull()
    expect(p.marca_id).toBeNull()
  })

  it('mantém campos de revestimento quando aplicável', () => {
    const p = produtoParaPayload({
      ...base,
      eh_revestimento: true,
      pecas_por_caixa: '4',
      m2_por_caixa: '1.4400',
      acabamento: 'Polido',
      ncm: '6907.21.00',
    })
    expect(p.pecas_por_caixa).toBe(4)
    expect(p.m2_por_caixa).toBe('1.4400')
    expect(p.ncm).toBe('69072100')
  })
})
