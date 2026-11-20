import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mensagemErro } from '@/lib/supabase'
import { criarUsuario } from './api'
import { SeletorPerfis } from './SeletorPerfis'

const schema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome'),
  email: z.string().trim().email('E-mail inválido'),
  senha: z
    .string()
    .min(10, 'Mínimo de 10 caracteres')
    .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
    .regex(/\d/, 'Inclua ao menos um número'),
  perfis: z.array(z.string()).min(1, 'Selecione ao menos um perfil'),
})
type Form = z.infer<typeof schema>

export function NovoUsuarioDialog({ aberto, onFechar, podeAdmin }: { aberto: boolean; onFechar: () => void; podeAdmin: boolean }) {
  const qc = useQueryClient()
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { nome: '', email: '', senha: '', perfis: [] } })
  const erros = form.formState.errors

  useEffect(() => {
    if (aberto) form.reset()
  }, [aberto, form])

  const criar = useMutation({
    mutationFn: criarUsuario,
    onSuccess: () => {
      toast.success('Usuário criado. Informe a senha provisória a ele por um canal seguro.')
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['vendedores'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            O usuário poderá trocar a senha provisória em “Alterar senha”, no menu do perfil.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => criar.mutate(v))} className="space-y-4" noValidate>
          <Field label="Nome" htmlFor="nu-nome" obrigatorio erro={erros.nome?.message}>
            <Input id="nu-nome" {...form.register('nome')} />
          </Field>
          <Field label="E-mail" htmlFor="nu-email" obrigatorio erro={erros.email?.message}>
            <Input id="nu-email" type="email" autoComplete="off" {...form.register('email')} />
          </Field>
          <Field label="Senha provisória" htmlFor="nu-senha" obrigatorio erro={erros.senha?.message}>
            <Input id="nu-senha" type="password" autoComplete="new-password" {...form.register('senha')} />
          </Field>
          <Field label="Perfis" obrigatorio erro={erros.perfis?.message}>
            <Controller
              control={form.control}
              name="perfis"
              render={({ field }) => <SeletorPerfis valor={field.value} onChange={field.onChange} podeAdmin={podeAdmin} />}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending && <Loader2 className="animate-spin" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
