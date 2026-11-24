import { modoVisualizacao, supabase } from '@/lib/supabase'

export type SituacaoSite = 'publicado' | 'oculto' | 'aguardando_estoque' | 'erro'

export const SITUACAO_SITE: Record<SituacaoSite, { label: string; variant: 'success' | 'neutral' | 'default' | 'danger' }> = {
  publicado: { label: 'No site', variant: 'success' },
  aguardando_estoque: { label: 'Aguardando estoque', variant: 'default' },
  oculto: { label: 'Fora do site', variant: 'neutral' },
  erro: { label: 'Erro no site', variant: 'danger' },
}

export interface ProdutoSiteInfo {
  vender_no_site: boolean
  site: {
    site_produto_id: number | null
    url: string | null
    situacao: SituacaoSite
    mensagem: string | null
    estoque_enviado: number | null
    sincronizado_em: string
  } | null
}

export async function obterProdutoSite(produtoId: string): Promise<ProdutoSiteInfo> {
  const [p, s] = await Promise.all([
    supabase.from('produtos').select('vender_no_site').eq('id', produtoId).single(),
    supabase.from('produto_site').select('site_produto_id,url,situacao,mensagem,estoque_enviado,sincronizado_em').eq('produto_id', produtoId).maybeSingle(),
  ])
  if (p.error) throw p.error
  if (s.error) throw s.error
  return { vender_no_site: (p.data as { vender_no_site: boolean }).vender_no_site, site: s.data as ProdutoSiteInfo['site'] }
}

export interface CategoriaSite {
  slug: string
  nome: string
  caminho: string
}

/** Chama a função de servidor /api/loja-produtos, enviando o token da sessão. */
async function chamar(body: Record<string, unknown>) {
  if (modoVisualizacao) throw new Error('Modo visualização: conecte o banco de dados.')
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  let resposta: Response
  try {
    resposta = await fetch('/api/loja-produtos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Serviço da loja virtual indisponível. Verifique sua conexão.')
  }
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    if (resposta.status === 404) throw new Error('Serviço da loja virtual indisponível neste ambiente (use o sistema publicado).')
    throw new Error(corpo?.erro ?? 'Falha ao falar com o site.')
  }
  return corpo
}

export const publicarNoSite = (produtoId: string) =>
  chamar({ acao: 'publicar', produto_id: produtoId }) as Promise<{ resultado: { situacao: SituacaoSite; url?: string; mensagem?: string } | null }>

export const tirarDoSite = (produtoId: string) => chamar({ acao: 'remover', produto_id: produtoId })

export const listarCategoriasSite = async () => ((await chamar({ acao: 'categorias' })).categorias ?? []) as CategoriaSite[]
