import { createClient, type PostgrestError } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && anonKey && !url.includes('SEU-PROJETO'))

/**
 * Modo visualização: somente SEM banco configurado, em desenvolvimento ou quando
 * habilitado explicitamente no build (VITE_MODO_VISUALIZACAO=true, ex.: demonstração na Vercel).
 * Permite navegar pelas telas; consultas retornam vazio e gravações são recusadas.
 * Ao configurar o Supabase, desliga automaticamente.
 */
export const modoVisualizacao =
  !supabaseConfigurado && (import.meta.env.DEV || import.meta.env.VITE_MODO_VISUALIZACAO === 'true')

const MSG_VISUALIZACAO = 'Modo visualização: conecte o banco de dados para salvar.'

const fetchVisualizacao: typeof fetch = async (entrada, init) => {
  const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : 'GET')).toUpperCase()
  const endereco = entrada instanceof Request ? entrada.url : String(entrada)
  const json = { 'Content-Type': 'application/json' }
  const leituraRpc = /\/rest\/v1\/rpc\/(listar_|minhas_|lotes_|resumo_|fluxo_|dre_|dashboard_|relatorio_)/.test(endereco)
  if (endereco.includes('/rest/v1/') && (metodo === 'GET' || metodo === 'HEAD' || leituraRpc)) {
    return new Response(metodo === 'HEAD' ? null : '[]', { status: 200, headers: { ...json, 'Content-Range': '*/0' } })
  }
  return new Response(JSON.stringify({ message: MSG_VISUALIZACAO, erro: MSG_VISUALIZACAO, code: 'VISUALIZACAO' }), {
    status: 503,
    headers: json,
  })
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'nao-configurado', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  ...(modoVisualizacao ? { global: { fetch: fetchVisualizacao } } : {}),
})

/** Traduz erros do PostgreSQL/PostgREST em mensagens claras para o usuário. */
export function mensagemErro(erro: unknown): string {
  const e = erro as Partial<PostgrestError> & { message?: string }
  const msg = e?.message ?? ''
  switch (e?.code) {
    case '23505':
      if (msg.includes('documento')) return 'Já existe um cadastro com este CPF/CNPJ.'
      if (msg.includes('sku')) return 'Já existe um produto com este SKU.'
      if (msg.includes('codigo_barras')) return 'Já existe um produto com este código de barras.'
      if (msg.includes('lotes_identidade')) return 'Já existe este lote (mesma tonalidade e calibre) para o produto.'
      if (msg.includes('inventarios_deposito_aberto')) return 'Já existe inventário em andamento neste depósito.'
      if (msg.includes('codigo')) return 'Já existe um registro com este código.'
      if (msg.includes('nome')) return 'Já existe um registro com este nome.'
      return 'Registro duplicado.'
    case '23514':
      if (msg.includes('documento')) return 'CPF/CNPJ inválido.'
      return 'Algum campo não atende às regras de validação.'
    case '23503':
      return 'Registro vinculado a outro cadastro inexistente ou em uso.'
    case '42501':
      return 'Você não tem permissão para executar esta operação.'
    case 'PGRST116':
      return 'Registro não encontrado.'
  }
  if (e?.code === 'VISUALIZACAO') return MSG_VISUALIZACAO
  if (msg.includes('row-level security')) return 'Você não tem permissão para executar esta operação.'
  if (msg.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet.'
  return msg || 'Ocorreu um erro inesperado.'
}
