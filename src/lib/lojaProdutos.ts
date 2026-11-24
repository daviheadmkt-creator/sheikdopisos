// Produtos do ERP para a loja virtual: completa os dados vindos do banco (loja_produtos_site)
// com o endereço público das imagens. Uso no servidor (funções da Vercel) e nos testes.

export interface ProdutoSite {
  erp_id: string
  sku: string
  imagens: string[]
  [campo: string]: unknown
}

/** URL pública de uma imagem do bucket "produtos" do Supabase Storage. */
export function urlImagemPublica(supabaseUrl: string, caminho: string): string {
  const base = supabaseUrl.replace(/\/+$/, '')
  const partes = caminho.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/produtos/${partes}`
}

export function prepararProdutosSite(lista: unknown, supabaseUrl: string): ProdutoSite[] {
  if (!Array.isArray(lista)) return []
  return lista.map((p) => {
    const produto = p as ProdutoSite
    const imagens = Array.isArray(produto.imagens) ? produto.imagens.filter((i): i is string => typeof i === 'string') : []
    return { ...produto, imagens: imagens.map((c) => urlImagemPublica(supabaseUrl, c)) }
  })
}

/** Endereço da API do plugin no WordPress (LOJA_SITE_URL = endereço do site). */
export function urlApiSite(siteUrl: string, rota: 'produtos' | 'categorias'): string {
  return `${siteUrl.replace(/\/+$/, '')}/wp-json/sheik-erp/v1/${rota}`
}
