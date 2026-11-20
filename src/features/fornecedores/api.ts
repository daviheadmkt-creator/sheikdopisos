import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import { somenteDigitos } from '@/lib/validators/documento'
import type { fornecedorParaPayload } from './schema'

export interface FornecedorLista {
  id: string
  codigo: number
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  cidade: string | null
  uf: string | null
  status: string
  contato_nome: string | null
}

export interface FornecedorDB extends FornecedorLista {
  inscricao_estadual: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  condicoes_pagamento: string | null
  prazo_entrega_dias: number | null
  observacoes: string | null
  created_at: string
  updated_at: string
  fornecedor_contatos: {
    id: string
    nome: string
    cargo: string | null
    telefone: string | null
    whatsapp: string | null
    email: string | null
    principal: boolean
  }[]
}

export interface ProdutoFornecido {
  produto_id: string
  fornecedor_id: string
  codigo_fornecedor: string | null
  ultimo_custo: number | null
  prazo_entrega_dias: number | null
  ultima_compra_em: string | null
  produto: { sku: string; descricao: string; unidade: string } | null
}

export async function listarFornecedores(f: { busca: string; status: string; pagina: number; porPagina: number }) {
  let q = supabase
    .from('fornecedores')
    .select('id,codigo,razao_social,nome_fantasia,cnpj,telefone,whatsapp,email,cidade,uf,status,contato_nome', { count: 'exact' })
  const t = sanitizarBusca(f.busca)
  if (t) {
    const filtros = [`razao_social.ilike.%${t}%`, `nome_fantasia.ilike.%${t}%`, `email.ilike.%${t}%`, `contato_nome.ilike.%${t}%`]
    const d = t.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    if (d.length >= 3 && /\d/.test(d)) filtros.push(`cnpj.ilike.%${d}%`, `telefone.ilike.%${somenteDigitos(t)}%`)
    if (/^\d{1,9}$/.test(t)) filtros.push(`codigo.eq.${t}`)
    q = q.or(filtros.join(','))
  }
  if (f.status) q = q.eq('status', f.status)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('razao_social').range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as FornecedorLista[], total: r.count ?? 0 }
}

export async function obterFornecedor(id: string) {
  const r = await supabase.from('fornecedores').select('*, fornecedor_contatos(*)').eq('id', id).single()
  if (r.error) throw r.error
  return r.data as FornecedorDB
}

export async function salvarFornecedor(p: ReturnType<typeof fornecedorParaPayload>) {
  const r = await supabase.rpc('salvar_fornecedor', { p: p.fornecedor, p_contatos: p.contatos })
  if (r.error) throw r.error
  return r.data as string
}

export async function listarFornecedoresAtivos() {
  const r = await supabase.from('fornecedores').select('id,razao_social,nome_fantasia,condicoes_pagamento,prazo_entrega_dias').eq('status', 'ativo').order('razao_social')
  if (r.error) throw r.error
  return r.data as { id: string; razao_social: string; nome_fantasia: string | null; condicoes_pagamento: string | null; prazo_entrega_dias: number | null }[]
}

export async function listarProdutosDoFornecedor(fornecedorId: string) {
  const r = await supabase
    .from('produto_fornecedores')
    .select('*, produto:produtos(sku,descricao,unidade)')
    .eq('fornecedor_id', fornecedorId)
  if (r.error) throw r.error
  return r.data as unknown as ProdutoFornecido[]
}

export async function vincularProduto(fornecedorId: string, produtoId: string, codigo: string, prazo: string) {
  const r = await supabase.from('produto_fornecedores').upsert({
    fornecedor_id: fornecedorId,
    produto_id: produtoId,
    codigo_fornecedor: codigo.trim() || null,
    prazo_entrega_dias: prazo ? Number(prazo) : null,
  })
  if (r.error) throw r.error
}

export async function desvincularProduto(fornecedorId: string, produtoId: string) {
  const r = await supabase.from('produto_fornecedores').delete().match({ fornecedor_id: fornecedorId, produto_id: produtoId })
  if (r.error) throw r.error
}
