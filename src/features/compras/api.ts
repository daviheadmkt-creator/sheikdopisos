import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import type { StatusCotacao, StatusPedidoCompra, StatusRecebimento, StatusSolicitacao } from './tipos'

const ok = <T>(r: { data: unknown; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}
const rpc = async <T = void>(fn: string, args: Record<string, unknown>) => ok<T>(await supabase.rpc(fn, args))

// ----------------------------------------------------------------- Pedidos
export interface PedidoCompraLista {
  id: string
  numero: number
  status: StatusPedidoCompra
  fornecedor_id: string
  previsao_entrega: string | null
  total: number
  created_at: string
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null
}
export interface PedidoItemDB {
  id: string
  ordem: number
  produto_id: string
  descricao: string
  unidade: string
  codigo_fornecedor: string | null
  quantidade: number
  quantidade_recebida: number
  quantidade_pendente: number
  custo_unitario: number
  desconto_perc: number
  valor_total: number
  solicitacao_id: string | null
  sku: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
}
export interface PedidoCompraDB extends PedidoCompraLista {
  cotacao_id: string | null
  deposito_destino_id: string | null
  condicao_pagamento: string | null
  parcelas: number
  primeiro_vencimento_dias: number
  intervalo_dias: number
  subtotal: number
  desconto_total: number
  frete: number
  observacoes: string | null
  aprovado_em: string | null
  motivo_encerramento: string | null
  updated_at: string
  itens: PedidoItemDB[]
  recebimentos: RecebimentoLista[]
}

export async function listarPedidosCompra(f: { busca: string; status: string; pagina: number; porPagina: number; fornecedorId?: string }) {
  let q = supabase
    .from('compras_pedidos')
    .select('id,numero,status,fornecedor_id,previsao_entrega,total,created_at,fornecedor:fornecedores(razao_social,nome_fantasia)', { count: 'exact' })
  const t = sanitizarBusca(f.busca)
  if (/^\d{1,12}$/.test(t)) q = q.eq('numero', t)
  if (f.status) q = q.eq('status', f.status)
  if (f.fornecedorId) q = q.eq('fornecedor_id', f.fornecedorId)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('created_at', { ascending: false }).range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as unknown as PedidoCompraLista[], total: r.count ?? 0 }
}

export async function obterPedidoCompra(id: string): Promise<PedidoCompraDB> {
  const [p, itens, recs] = await Promise.all([
    supabase.from('compras_pedidos').select('*, fornecedor:fornecedores(razao_social,nome_fantasia)').eq('id', id).single(),
    supabase.from('vw_compras_pedido_itens').select('*').eq('pedido_id', id).order('ordem'),
    supabase.from('compras_recebimentos').select('id,numero,status,nota_fiscal,data_recebimento,pedido_id,created_at,conferido_por_nome').eq('pedido_id', id).order('created_at'),
  ])
  const pedido = ok<PedidoCompraDB>(p)
  return { ...pedido, itens: ok<PedidoItemDB[]>(itens), recebimentos: ok<RecebimentoLista[]>(recs) }
}

export const salvarPedidoCompra = (cab: Record<string, unknown>, itens: unknown[]) => rpc<string>('salvar_pedido_compra', { p: cab, p_itens: itens })
export const aprovarPedidoCompra = (id: string) => rpc('aprovar_pedido_compra', { p_id: id })
export const encerrarPedidoCompra = (id: string, motivo: string) => rpc('encerrar_pedido_compra', { p_id: id, p_motivo: motivo })

// ----------------------------------------------------------------- Solicitações
export interface Solicitacao {
  id: string
  numero: number
  produto_id: string
  quantidade: number
  motivo: string | null
  urgencia: string
  necessario_ate: string | null
  status: StatusSolicitacao
  pedido_id: string | null
  pedido_numero: number | null
  created_at: string
  created_by_nome: string | null
  sku: string
  produto_descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
}
export async function listarSolicitacoes(status: string) {
  let q = supabase.from('vw_compras_solicitacoes').select('*')
  if (status === 'abertas') q = q.in('status', ['pendente', 'em_cotacao', 'em_pedido'])
  else if (status) q = q.eq('status', status)
  return ok<Solicitacao[]>(await q.order('created_at', { ascending: false }).limit(300))
}
export async function criarSolicitacao(s: { produto_id: string; quantidade: string; motivo: string; urgencia: string; necessario_ate: string }) {
  ok(await supabase.from('compras_solicitacoes').insert({ ...s, motivo: s.motivo.trim() || null, necessario_ate: s.necessario_ate || null }))
}
export async function cancelarSolicitacao(id: string) {
  ok(await supabase.from('compras_solicitacoes').update({ status: 'cancelada' }).eq('id', id))
}
export const gerarSolicitacoesCriticas = () => rpc<number>('gerar_solicitacoes_estoque_critico', {})

// ----------------------------------------------------------------- Cotações
export interface CotacaoLista {
  id: string
  numero: number
  descricao: string
  prazo_resposta: string | null
  status: StatusCotacao
  created_at: string
  compras_cotacao_itens: { count: number }[]
  compras_cotacao_fornecedores: { count: number }[]
}
export interface CotacaoDB {
  id: string
  numero: number
  descricao: string
  prazo_resposta: string | null
  status: StatusCotacao
  observacoes: string | null
  created_at: string
  compras_cotacao_itens: {
    id: string
    ordem: number
    produto_id: string
    quantidade: number
    solicitacao_id: string | null
    fornecedor_vencedor_id: string | null
    produto: { sku: string; descricao: string; unidade: string; eh_revestimento: boolean; m2_por_caixa: number | null; preco_venda: number } | null
  }[]
  compras_cotacao_fornecedores: {
    id: string
    fornecedor_id: string
    prazo_entrega_dias: number | null
    frete: number
    condicao_pagamento: string | null
    observacao: string | null
    fornecedor: { razao_social: string; nome_fantasia: string | null } | null
    compras_cotacao_precos: { cotacao_item_id: string; custo_unitario: number }[]
  }[]
}
export async function listarCotacoes() {
  return ok<CotacaoLista[]>(
    await supabase
      .from('compras_cotacoes')
      .select('id,numero,descricao,prazo_resposta,status,created_at,compras_cotacao_itens(count),compras_cotacao_fornecedores(count)')
      .order('created_at', { ascending: false })
      .limit(100),
  )
}
const SELECT_COTACAO: string = [
  '*',
  'compras_cotacao_itens(*,produto:produtos(sku,descricao,unidade,eh_revestimento,m2_por_caixa,preco_venda))',
  'compras_cotacao_fornecedores(*,fornecedor:fornecedores(razao_social,nome_fantasia),compras_cotacao_precos(cotacao_item_id,custo_unitario))',
].join(',')
export async function obterCotacao(id: string) {
  const c = ok<CotacaoDB>(await supabase.from('compras_cotacoes').select(SELECT_COTACAO).eq('id', id).single())
  c.compras_cotacao_itens.sort((a, b) => a.ordem - b.ordem)
  return c
}
export const salvarCotacao = (cab: Record<string, unknown>, itens: unknown[], fornecedores: unknown[]) =>
  rpc<string>('salvar_cotacao', { p: cab, p_itens: itens, p_fornecedores: fornecedores })
export const finalizarCotacao = (id: string) => rpc<number>('finalizar_cotacao', { p_id: id })
export async function cancelarCotacao(id: string) {
  ok(await supabase.from('compras_cotacoes').update({ status: 'cancelada' }).eq('id', id))
}

// ----------------------------------------------------------------- Recebimentos
export interface RecebimentoLista {
  id: string
  numero: number
  status: StatusRecebimento
  nota_fiscal: string | null
  data_recebimento: string
  pedido_id: string
  created_at: string
  conferido_por_nome: string | null
  pedido?: { numero: number; fornecedor: { razao_social: string; nome_fantasia: string | null } | null } | null
}
export interface RecebimentoDB extends RecebimentoLista {
  deposito_id: string
  observacoes: string | null
  confirmado_em: string | null
  motivo_cancelamento: string | null
  compras_recebimento_itens: {
    id: string
    pedido_item_id: string
    produto_id: string
    quantidade: number
    lote_id: string | null
    lote_codigo: string | null
    tonalidade: string | null
    calibre: string | null
    localizacao_id: string | null
    divergencia: string | null
    movimentacao_id: string | null
    lote: { codigo: string; tonalidade: string | null; calibre: string | null } | null
  }[]
}
export async function listarRecebimentos(status: string) {
  let q = supabase
    .from('compras_recebimentos')
    .select('id,numero,status,nota_fiscal,data_recebimento,pedido_id,created_at,conferido_por_nome,pedido:compras_pedidos(numero,fornecedor:fornecedores(razao_social,nome_fantasia))')
  if (status) q = q.eq('status', status)
  return ok<RecebimentoLista[]>(await q.order('created_at', { ascending: false }).limit(100))
}
export async function obterRecebimento(id: string) {
  return ok<RecebimentoDB>(
    await supabase
      .from('compras_recebimentos')
      .select('*, compras_recebimento_itens(*, lote:lotes(codigo,tonalidade,calibre))')
      .eq('id', id)
      .single(),
  )
}
export const salvarRecebimento = (cab: Record<string, unknown>, itens: unknown[]) => rpc<string>('salvar_recebimento', { p: cab, p_itens: itens })
export const confirmarRecebimento = (id: string) => rpc<number>('confirmar_recebimento', { p_id: id })
export const cancelarRecebimento = (id: string, motivo: string) => rpc('cancelar_recebimento', { p_id: id, p_motivo: motivo })
