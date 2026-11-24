import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import type { ProdutoPayload } from './schema'

export interface Categoria {
  id: string
  nome: string
  revestimento: boolean
  ativo: boolean
  /** slug da subcategoria no site (loja virtual) */
  site_categoria: string | null
}
export interface Marca {
  id: string
  nome: string
  ativo: boolean
}
export interface Unidade {
  codigo: string
  descricao: string
  casas_decimais: number
}
export interface FornecedorResumo {
  id: string
  razao_social: string
  nome_fantasia: string | null
}
export interface ProdutoImagem {
  id: string
  produto_id: string
  storage_path: string
  ordem: number
  principal: boolean
}
export interface ProdutoLista {
  id: string
  sku: string
  descricao: string
  unidade: string
  preco_venda: number
  status: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  categoria: { nome: string } | null
  marca: { nome: string } | null
  produto_imagens: { storage_path: string; principal: boolean }[]
}

export const BUCKET_PRODUTOS = 'produtos'
export const urlImagem = (path: string) => supabase.storage.from(BUCKET_PRODUTOS).getPublicUrl(path).data.publicUrl

export interface FiltrosProdutos {
  busca: string
  categoria: string
  status: string
  pagina: number
  porPagina: number
}

export async function listarProdutos(f: FiltrosProdutos) {
  let q = supabase
    .from('produtos')
    .select(
      'id,sku,descricao,unidade,preco_venda,status,eh_revestimento,m2_por_caixa,categoria:categorias(nome),marca:marcas(nome),produto_imagens(storage_path,principal)',
      { count: 'exact' },
    )
  const termo = sanitizarBusca(f.busca)
  if (termo) {
    const filtros = [`descricao.ilike.%${termo}%`, `sku.ilike.%${termo}%`]
    if (/^\d{8,14}$/.test(termo)) filtros.push(`codigo_barras.eq.${termo}`)
    q = q.or(filtros.join(','))
  }
  if (f.categoria) q = q.eq('categoria_id', f.categoria)
  if (f.status) q = q.eq('status', f.status)
  const de = (f.pagina - 1) * f.porPagina
  const { data, error, count } = await q.order('descricao').range(de, de + f.porPagina - 1)
  if (error) throw error
  return { linhas: (data ?? []) as unknown as ProdutoLista[], total: count ?? 0 }
}

export async function obterProduto(id: string) {
  const { data, error } = await supabase.from('produtos').select('*, produto_imagens(*)').eq('id', id).single()
  if (error) throw error
  return data as Record<string, unknown> & {
    id: string
    created_at: string
    updated_at: string
    produto_imagens: ProdutoImagem[]
  }
}

export async function salvarProduto(payload: ProdutoPayload, id?: string) {
  if (id) {
    const { error } = await supabase.from('produtos').update(payload).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('produtos').insert(payload).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function listarCategorias() {
  const { data, error } = await supabase.from('categorias').select('id,nome,revestimento,ativo,site_categoria').order('nome')
  if (error) throw error
  return data as Categoria[]
}

export async function listarMarcas() {
  const { data, error } = await supabase.from('marcas').select('id,nome,ativo').order('nome')
  if (error) throw error
  return data as Marca[]
}

export async function listarUnidades() {
  const { data, error } = await supabase
    .from('unidades')
    .select('codigo,descricao,casas_decimais')
    .eq('ativo', true)
    .order('codigo')
  if (error) throw error
  return data as Unidade[]
}

export async function listarFornecedoresResumo() {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id,razao_social,nome_fantasia')
    .eq('status', 'ativo')
    .order('razao_social')
  if (error) throw error
  return data as FornecedorResumo[]
}

export async function criarCategoria(nome: string, revestimento: boolean) {
  const { error } = await supabase.from('categorias').insert({ nome: nome.trim(), revestimento })
  if (error) throw error
}

export async function atualizarCategoria(id: string, dados: Partial<Pick<Categoria, 'ativo' | 'revestimento' | 'nome' | 'site_categoria'>>) {
  const { error } = await supabase.from('categorias').update(dados).eq('id', id)
  if (error) throw error
}

export async function criarMarca(nome: string) {
  const { error } = await supabase.from('marcas').insert({ nome: nome.trim() })
  if (error) throw error
}

export async function atualizarMarca(id: string, dados: Partial<Pick<Marca, 'ativo' | 'nome'>>) {
  const { error } = await supabase.from('marcas').update(dados).eq('id', id)
  if (error) throw error
}

const TIPOS_IMAGEM: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024

export async function enviarImagem(produtoId: string, arquivo: File, ordem: number, principal: boolean) {
  const ext = TIPOS_IMAGEM[arquivo.type]
  if (!ext) throw new Error('Formato não suportado. Use JPG, PNG ou WEBP.')
  if (arquivo.size > TAMANHO_MAX_IMAGEM) throw new Error('A imagem deve ter no máximo 5 MB.')

  const caminho = `${produtoId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(BUCKET_PRODUTOS).upload(caminho, arquivo, { contentType: arquivo.type })
  if (up.error) throw up.error

  const { error } = await supabase
    .from('produto_imagens')
    .insert({ produto_id: produtoId, storage_path: caminho, ordem, principal })
  if (error) {
    await supabase.storage.from(BUCKET_PRODUTOS).remove([caminho])
    throw error
  }
}

export async function removerImagem(img: ProdutoImagem) {
  const { error } = await supabase.from('produto_imagens').delete().eq('id', img.id)
  if (error) throw error
  await supabase.storage.from(BUCKET_PRODUTOS).remove([img.storage_path])
}

export async function definirImagemPrincipal(img: ProdutoImagem) {
  const limpar = await supabase
    .from('produto_imagens')
    .update({ principal: false })
    .eq('produto_id', img.produto_id)
    .eq('principal', true)
  if (limpar.error) throw limpar.error
  const { error } = await supabase.from('produto_imagens').update({ principal: true }).eq('id', img.id)
  if (error) throw error
}
