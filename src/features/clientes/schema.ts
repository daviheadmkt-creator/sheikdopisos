import { z } from 'zod'
import { ehDecimalCanonico } from '@/lib/decimal'
import { normalizarCNPJ, somenteDigitos, UFS, validarCNPJ, validarCPF } from '@/lib/validators/documento'

const telefoneOpcional = z
  .string()
  .refine((v) => [0, 10, 11].includes(somenteDigitos(v).length), 'Telefone deve ter DDD + 8 ou 9 dígitos')

/** Hoje no fuso local, AAAA-MM-DD. */
const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Data de nascimento opcional: entre 01/01/1900 e hoje. */
export const dataNascimento = z
  .string()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida')
  .refine((v) => !v || v >= '1900-01-01', 'Data muito antiga')
  .refine((v) => !v || v <= hojeISO(), 'A data não pode ser futura')

/** Idade completa em anos na data de referência (padrão: hoje). */
export function idade(nascimento: string, referencia = hojeISO()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null
  const [a, m, d] = nascimento.split('-').map(Number)
  const [ra, rm, rd] = referencia.split('-').map(Number)
  return ra - a - (rm < m || (rm === m && rd < d) ? 1 : 0)
}

export const enderecoSchema = z.object({
  id: z.string().optional(),
  descricao: z.string().trim().max(60, 'Máximo de 60 caracteres'),
  cep: z.string().refine((v) => somenteDigitos(v).length === 8, 'CEP deve ter 8 dígitos'),
  logradouro: z.string().trim().min(2, 'Informe o logradouro'),
  numero: z.string().trim().min(1, 'Informe o número (ou S/N)'),
  complemento: z.string().trim(),
  bairro: z.string().trim().min(1, 'Informe o bairro'),
  cidade: z.string().trim().min(2, 'Informe a cidade'),
  uf: z.string().refine((v) => (UFS as readonly string[]).includes(v), 'Selecione a UF'),
  referencia: z.string().trim(),
  principal: z.boolean(),
})

export const clienteSchema = z
  .object({
    tipo_pessoa: z.enum(['PF', 'PJ']),
    nome: z.string().trim().min(2, 'Informe o nome').max(150),
    razao_social: z.string().trim().max(150),
    documento: z.string(),
    inscricao_estadual: z.string().trim().max(20),
    telefone: telefoneOpcional,
    whatsapp: telefoneOpcional,
    email: z
      .string()
      .trim()
      .refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido'),
    vendedor_id: z.string(),
    limite_credito: z.string().refine((v) => v === '' || ehDecimalCanonico(v), 'Valor inválido'),
    status: z.enum(['ativo', 'inativo', 'bloqueado']),
    observacoes: z.string().max(2000),
    data_nascimento: dataNascimento,
    contato_nome: z.string().trim().max(120),
    contato_nascimento: dataNascimento,
    enderecos: z.array(enderecoSchema),
  })
  .superRefine((v, ctx) => {
    if (v.tipo_pessoa === 'PF') {
      if (v.documento && !validarCPF(v.documento))
        ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CPF inválido' })
    } else {
      if (!v.documento) ctx.addIssue({ code: 'custom', path: ['documento'], message: 'Informe o CNPJ' })
      else if (!validarCNPJ(v.documento)) ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CNPJ inválido' })
      if (!v.razao_social.trim())
        ctx.addIssue({ code: 'custom', path: ['razao_social'], message: 'Informe a razão social' })
    }
    if (v.enderecos.length > 0 && v.enderecos.filter((e) => e.principal).length !== 1)
      ctx.addIssue({ code: 'custom', path: ['enderecos'], message: 'Marque exatamente um endereço como principal' })
  })

export type ClienteForm = z.infer<typeof clienteSchema>
export type EnderecoForm = z.infer<typeof enderecoSchema>

export const enderecoVazio = (principal: boolean): EnderecoForm => ({
  descricao: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  referencia: '',
  principal,
})

export const clienteVazio: ClienteForm = {
  tipo_pessoa: 'PF',
  nome: '',
  razao_social: '',
  documento: '',
  inscricao_estadual: '',
  telefone: '',
  whatsapp: '',
  email: '',
  vendedor_id: '',
  limite_credito: '',
  status: 'ativo',
  observacoes: '',
  data_nascimento: '',
  contato_nome: '',
  contato_nascimento: '',
  enderecos: [],
}

/** Normaliza os dados do formulário para o formato persistido no banco. */
export function clienteParaPayload(v: ClienteForm, id?: string) {
  const documento = v.tipo_pessoa === 'PF' ? somenteDigitos(v.documento) : normalizarCNPJ(v.documento)
  return {
    cliente: {
      id: id ?? '',
      tipo_pessoa: v.tipo_pessoa,
      nome: v.nome.trim(),
      razao_social: v.tipo_pessoa === 'PJ' ? v.razao_social.trim() : '',
      documento,
      inscricao_estadual: v.inscricao_estadual.trim(),
      telefone: somenteDigitos(v.telefone),
      whatsapp: somenteDigitos(v.whatsapp),
      email: v.email.trim().toLowerCase(),
      vendedor_id: v.vendedor_id,
      limite_credito: v.limite_credito || '0',
      status: v.status,
      observacoes: v.observacoes.trim(),
      // PF: nascimento do cliente · PJ: contato da empresa e o nascimento dele
      data_nascimento: v.tipo_pessoa === 'PF' ? v.data_nascimento : '',
      contato_nome: v.tipo_pessoa === 'PJ' ? v.contato_nome.trim() : '',
      contato_nascimento: v.tipo_pessoa === 'PJ' ? v.contato_nascimento : '',
    },
    enderecos: v.enderecos.map((e) => ({ ...e, id: e.id ?? '', cep: somenteDigitos(e.cep), uf: e.uf.toUpperCase() })),
  }
}
