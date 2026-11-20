import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
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

async function chamarFuncao(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const corpo = await error.context.json().catch(() => null)
      throw new Error(corpo?.erro ?? 'Falha ao executar a operação.')
    }
    throw new Error('Serviço de usuários indisponível. Verifique se a Edge Function "admin-usuarios" foi publicada.')
  }
  return data
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
