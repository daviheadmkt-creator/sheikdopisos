import { supabase } from '@/lib/supabase'

const ok = <T>(r: { data: unknown; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}

export interface EmpresaDB {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  updated_at: string
}

export async function obterEmpresaConfig() {
  const l = ok<EmpresaDB[]>(await supabase.from('empresas').select('*').limit(1))
  return l?.[0] ?? null
}
export async function salvarEmpresa(id: string, dados: Partial<EmpresaDB>) {
  const r = await supabase.from('empresas').update(dados).eq('id', id).select('id')
  const linhas = ok<{ id: string }[]>(r)
  if (!linhas?.length) throw new Error('Sem permissão para alterar os dados da empresa.')
}

export interface ParametrosComerciaisForm {
  reservar_ao_confirmar: boolean
  validade_orcamento_dias: number
  validade_reserva_dias: number
  perc_sobra_padrao: number
  desconto_max_sem_aprovacao: number
}
export async function salvarParametrosComerciais(p: ParametrosComerciaisForm) {
  const linhas = ok<{ id: boolean }[]>(await supabase.from('parametros_comerciais').update(p).eq('id', true).select('id'))
  if (!linhas?.length) throw new Error('Sem permissão para alterar os parâmetros.')
}

export interface CondicaoPagamento {
  id: string
  nome: string
  parcelas: number
  primeiro_vencimento_dias: number
  intervalo_dias: number
  uso: 'vendas' | 'compras' | 'ambos'
  ativo: boolean
}
export const listarCondicoes = async () => ok<CondicaoPagamento[]>(await supabase.from('condicoes_pagamento').select('*').order('parcelas').order('primeiro_vencimento_dias'))
export async function criarCondicao(c: Omit<CondicaoPagamento, 'id' | 'ativo'>) {
  ok(await supabase.from('condicoes_pagamento').insert({ ...c, nome: c.nome.trim() }))
}
export async function alterarCondicaoAtiva(id: string, ativo: boolean) {
  ok(await supabase.from('condicoes_pagamento').update({ ativo }).eq('id', id))
}
/** Descreve a condição: "3x · 1ª em 30 dias · a cada 30 dias". */
export const descreverCondicao = (c: Pick<CondicaoPagamento, 'parcelas' | 'primeiro_vencimento_dias' | 'intervalo_dias'>) =>
  c.parcelas === 1
    ? c.primeiro_vencimento_dias === 0 ? 'À vista' : `1x em ${c.primeiro_vencimento_dias} dias`
    : `${c.parcelas}x · 1ª em ${c.primeiro_vencimento_dias} dias · a cada ${c.intervalo_dias} dias`

export interface UnidadeDB {
  codigo: string
  descricao: string
  casas_decimais: number
  ativo: boolean
}
export const listarTodasUnidades = async () => ok<UnidadeDB[]>(await supabase.from('unidades').select('*').order('codigo'))
export async function criarUnidade(u: Omit<UnidadeDB, 'ativo'>) {
  ok(await supabase.from('unidades').insert({ ...u, codigo: u.codigo.trim().toUpperCase(), descricao: u.descricao.trim() }))
}
export async function alterarUnidadeAtiva(codigo: string, ativo: boolean) {
  ok(await supabase.from('unidades').update({ ativo }).eq('codigo', codigo))
}
