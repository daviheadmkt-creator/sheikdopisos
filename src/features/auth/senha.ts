import { z } from 'zod'

/** Política de senha: mínimo 10 caracteres com letras e números. */
export const novaSenhaSchema = z
  .object({
    senha: z
      .string()
      .min(10, 'A senha deve ter ao menos 10 caracteres')
      .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
      .regex(/\d/, 'Inclua ao menos um número'),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem' })

export type NovaSenha = z.infer<typeof novaSenhaSchema>
