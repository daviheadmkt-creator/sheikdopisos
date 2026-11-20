import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { novaSenhaSchema, type NovaSenha } from './senha'

export function AlterarSenhaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const form = useForm<NovaSenha>({ resolver: zodResolver(novaSenhaSchema), defaultValues: { senha: '', confirmacao: '' } })

  useEffect(() => {
    if (aberto) form.reset()
  }, [aberto, form])

  const salvar = form.handleSubmit(async ({ senha }) => {
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      form.setError('senha', { message: error.message })
      return
    }
    toast.success('Senha alterada com sucesso.')
    onFechar()
  })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
          <DialogDescription>Mínimo de 10 caracteres, com letras e números.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4" noValidate>
          <Field label="Nova senha" htmlFor="nova-senha" erro={form.formState.errors.senha?.message}>
            <Input id="nova-senha" type="password" autoComplete="new-password" {...form.register('senha')} />
          </Field>
          <Field label="Confirmar nova senha" htmlFor="conf-senha" erro={form.formState.errors.confirmacao?.message}>
            <Input id="conf-senha" type="password" autoComplete="new-password" {...form.register('confirmacao')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
