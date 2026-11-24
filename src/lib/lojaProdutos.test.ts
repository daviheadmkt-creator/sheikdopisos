import { prepararProdutosSite, urlApiSite, urlImagemPublica } from './lojaProdutos'

describe('produtos para a loja virtual', () => {
  it('monta a URL pública da imagem', () => {
    expect(urlImagemPublica('https://abc.supabase.co/', 'p1/foto 1.jpg')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/produtos/p1/foto%201.jpg',
    )
  })

  it('troca os caminhos das imagens por URLs e ignora lixo', () => {
    const r = prepararProdutosSite([{ erp_id: '1', sku: 'A', imagens: ['x/a.jpg', 5] }], 'https://abc.supabase.co')
    expect(r[0].imagens).toEqual(['https://abc.supabase.co/storage/v1/object/public/produtos/x/a.jpg'])
    expect(prepararProdutosSite(null, 'https://abc.supabase.co')).toEqual([])
  })

  it('monta o endereço da API do plugin', () => {
    expect(urlApiSite('https://loja.com.br/', 'produtos')).toBe('https://loja.com.br/wp-json/sheik-erp/v1/produtos')
  })
})
