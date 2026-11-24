// Função serverless (Vercel): recebe clientes e pedidos da LOJA VIRTUAL (WooCommerce,
// plugin "Sheik ERP Conector").
// Segurança: cada mensagem é assinada com HMAC-SHA256 (chave LOJA_WEBHOOK_SECRET, igual nos dois lados)
// e só vale por 5 minutos. A service_role é usada apenas para chamar loja_receber_cliente /
// loja_receber_pedido, funções que o navegador não consegue executar.
import { createClient } from '@supabase/supabase-js'
import { verificarAssinaturaLoja } from '../src/lib/lojaAssinatura.js'
import { prepararProdutosSite } from '../src/lib/lojaProdutos.js'

const LIMITE_CORPO = 512 * 1024

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const chave = process.env.LOJA_WEBHOOK_SECRET ?? ''
  if (!url || !service || !chave) return json({ erro: 'Integração com a loja não configurada no servidor' }, 503)

  const tamanho = Number(request.headers.get('content-length') ?? 0)
  if (tamanho > LIMITE_CORPO) return json({ erro: 'Mensagem muito grande' }, 413)
  const corpo = await request.text()
  if (corpo.length > LIMITE_CORPO) return json({ erro: 'Mensagem muito grande' }, 413)

  const verificacao = verificarAssinaturaLoja(
    chave,
    request.headers.get('x-sheik-timestamp'),
    request.headers.get('x-sheik-assinatura'),
    corpo,
  )
  if (!verificacao.ok) {
    console.warn('loja-webhook recusado:', verificacao.motivo)
    return json({ erro: 'Não autorizado' }, 401)
  }

  let msg: { evento?: unknown; dados?: unknown }
  try {
    msg = JSON.parse(corpo) as typeof msg
  } catch {
    return json({ erro: 'JSON inválido' }, 400)
  }
  const dados = msg.dados
  if (msg.evento !== 'ping' && (typeof dados !== 'object' || dados === null || Array.isArray(dados))) {
    return json({ erro: 'Dados ausentes' }, 400)
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    switch (msg.evento) {
      case 'ping':
        return json({ ok: true, sistema: 'ERP Sheik dos Pisos' })

      case 'cliente': {
        const { data, error } = await admin.rpc('loja_receber_cliente', { p: dados })
        if (error) {
          console.error('loja_receber_cliente:', error.message)
          return json({ erro: 'Não foi possível registrar o cliente', detalhe: error.message }, 422)
        }
        return json({ ok: true, ...(data as object) })
      }

      case 'pedido': {
        const { data, error } = await admin.rpc('loja_receber_pedido', { p: dados })
        if (error) {
          console.error('loja_receber_pedido:', error.message)
          return json({ erro: 'Não foi possível registrar o pedido', detalhe: error.message }, 422)
        }
        return json({ ok: true, ...(data as object) })
      }

      // O plugin busca (a cada 10 min) os produtos alterados no ERP desde o último cursor
      case 'produtos_sincronizar': {
        const cursor = typeof (dados as { cursor?: unknown }).cursor === 'string' ? (dados as { cursor: string }).cursor : null
        const { data, error } = await admin.rpc('loja_produtos_site', { p_cursor: cursor || null })
        if (error) {
          console.error('loja_produtos_site:', error.message)
          return json({ erro: 'Não foi possível listar os produtos', detalhe: error.message }, 422)
        }
        const r = data as { produtos: unknown; cursor: string | null; mais: boolean }
        return json({ ok: true, cursor: r.cursor, mais: r.mais, produtos: prepararProdutosSite(r.produtos, url) })
      }

      // Resultado da aplicação dos produtos no site
      case 'produtos_resultado': {
        const resultados = (dados as { resultados?: unknown }).resultados
        if (!Array.isArray(resultados)) return json({ erro: 'Resultados ausentes' }, 400)
        const { error } = await admin.rpc('loja_registrar_site_produtos', { p: resultados })
        if (error) {
          console.error('loja_registrar_site_produtos:', error.message)
          return json({ erro: 'Não foi possível registrar o resultado', detalhe: error.message }, 422)
        }
        return json({ ok: true })
      }

      default:
        return json({ erro: 'Evento desconhecido' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro interno' }, 500)
  }
}
