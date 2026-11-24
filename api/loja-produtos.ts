// Função serverless (Vercel): botões do ERP para a LOJA VIRTUAL.
//  - publicar:   liga "Vender no site" e envia o produto ao site na hora (mesmo sem estoque)
//  - remover:    desliga "Vender no site" e esconde o produto no site
//  - categorias: lista as categorias do site (para vincular às categorias do ERP)
// O chamador é um usuário logado do ERP (permissão em "produtos"). O envio ao WordPress é
// assinado com HMAC (LOJA_WEBHOOK_SECRET) e vai para LOJA_SITE_URL/wp-json/sheik-erp/v1/…
import { createClient } from '@supabase/supabase-js'
import { assinarLoja } from '../src/lib/lojaAssinatura.js'
import { prepararProdutosSite, urlApiSite } from '../src/lib/lojaProdutos.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Chamada assinada à API do plugin no WordPress. */
async function chamarSite(siteUrl: string, chave: string, rota: 'produtos' | 'categorias', dados: unknown) {
  const corpo = JSON.stringify(dados)
  const ts = String(Math.floor(Date.now() / 1000))
  const resposta = await fetch(urlApiSite(siteUrl, rota), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(55_000),
    headers: {
      'Content-Type': 'application/json',
      'X-Sheik-Timestamp': ts,
      'X-Sheik-Assinatura': assinarLoja(chave, ts, corpo),
    },
    body: corpo,
  })
  const r = (await resposta.json().catch(() => null)) as Record<string, unknown> | null
  if (!resposta.ok || !r) {
    const msg = typeof r?.message === 'string' ? r.message : typeof r?.erro === 'string' ? r.erro : `HTTP ${resposta.status}`
    throw new Error(`O site recusou: ${msg}`)
  }
  return r
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const chave = process.env.LOJA_WEBHOOK_SECRET ?? ''
  const siteUrl = process.env.LOJA_SITE_URL ?? ''
  if (!url || !anon || !service) return json({ erro: 'Servidor sem configuração do banco de dados' }, 500)
  if (chave.length < 32 || !/^https:\/\//.test(siteUrl))
    return json({ erro: 'Integração com o site não configurada (LOJA_SITE_URL e LOJA_WEBHOOK_SECRET na Vercel).' }, 503)

  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ erro: 'Sessão inválida. Faça login novamente.' }, 401)
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth } = await caller.auth.getUser(authorization.slice(7))
  if (!auth?.user) return json({ erro: 'Sessão inválida. Faça login novamente.' }, 401)
  const pode = async (acao: string) => {
    const { data, error } = await caller.rpc('tem_permissao', { p_modulo: 'produtos', p_acao: acao })
    return !error && data === true
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ erro: 'Corpo da requisição inválido' }, 400)
  }

  try {
    if (body.acao === 'categorias') {
      if (!(await pode('ler'))) return json({ erro: 'Sem permissão' }, 403)
      const r = await chamarSite(siteUrl, chave, 'categorias', {})
      return json({ categorias: Array.isArray(r.categorias) ? r.categorias : [] })
    }

    if (body.acao !== 'publicar' && body.acao !== 'remover') return json({ erro: 'Ação desconhecida' }, 400)
    if (!(await pode('editar'))) return json({ erro: 'Sem permissão para editar produtos' }, 403)
    const id = String(body.produto_id ?? '')
    if (!UUID.test(id)) return json({ erro: 'Produto inválido' }, 400)

    // Grava a escolha com o cliente do próprio usuário (RLS e auditoria valem)
    const vender = body.acao === 'publicar'
    const { data: alterado, error: errAlt } = await caller.from('produtos').update({ vender_no_site: vender }).eq('id', id).select('id')
    if (errAlt || !alterado?.length) return json({ erro: 'Produto não encontrado ou sem permissão' }, 403)

    const { data, error } = await admin.rpc('loja_produtos_site', { p_ids: [id] })
    if (error) {
      console.error('loja_produtos_site:', error.message)
      return json({ erro: 'Não foi possível montar os dados do produto' }, 500)
    }
    const produtos = prepararProdutosSite((data as { produtos: unknown }).produtos, url)
    const r = await chamarSite(siteUrl, chave, 'produtos', { produtos, forcar: vender })
    const resultados = Array.isArray(r.resultados) ? r.resultados : []
    if (resultados.length) {
      const { error: errReg } = await admin.rpc('loja_registrar_site_produtos', { p: resultados })
      if (errReg) console.error('loja_registrar_site_produtos:', errReg.message)
    }
    return json({ resultado: resultados[0] ?? null })
  } catch (e) {
    console.error(e)
    const msg = e instanceof Error ? e.message : 'Erro interno'
    return json({ erro: /O site recusou/.test(msg) ? msg : 'Não foi possível falar com o site. Tente novamente.' }, 502)
  }
}
