import { useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Logo } from '@/components/common/Logo'
import { FASE_ATUAL } from '@/components/layout/nav'
import { modoVisualizacao, supabase, supabaseConfigurado } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useAuth } from './AuthProvider'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
})
const recuperarSchema = z.object({ email: z.string().trim().min(1, 'Informe o e-mail').email('E-mail inválido') })

/* ------------------------------------------------------------------ Layout */

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-full flex-col bg-sidebar text-white"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      <header className="flex h-24 shrink-0 items-center justify-between border-b border-white/10 px-6 sm:px-12">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12" compacto />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide">SHEIK DOS PISOS</p>
            <p className="text-[10px] font-medium tracking-[0.25em] text-primary">GESTÃO EMPRESARIAL</p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-xs text-zinc-400 sm:text-sm">
          <ShieldCheck className="h-4 w-4 text-primary" /> Ambiente seguro
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Logo className="mb-8 h-36 w-36" />
        <div className="w-full max-w-[430px]">{children}</div>
        <p className="mt-14 flex items-center gap-2 text-xs text-zinc-500">
          <Lock className="h-3 w-3" /> Seus dados protegidos, sua empresa conectada.
        </p>
      </main>

      <footer className="flex h-14 shrink-0 items-center justify-between border-t border-white/10 px-6 text-[11px] text-zinc-500">
        <span>© SHEIK DOS PISOS</span>
        <span>ERP · Fase {FASE_ATUAL}</span>
      </footer>
    </div>
  )
}

/* -------------------------------------------------------- Peças visuais */

export function Titulo({ chamada, titulo, subtitulo }: { chamada: string; titulo: string; subtitulo: string }) {
  return (
    <div className="mb-9 text-center">
      <p className="text-[11px] font-semibold tracking-[0.3em] text-primary">{chamada}</p>
      <h1 className="mt-4 text-2xl font-semibold sm:text-[26px]">{titulo}</h1>
      <p className="mt-3 text-sm text-zinc-400">{subtitulo}</p>
    </div>
  )
}

export function CampoEscuro({
  id,
  label,
  icone,
  erro,
  children,
}: {
  id: string
  label: string
  icone: ReactNode
  erro?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-primary [&_svg]:h-4 [&_svg]:w-4">
          {icone}
        </span>
        {children}
      </div>
      {erro && (
        <p className="text-xs text-red-400" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}

export const inputEscuro = (invalido?: boolean) =>
  cn(
    'h-12 w-full rounded-lg border bg-sidebar-2 pl-11 pr-4 text-sm text-white placeholder:text-zinc-500 transition-colors',
    'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
    invalido ? 'border-red-500/70' : 'border-white/10',
  )

export function BotaoDourado({ carregando, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  return (
    <button
      {...props}
      disabled={carregando || props.disabled}
      className="flex h-12 w-full items-center justify-between rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-gold-light focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar disabled:opacity-60"
    >
      {children}
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

const linkDourado = 'text-sm font-medium text-primary transition-colors hover:text-gold-light'

/* ------------------------------------------------------------ Página */

export function LoginPage() {
  const { session, iniciando, entrarVisualizacao } = useAuth()
  const location = useLocation()
  const [modo, setModo] = useState<'login' | 'recuperar' | 'acesso'>('login')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const login = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  })
  const recuperar = useForm<z.infer<typeof recuperarSchema>>({
    resolver: zodResolver(recuperarSchema),
    defaultValues: { email: '' },
  })

  if (!iniciando && session) {
    const destino = (location.state as { de?: string } | null)?.de ?? '/'
    return <Navigate to={destino} replace />
  }

  const entrar = login.handleSubmit(async ({ email, senha }) => {
    if (modoVisualizacao) {
      entrarVisualizacao(email)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      const msg = /invalid login/i.test(error.message)
        ? 'E-mail ou senha incorretos.'
        : /banned/i.test(error.message)
          ? 'Usuário desativado. Procure o administrador.'
          : /rate limit|too many/i.test(error.message)
            ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
            : error.message
      login.setError('senha', { message: msg })
    }
  })

  const enviarRecuperacao = recuperar.handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error && !/rate limit/i.test(error.message)) {
      toast.error('Não foi possível enviar o e-mail agora. Tente novamente em instantes.')
      return
    }
    // Mensagem neutra: não revela se o e-mail existe (proteção contra enumeração)
    toast.success('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
    setModo('login')
  })

  if (!supabaseConfigurado && !modoVisualizacao) {
    return (
      <AuthLayout>
        <Titulo chamada="CONFIGURAÇÃO PENDENTE" titulo="Sistema não conectado." subtitulo="Falta conectar o banco de dados." />
        <div className="rounded-lg border border-white/10 bg-sidebar-2 p-5 text-sm leading-relaxed text-zinc-300">
          Crie o arquivo <code className="text-primary">.env</code> na raiz do projeto a partir de{' '}
          <code className="text-primary">.env.example</code>, informando a URL e a chave <em>anon</em> do projeto Supabase,
          e reinicie o servidor.
        </div>
      </AuthLayout>
    )
  }

  if (modo === 'recuperar') {
    const erro = recuperar.formState.errors.email?.message
    return (
      <AuthLayout>
        <Titulo chamada="RECUPERAÇÃO DE ACESSO" titulo="Esqueceu sua senha?" subtitulo="Enviaremos um link de redefinição para o seu e-mail." />
        <form onSubmit={enviarRecuperacao} className="space-y-6" noValidate>
          <CampoEscuro id="email-rec" label="E-mail" icone={<Mail />} erro={erro}>
            <input
              id="email-rec"
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="seuemail@empresa.com.br"
              className={inputEscuro(!!erro)}
              {...recuperar.register('email')}
            />
          </CampoEscuro>
          <BotaoDourado type="submit" carregando={recuperar.formState.isSubmitting}>
            Enviar link de redefinição
          </BotaoDourado>
          <button type="button" onClick={() => setModo('login')} className={cn(linkDourado, 'mx-auto flex items-center gap-1.5')}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao login
          </button>
        </form>
      </AuthLayout>
    )
  }

  if (modo === 'acesso') {
    return (
      <AuthLayout>
        <Titulo chamada="SOLICITAR ACESSO" titulo="Acesso liberado pelo administrador." subtitulo="Por segurança, não há cadastro aberto ao público." />
        <div className="space-y-6">
          <div className="rounded-lg border border-white/10 bg-sidebar-2 p-5 text-sm leading-relaxed text-zinc-300">
            Peça ao administrador do sistema da SHEIK DOS PISOS para criar seu usuário em{' '}
            <span className="text-primary">Usuários e Permissões</span>. Você receberá uma senha provisória e poderá
            trocá-la no primeiro acesso.
          </div>
          <button type="button" onClick={() => setModo('login')} className={cn(linkDourado, 'mx-auto flex items-center gap-1.5')}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao login
          </button>
        </div>
      </AuthLayout>
    )
  }

  const erros = login.formState.errors
  return (
    <AuthLayout>
      <Titulo chamada="BEM-VINDO AO SEU ERP" titulo="Tudo pronto para um novo dia." subtitulo="Entre na sua conta SHEIK DOS PISOS." />
      <form onSubmit={entrar} className="space-y-5" noValidate>
        <CampoEscuro id="email" label="E-mail" icone={<Mail />} erro={erros.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="seuemail@empresa.com.br"
            className={inputEscuro(!!erros.email)}
            {...login.register('email')}
          />
        </CampoEscuro>

        <CampoEscuro id="senha" label="Senha" icone={<Lock />} erro={erros.senha?.message}>
          <input
            id="senha"
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className={cn(inputEscuro(!!erros.senha), 'pr-12')}
            {...login.register('senha')}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-300 hover:text-white"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </CampoEscuro>

        <div className="flex justify-end pb-3">
          <button type="button" onClick={() => setModo('recuperar')} className={linkDourado}>
            Esqueci minha senha
          </button>
        </div>

        <BotaoDourado type="submit" carregando={login.formState.isSubmitting}>
          Entrar no sistema
        </BotaoDourado>

        {modoVisualizacao && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-xs leading-relaxed text-zinc-300">
            <span className="font-semibold text-primary">Modo visualização:</span> banco de dados não conectado. Use qualquer
            e-mail e senha para navegar pelas telas. Nada será salvo.
          </p>
        )}

        <p className="pt-5 text-center text-sm text-zinc-400">
          Ainda não tem acesso?{' '}
          <button type="button" onClick={() => setModo('acesso')} className={linkDourado}>
            Solicitar acesso
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}
