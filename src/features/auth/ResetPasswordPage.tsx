import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import { AuthLayout, BotaoDourado, CampoEscuro, inputEscuro, Titulo } from './LoginPage'
import { novaSenhaSchema, type NovaSenha } from './senha'

export function ResetPasswordPage() {
  const { session, iniciando } = useAuth()
  const navigate = useNavigate()
  const form = useForm<NovaSenha>({ resolver: zodResolver(novaSenhaSchema), defaultValues: { senha: '', confirmacao: '' } })
  const erros = form.formState.errors

  const salvar = form.handleSubmit(async ({ senha }) => {
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      form.setError('senha', { message: error.message })
      return
    }
    toast.success('Senha redefinida com sucesso.')
    navigate('/', { replace: true })
  })

  if (iniciando)
    return (
      <AuthLayout>
        <div className="flex justify-center py-10 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AuthLayout>
    )

  if (!session)
    return (
      <AuthLayout>
        <Titulo chamada="REDEFINIR SENHA" titulo="Link inválido ou expirado." subtitulo="Solicite um novo link de recuperação na tela de login." />
        <BotaoDourado type="button" onClick={() => navigate('/login')}>
          Ir para o login
        </BotaoDourado>
      </AuthLayout>
    )

  return (
    <AuthLayout>
      <Titulo chamada="REDEFINIR SENHA" titulo="Defina sua nova senha." subtitulo="Mínimo de 10 caracteres, com letras e números." />
      <form onSubmit={salvar} className="space-y-5" noValidate>
        <CampoEscuro id="senha" label="Nova senha" icone={<Lock />} erro={erros.senha?.message}>
          <input id="senha" type="password" autoComplete="new-password" className={inputEscuro(!!erros.senha)} {...form.register('senha')} />
        </CampoEscuro>
        <CampoEscuro id="confirmacao" label="Confirmar senha" icone={<Lock />} erro={erros.confirmacao?.message}>
          <input
            id="confirmacao"
            type="password"
            autoComplete="new-password"
            className={inputEscuro(!!erros.confirmacao)}
            {...form.register('confirmacao')}
          />
        </CampoEscuro>
        <div className="pt-3">
          <BotaoDourado type="submit" carregando={form.formState.isSubmitting}>
            Salvar nova senha
          </BotaoDourado>
        </div>
      </form>
    </AuthLayout>
  )
}
