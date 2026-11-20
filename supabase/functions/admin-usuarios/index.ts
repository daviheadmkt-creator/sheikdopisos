// Edge Function: administração de usuários (Tela 11)
// A service_role é usada SOMENTE aqui, no servidor. Toda ação verifica a
// permissão do usuário chamador no banco (tem_permissao) antes de executar.
// Atribuição de perfis é feita com o cliente do chamador, então as políticas
// RLS (ex.: só administrador concede "administrador") também se aplicam.
import { createClient } from 'npm:@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PERFIS = ['administrador', 'gerente', 'vendedor', 'estoquista', 'comprador', 'financeiro', 'logistica']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const admin = createClient(url, service, { auth: { persistSession: false } })

  const { data: auth } = await caller.auth.getUser()
  if (!auth?.user) return json({ erro: 'Sessão inválida. Faça login novamente.' }, 401)

  const pode = async (acao: string) => {
    const { data, error } = await caller.rpc('tem_permissao', { p_modulo: 'usuarios', p_acao: acao })
    return !error && data === true
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
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
        if (nome.length < 2) return json({ erro: 'Informe o nome' }, 400)
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'E-mail inválido' }, 400)
        if (senha.length < 10) return json({ erro: 'A senha provisória deve ter ao menos 10 caracteres' }, 400)
        if (perfis.length === 0 || perfis.some((p) => !PERFIS.includes(p)))
          return json({ erro: 'Selecione ao menos um perfil válido' }, 400)

        const { data: criado, error: errCriar } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome },
        })
        if (errCriar || !criado.user) {
          const msg = errCriar?.message?.includes('already') ? 'Já existe um usuário com este e-mail' : errCriar?.message
          return json({ erro: msg ?? 'Falha ao criar usuário' }, 400)
        }

        const { error: errPerfis } = await caller
          .from('usuario_perfis')
          .insert(perfis.map((perfil: string) => ({ usuario_id: criado.user.id, perfil })))
        if (errPerfis) {
          // desfaz a criação para não deixar usuário sem perfil
          await admin.auth.admin.deleteUser(criado.user.id)
          return json({ erro: 'Sem permissão para atribuir os perfis selecionados' }, 403)
        }
        return json({ id: criado.user.id })
      }

      case 'definir_ativo': {
        if (!(await pode('editar'))) return json({ erro: 'Sem permissão para editar usuários' }, 403)
        const id = String(body.id ?? '')
        const ativo = body.ativo === true
        if (id === auth.user.id) return json({ erro: 'Você não pode desativar o próprio usuário' }, 400)

        // RLS + gatilho de proteção do último administrador validam a operação
        const { data: alterado, error } = await caller.from('usuarios').update({ ativo }).eq('id', id).select('id')
        if (error) return json({ erro: error.message }, 400)
        if (!alterado?.length) return json({ erro: 'Usuário não encontrado ou sem permissão' }, 403)

        const { error: errBan } = await admin.auth.admin.updateUserById(id, {
          ban_duration: ativo ? 'none' : '876000h',
        })
        if (errBan) return json({ erro: errBan.message }, 500)
        return json({ ok: true })
      }

      default:
        return json({ erro: 'Ação desconhecida' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro interno' }, 500)
  }
})
