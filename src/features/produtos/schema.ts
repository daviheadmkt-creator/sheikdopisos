import { z } from 'zod'
import { ehDecimalCanonico, paraCanonico } from '@/lib/decimal'
import { somenteDigitos, validarGTIN } from '@/lib/validators/documento'

const decimalOpcional = z.string().refine((v) => v === '' || ehDecimalCanonico(v), 'Valor inválido')

export const ACABAMENTOS = ['Polido', 'Acetinado', 'Natural', 'Esmaltado', 'Rústico', 'Lappato', 'Brilhante', 'Antiderrapante']

export const produtoSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2, 'Informe o SKU')
      .max(40)
      .regex(/^[A-Za-z0-9._/-]+$/, 'Use apenas letras, números, ponto, hífen, barra ou sublinhado'),
    codigo_barras: z
      .string()
      .trim()
      .refine((v) => !v || validarGTIN(v), 'Código de barras (GTIN/EAN) inválido'),
    descricao: z.string().trim().min(3, 'Informe a descrição').max(200),
    categoria_id: z.string().min(1, 'Selecione a categoria'),
    marca_id: z.string(),
    fornecedor_id: z.string(),
    unidade: z.string().min(1, 'Selecione a unidade'),
    custo: decimalOpcional,
    preco_venda: z.string().refine((v) => ehDecimalCanonico(v), 'Informe o preço de venda'),
    estoque_minimo: decimalOpcional,
    peso_kg: decimalOpcional,
    largura_cm: decimalOpcional,
    comprimento_cm: decimalOpcional,
    espessura_mm: decimalOpcional,
    eh_revestimento: z.boolean(),
    pecas_por_caixa: z.string().refine((v) => v === '' || /^\d+$/.test(v), 'Número inteiro'),
    m2_por_caixa: decimalOpcional,
    acabamento: z.string().trim().max(40),
    tonalidade_referencia: z.string().trim().max(30),
    calibre_referencia: z.string().trim().max(30),
    ncm: z.string().refine((v) => !v || somenteDigitos(v).length === 8, 'NCM deve ter 8 dígitos'),
    cest: z.string().refine((v) => !v || somenteDigitos(v).length === 7, 'CEST deve ter 7 dígitos'),
    origem_mercadoria: z.string(),
    status: z.enum(['ativo', 'inativo']),
  })
  .superRefine((v, ctx) => {
    if (v.eh_revestimento) {
      if (!v.pecas_por_caixa || Number(v.pecas_por_caixa) <= 0)
        ctx.addIssue({ code: 'custom', path: ['pecas_por_caixa'], message: 'Obrigatório para revestimentos' })
      if (!v.m2_por_caixa || Number(v.m2_por_caixa) <= 0)
        ctx.addIssue({ code: 'custom', path: ['m2_por_caixa'], message: 'Obrigatório para revestimentos' })
    }
    for (const campo of ['largura_cm', 'comprimento_cm', 'espessura_mm'] as const) {
      if (v[campo] && Number(v[campo]) <= 0)
        ctx.addIssue({ code: 'custom', path: [campo], message: 'Deve ser maior que zero' })
    }
  })

export type ProdutoForm = z.infer<typeof produtoSchema>

export const produtoVazio: ProdutoForm = {
  sku: '',
  codigo_barras: '',
  descricao: '',
  categoria_id: '',
  marca_id: '',
  fornecedor_id: '',
  unidade: '',
  custo: '',
  preco_venda: '',
  estoque_minimo: '',
  peso_kg: '',
  largura_cm: '',
  comprimento_cm: '',
  espessura_mm: '',
  eh_revestimento: false,
  pecas_por_caixa: '',
  m2_por_caixa: '',
  acabamento: '',
  tonalidade_referencia: '',
  calibre_referencia: '',
  ncm: '',
  cest: '',
  origem_mercadoria: '',
  status: 'ativo',
}

const ouNull = (v: string) => (v.trim() === '' ? null : v.trim())

/** Normaliza o formulário para o formato do banco (decimais como string canônica). */
export function produtoParaPayload(v: ProdutoForm) {
  const rev = v.eh_revestimento
  return {
    sku: v.sku.trim().toUpperCase(),
    codigo_barras: ouNull(v.codigo_barras),
    descricao: v.descricao.trim(),
    categoria_id: v.categoria_id,
    marca_id: ouNull(v.marca_id),
    fornecedor_id: ouNull(v.fornecedor_id),
    unidade: v.unidade,
    custo: v.custo || '0',
    preco_venda: v.preco_venda,
    estoque_minimo: v.estoque_minimo || '0',
    peso_kg: ouNull(v.peso_kg),
    largura_cm: ouNull(v.largura_cm),
    comprimento_cm: ouNull(v.comprimento_cm),
    espessura_mm: ouNull(v.espessura_mm),
    eh_revestimento: rev,
    pecas_por_caixa: rev && v.pecas_por_caixa ? Number(v.pecas_por_caixa) : null,
    m2_por_caixa: rev ? ouNull(v.m2_por_caixa) : null,
    acabamento: rev ? ouNull(v.acabamento) : null,
    tonalidade_referencia: rev ? ouNull(v.tonalidade_referencia) : null,
    calibre_referencia: rev ? ouNull(v.calibre_referencia) : null,
    ncm: v.ncm ? somenteDigitos(v.ncm) : null,
    cest: v.cest ? somenteDigitos(v.cest) : null,
    origem_mercadoria: v.origem_mercadoria === '' ? null : Number(v.origem_mercadoria),
    status: v.status,
  }
}

export type ProdutoPayload = ReturnType<typeof produtoParaPayload>

/** Converte registro do banco para o formulário. */
export function produtoDbParaForm(p: Record<string, unknown>): ProdutoForm {
  const s = (k: string) => (p[k] === null || p[k] === undefined ? '' : String(p[k]))
  const d = (k: string, casas: number) => paraCanonico(p[k] as number | null, casas)
  return {
    sku: s('sku'),
    codigo_barras: s('codigo_barras'),
    descricao: s('descricao'),
    categoria_id: s('categoria_id'),
    marca_id: s('marca_id'),
    fornecedor_id: s('fornecedor_id'),
    unidade: s('unidade'),
    custo: d('custo', 4),
    preco_venda: d('preco_venda', 2),
    estoque_minimo: d('estoque_minimo', 3),
    peso_kg: d('peso_kg', 3),
    largura_cm: d('largura_cm', 2),
    comprimento_cm: d('comprimento_cm', 2),
    espessura_mm: d('espessura_mm', 2),
    eh_revestimento: Boolean(p.eh_revestimento),
    pecas_por_caixa: s('pecas_por_caixa'),
    m2_por_caixa: d('m2_por_caixa', 4),
    acabamento: s('acabamento'),
    tonalidade_referencia: s('tonalidade_referencia'),
    calibre_referencia: s('calibre_referencia'),
    ncm: s('ncm'),
    cest: s('cest'),
    origem_mercadoria: s('origem_mercadoria'),
    status: (s('status') || 'ativo') as ProdutoForm['status'],
  }
}
