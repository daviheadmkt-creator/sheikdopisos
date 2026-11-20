// Função serverless (Vercel): administração de usuários (Tela 11).
// A service_role é lida de SUPABASE_SERVICE_ROLE_KEY (variável de servidor, nunca exposta ao navegador).
// Toda ação verifica a permissão do chamador no banco (tem_permissao). Perfis são atribuídos com o
// cliente do próprio chamador, então as políticas RLS (ex.: só administrador concede "administrador") valem.
import { createClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERFIS = ['administrador', 'gerente', 'vendedor', 'estoquista', 'comprador', 'financeiro', 'logistica']

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return json({ erro: 'Servidor sem configuração do banco de dados' }, 500)

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
    const { data, error } = await caller.rpc('tem_permissao', { p_modulo: 'usuarios', p_acao: acao })
    return !error && data === true
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ erro: 'Corpo da requisição inválido' }, 400)
  }

  try {
    switch (body.acao) {
      case 'criar': {
        if (!(await pode('criar'))) return json({ erro: 'Sem permissão para criar usuários' }, 403)
        const nome = String(body.nome ?? '').trim()
        const email = String(body.email ?? '').trim().toLowerCase()
        const senha = String(body.senha ?? '')
        const perfis = Array.isArray(body.perfis) ? body.perfis.map(String) : []
        if (nome.length < 2 || nome.length > 120) return json({ erro: 'Informe o nome (até 120 caracteres)' }, 400)
        if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'E-mail inválido' }, 400)
        if (senha.length < 10 || senha.length > 72 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha))
          return json({ erro: 'A senha provisória deve ter ao menos 10 caracteres, com letras e números' }, 400)
        if (perfis.length === 0 || perfis.some((p) => !PERFIS.includes(p))) return json({ erro: 'Selecione ao menos um perfil válido' }, 400)

        const { data: criado, error: errCriar } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome },
        })
        if (errCriar || !criado.user) {
          if (/already|registered|exists/i.test(errCriar?.message ?? '')) return json({ erro: 'Já existe um usuário com este e-mail' }, 400)
          // Detalhe técnico fica só no log do servidor
          console.error('createUser:', errCriar?.message)
          return json({ erro: 'Não foi possível criar o usuário. Verifique os dados e tente novamente.' }, 400)
        }

        const { error: errPerfis } = await caller
          .from('usuario_perfis')
          .insert(perfis.map((perfil) => ({ usuario_id: criado.user.id, perfil })))
        if (errPerfis) {
          await admin.auth.admin.deleteUser(criado.user.id) // desfaz: não deixa usuário sem perfil
          return json({ erro: 'Sem permissão para atribuir os perfis selecionados' }, 403)
        }
        return json({ id: criado.user.id })
      }

      case 'definir_ativo': {
        if (!(await pode('editar'))) return json({ erro: 'Sem permissão para editar usuários' }, 403)
        const id = String(body.id ?? '')
        const ativo = body.ativo === true
        if (!UUID.test(id)) return json({ erro: 'Usuário inválido' }, 400)
        if (id === auth.user.id) return json({ erro: 'Você não pode desativar o próprio usuário' }, 400)

        const { data: alterado, error } = await caller.from('usuarios').update({ ativo }).eq('id', id).select('id')
        if (error) {
          console.error('usuarios.update:', error.message)
          return json({ erro: 'Não foi possível alterar o usuário' }, 400)
        }
        if (!alterado?.length) return json({ erro: 'Usuário não encontrado ou sem permissão' }, 403)

        const { error: errBan } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? 'none' : '876000h' })
        if (errBan) {
          // Desfaz a marcação para o cadastro não divergir do acesso real
          await caller.from('usuarios').update({ ativo: !ativo }).eq('id', id)
          console.error('updateUserById:', errBan.message)
          return json({ erro: 'Não foi possível alterar o acesso do usuário. Tente novamente.' }, 500)
        }
        return json({ ok: true })
      }

      default:
        return json({ erro: 'Ação desconhecida' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro interno' }, 500)
  }
}
