import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensagemErro, modoVisualizacao, supabase, supabaseConfigurado } from '@/lib/supabase'
import { criarVerificador, type Acao, type PermissaoLinha } from './permissoes'

/** Encerra a sessão após este período sem interação (gerenciamento seguro de sessão). */
const INATIVIDADE_MS = 30 * 60 * 1000

export interface UsuarioAtual {
  id: string
  nome: string
  email: string
  ativo: boolean
  perfis: string[]
}

interface AuthContexto {
  iniciando: boolean
  session: Session | null
  usuario: UsuarioAtual | null
  carregandoPerfil: boolean
  erroPerfil: string | null
  pode: (modulo: string, acao?: Acao) => boolean
  sair: () => Promise<void>
  /** Somente no modo visualização (dev sem banco) */
  entrarVisualizacao: (email: string) => void
}

const CHAVE_VISUALIZACAO = 'sheik.visualizacao'
const lerVisualizacao = () => {
  try {
    return sessionStorage.getItem(CHAVE_VISUALIZACAO)
  } catch {
    return null
  }
}

const Ctx = createContext<AuthContexto | null>(null)

async function carregarPerfil(id: string) {
  const [u, perfis, perms] = await Promise.all([
    supabase.from('usuarios').select('id,nome,email,ativo').eq('id', id).single(),
    supabase.from('usuario_perfis').select('perfil').eq('usuario_id', id),
    supabase.rpc('minhas_permissoes'),
  ])
  if (u.error) throw u.error
  if (perfis.error) throw perfis.error
  if (perms.error) throw perms.error
  return {
    usuario: { ...u.data, perfis: (perfis.data ?? []).map((p) => p.perfil as string) } as UsuarioAtual,
    permissoes: (perms.data ?? []) as PermissaoLinha[],
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [iniciando, setIniciando] = useState(supabaseConfigurado)
  const qc = useQueryClient()
  const acessoRegistrado = useRef<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigurado) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIniciando(false)
    })
    // Não chamar outras APIs do Supabase dentro deste callback (evita deadlock do cliente).
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s)
      if (!s) qc.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  const userId = session?.user.id
  const perfil = useQuery({
    queryKey: ['auth', 'perfil', userId],
    queryFn: () => carregarPerfil(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  })

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    qc.clear()
  }, [qc])

  // Usuário desativado: encerra a sessão imediatamente
  useEffect(() => {
    if (perfil.data && !perfil.data.usuario.ativo) {
      toast.error('Seu usuário está desativado. Procure o administrador.')
      void sair()
    }
  }, [perfil.data, sair])

  // Registra último acesso uma vez por sessão
  useEffect(() => {
    if (userId && acessoRegistrado.current !== userId) {
      acessoRegistrado.current = userId
      void supabase.rpc('registrar_acesso')
    }
  }, [userId])

  // Logout por inatividade
  useEffect(() => {
    if (!userId) return
    let timer = window.setTimeout(expirar, INATIVIDADE_MS)
    function expirar() {
      toast.info('Sessão encerrada por inatividade.')
      void sair()
    }
    const reiniciar = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(expirar, INATIVIDADE_MS)
    }
    const eventos = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      eventos.forEach((e) => window.removeEventListener(e, reiniciar))
    }
  }, [userId, sair])

  const pode = useMemo(() => criarVerificador(perfil.data?.permissoes ?? []), [perfil.data])

  // ---------------- Modo visualização (somente dev, sem banco) ----------------
  const [visualEmail, setVisualEmail] = useState<string | null>(() => (modoVisualizacao ? lerVisualizacao() : null))
  if (modoVisualizacao) {
    const ativo = Boolean(visualEmail)
    const valorVisual: AuthContexto = {
      iniciando: false,
      session: ativo ? ({ user: { id: 'visualizacao' } } as unknown as Session) : null,
      usuario: ativo
        ? { id: 'visualizacao', nome: 'Modo visualização', email: visualEmail!, ativo: true, perfis: ['administrador'] }
        : null,
      carregandoPerfil: false,
      erroPerfil: null,
      pode: () => true,
      sair: async () => {
        try {
          sessionStorage.removeItem(CHAVE_VISUALIZACAO)
        } catch {
          /* ignorar */
        }
        setVisualEmail(null)
      },
      entrarVisualizacao: (email) => {
        try {
          sessionStorage.setItem(CHAVE_VISUALIZACAO, email)
        } catch {
          /* ignorar */
        }
        setVisualEmail(email)
      },
    }
    return <Ctx.Provider value={valorVisual}>{children}</Ctx.Provider>
  }

  const valor: AuthContexto = {
    iniciando,
    session,
    usuario: perfil.data?.usuario ?? null,
    carregandoPerfil: Boolean(userId) && perfil.isLoading,
    erroPerfil: perfil.error ? mensagemErro(perfil.error) : null,
    pode,
    sair,
    entrarVisualizacao: () => undefined,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
