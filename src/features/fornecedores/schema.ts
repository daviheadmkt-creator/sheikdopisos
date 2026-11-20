import { z } from 'zod'
import { normalizarCNPJ, somenteDigitos, UFS, validarCNPJ } from '@/lib/validators/documento'

const telefone = z.string().refine((v) => [0, 10, 11].includes(somenteDigitos(v).length), 'Telefone deve ter DDD + 8 ou 9 dígitos')
const email = z
  .string()
  .trim()
  .refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido')

export const contatoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome'),
  cargo: z.string().trim().max(60),
  telefone,
  whatsapp: telefone,
  email,
  principal: z.boolean(),
})

export const fornecedorSchema = z
  .object({
    razao_social: z.string().trim().min(2, 'Informe a razão social').max(150),
    nome_fantasia: z.string().trim().max(150),
    cnpj: z.string().refine((v) => !v || validarCNPJ(v), 'CNPJ inválido'),
    inscricao_estadual: z.string().trim().max(20),
    telefone,
    whatsapp: telefone,
    email,
    cep: z.string().refine((v) => !v || somenteDigitos(v).length === 8, 'CEP deve ter 8 dígitos'),
    logradouro: z.string().trim(),
    numero: z.string().trim(),
    complemento: z.string().trim(),
    bairro: z.string().trim(),
    cidade: z.string().trim(),
    uf: z.string().refine((v) => !v || (UFS as readonly string[]).includes(v), 'UF inválida'),
    condicoes_pagamento: z.string().trim().max(300),
    prazo_entrega_dias: z.string().refine((v) => !v || /^\d{1,3}$/.test(v), 'Informe em dias'),
    observacoes: z.string().max(2000),
    status: z.enum(['ativo', 'inativo']),
    contatos: z.array(contatoSchema),
  })
  .superRefine((v, ctx) => {
    if (v.contatos.filter((c) => c.principal).length > 1)
      ctx.addIssue({ code: 'custom', path: ['contatos'], message: 'Apenas um contato pode ser o principal' })
  })

export type FornecedorForm = z.infer<typeof fornecedorSchema>
export type ContatoForm = z.infer<typeof contatoSchema>

export const contatoVazio = (principal: boolean): ContatoForm => ({ nome: '', cargo: '', telefone: '', whatsapp: '', email: '', principal })

export const fornecedorVazio: FornecedorForm = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  telefone: '',
  whatsapp: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  condicoes_pagamento: '',
  prazo_entrega_dias: '',
  observacoes: '',
  status: 'ativo',
  contatos: [],
}

export function fornecedorParaPayload(v: FornecedorForm, id?: string) {
  return {
    fornecedor: {
      id: id ?? '',
      razao_social: v.razao_social.trim(),
      nome_fantasia: v.nome_fantasia.trim(),
      cnpj: v.cnpj ? normalizarCNPJ(v.cnpj) : '',
      inscricao_estadual: v.inscricao_estadual.trim(),
      telefone: somenteDigitos(v.telefone),
      whatsapp: somenteDigitos(v.whatsapp),
      email: v.email.trim().toLowerCase(),
      contato_nome: v.contatos.find((c) => c.principal)?.nome ?? v.contatos[0]?.nome ?? '',
      cep: somenteDigitos(v.cep),
      logradouro: v.logradouro,
      numero: v.numero,
      complemento: v.complemento,
      bairro: v.bairro,
      cidade: v.cidade,
      uf: v.uf,
      condicoes_pagamento: v.condicoes_pagamento,
      prazo_entrega_dias: v.prazo_entrega_dias,
      observacoes: v.observacoes,
      status: v.status,
    },
    contatos: v.contatos.map((c) => ({
      ...c,
      telefone: somenteDigitos(c.telefone),
      whatsapp: somenteDigitos(c.whatsapp),
      email: c.email.trim().toLowerCase(),
    })),
  }
}
