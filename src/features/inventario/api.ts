import { supabase } from '@/lib/supabase'

export type StatusInventario = 'em_contagem' | 'em_revisao' | 'aprovado' | 'cancelado'

export interface Inventario {
  id: string
  numero: number
  deposito_id: string
  categoria_id: string | null
  descricao: string
  status: StatusInventario
  created_at: string
  enviado_revisao_em: string | null
  aprovado_em: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  deposito: { nome: string } | null
  categoria: { nome: string } | null
  inventario_itens: { count: number }[]
}

export interface ItemInventario {
  id: string
  inventario_id: string
  produto_id: string
  lote_id: string | null
  localizacao_id: string | null
  quantidade_sistema: number
  contagem_1: number | null
  contado_1_por: string | null
  contagem_2: number | null
  contado_2_por: string | null
  contagem_final: number | null
  diferenca: number | null
  recontagem_solicitada: boolean
  incluido_na_contagem: boolean
  observacao: string | null
  sku: string
  produto_descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  custo: number
  lote_codigo: string | null
  tonalidade: string | null
  calibre: string | null
  localizacao_codigo: string | null
}

export const STATUS_INVENTARIO: Record<StatusInventario, { label: string; variant: 'info' | 'default' | 'success' | 'neutral' }> = {
  em_contagem: { label: 'Em contagem', variant: 'info' },
  em_revisao: { label: 'Em revisão', variant: 'default' },
  aprovado: { label: 'Aprovado', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'neutral' },
}

const SELECT = '*, deposito:depositos(nome), categoria:categorias(nome), inventario_itens(count)'

export async function listarInventarios() {
  const r = await supabase.from('inventarios').select(SELECT).order('created_at', { ascending: false }).limit(100)
  if (r.error) throw r.error
  return r.data as unknown as Inventario[]
}

export async function obterInventario(id: string) {
  const r = await supabase.from('inventarios').select(SELECT).eq('id', id).single()
  if (r.error) throw r.error
  return r.data as unknown as Inventario
}

export async function listarItensInventario(id: string) {
  const r = await supabase
    .from('vw_inventario_itens')
    .select('*')
    .eq('inventario_id', id)
    .order('produto_descricao')
    .order('lote_codigo')
  if (r.error) throw r.error
  return r.data as ItemInventario[]
}

const rpc = async <T = void>(fn: string, args: Record<string, unknown>) => {
  const r = await supabase.rpc(fn, args)
  if (r.error) throw r.error
  return r.data as T
}

export const abrirInventario = (deposito: string, descricao: string, categoria: string) =>
  rpc<string>('abrir_inventario', { p_deposito: deposito, p_descricao: descricao, p_categoria: categoria || null })

export const registrarContagem = (item: string, quantidade: string, observacao?: string) =>
  rpc('registrar_contagem', { p_item: item, p_quantidade: quantidade || '0', p_observacao: observacao ?? null })

export const adicionarItemInventario = (a: { inventario: string; produto: string; lote: string; localizacao: string; quantidade: string }) =>
  rpc<string>('adicionar_item_inventario', {
    p_inventario: a.inventario,
    p_produto: a.produto,
    p_lote: a.lote || null,
    p_localizacao: a.localizacao || null,
    p_quantidade: a.quantidade,
  })

export const solicitarRecontagem = (inventario: string, itens: string[]) =>
  rpc('solicitar_recontagem', { p_inventario: inventario, p_itens: itens })

export const enviarParaRevisao = (inventario: string) => rpc('enviar_inventario_revisao', { p_inventario: inventario })

export const aprovarInventario = (inventario: string) => rpc<number>('aprovar_inventario', { p_inventario: inventario })

export const cancelarInventario = (inventario: string, motivo: string) =>
  rpc('cancelar_inventario', { p_inventario: inventario, p_motivo: motivo })
