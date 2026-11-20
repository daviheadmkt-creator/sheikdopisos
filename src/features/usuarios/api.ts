import { modoVisualizacao, supabase } from '@/lib/supabase'
import type { Acao } from '@/features/auth/permissoes'

export interface UsuarioLista {
  id: string
  nome: string
  email: string
  ativo: boolean
  ultimo_acesso: string | null
  created_at: string
  usuario_perfis: { perfil: string }[]
}

export interface Modulo {
  codigo: string
  nome: string
  ordem: number
}

export interface PerfilInfo {
  codigo: string
  nome: string
  descricao: string | null
}

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nome,email,ativo,ultimo_acesso,created_at,usuario_perfis(perfil)')
    .order('nome')
  if (error) throw error
  return data as UsuarioLista[]
}

/** Chama a função de servidor /api/admin-usuarios (Vercel), enviando o token da sessão. */
async function chamarFuncao(body: Record<string, unknown>) {
  if (modoVisualizacao) throw new Error('Modo visualização: conecte o banco de dados para salvar.')
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  let resposta: Response
  try {
    resposta = await fetch('/api/admin-usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Serviço de usuários indisponível. Verifique sua conexão.')
  }
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    if (resposta.status === 404) throw new Error('Serviço de usuários indisponível neste ambiente (use o site publicado ou "vercel dev").')
    throw new Error(corpo?.erro ?? 'Falha ao executar a operação.')
  }
  return corpo
}

export const criarUsuario = (dados: { nome: string; email: string; senha: string; perfis: string[] }) =>
  chamarFuncao({ acao: 'criar', ...dados })

export const definirAtivo = (id: string, ativo: boolean) => chamarFuncao({ acao: 'definir_ativo', id, ativo })

/** Sincroniza perfis: insere os novos antes de remover os antigos (protege o último administrador). */
export async function salvarPerfis(usuarioId: string, atuais: string[], novos: string[]) {
  const adicionar = novos.filter((p) => !atuais.includes(p))
  const remover = atuais.filter((p) => !novos.includes(p))
  if (adicionar.length) {
    const { error } = await supabase
      .from('usuario_perfis')
      .insert(adicionar.map((perfil) => ({ usuario_id: usuarioId, perfil })))
    if (error) throw error
  }
  if (remover.length) {
    const { error } = await supabase.from('usuario_perfis').delete().eq('usuario_id', usuarioId).in('perfil', remover)
    if (error) throw error
  }
}

export async function enviarRedefinicaoSenha(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  })
  if (error) throw error
}

export async function listarModulos() {
  const { data, error } = await supabase.from('modulos').select('codigo,nome,ordem').order('ordem')
  if (error) throw error
  return data as Modulo[]
}

export async function listarPerfis() {
  const { data, error } = await supabase.from('perfis').select('codigo,nome,descricao')
  if (error) throw error
  return data as PerfilInfo[]
}

export async function listarPermissoesDoPerfil(perfil: string) {
  const { data, error } = await supabase.from('perfil_permissoes').select('modulo,acao').eq('perfil', perfil)
  if (error) throw error
  return data as { modulo: string; acao: Acao }[]
}

export async function alternarPermissao(perfil: string, modulo: string, acao: Acao, conceder: boolean) {
  const { error } = conceder
    ? await supabase.from('perfil_permissoes').insert({ perfil, modulo, acao })
    : await supabase.from('perfil_permissoes').delete().match({ perfil, modulo, acao })
  if (error) throw error
}
