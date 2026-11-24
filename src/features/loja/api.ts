import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'

export type SituacaoLoja = 'aguardando_pagamento' | 'integrado' | 'pendente' | 'cancelado' | 'atencao'

export const SITUACAO_LOJA: Record<SituacaoLoja, { label: string; variant: 'neutral' | 'success' | 'danger' | 'info' | 'default' }> = {
  integrado: { label: 'Integrado', variant: 'success' },
  aguardando_pagamento: { label: 'Aguardando pagamento', variant: 'neutral' },
  pendente: { label: 'Pendente', variant: 'default' },
  atencao: { label: 'Atenção', variant: 'danger' },
  cancelado: { label: 'Cancelado', variant: 'info' },
}

/** Status do WooCommerce em português. */
export const STATUS_WOO: Record<string, string> = {
  pending: 'Pagamento pendente',
  processing: 'Processando (pago)',
  'on-hold': 'Aguardando',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  failed: 'Falhou',
  'checkout-draft': 'Rascunho',
}

export interface PedidoLoja {
  id: string
  pedido_loja_id: number
  numero_loja: string
  status_loja: string
  situacao: SituacaoLoja
  mensagem: string | null
  cliente_id: string | null
  cliente_nome: string | null
  venda_id: string | null
  total_loja: number
  forma_pagamento: string | null
  pago_em: string | null
  recebido_em: string
  atualizado_em: string
  venda: { numero: number; status: string } | null
}

export async function listarPedidosLoja(f: { busca: string; situacao: string; pagina: number; porPagina: number }) {
  let q = supabase
    .from('loja_pedidos')
    .select(
      'id,pedido_loja_id,numero_loja,status_loja,situacao,mensagem,cliente_id,cliente_nome,venda_id,total_loja,forma_pagamento,pago_em,recebido_em,atualizado_em,venda:vendas(numero,status)',
      { count: 'exact' },
    )
  const b = sanitizarBusca(f.busca)
  if (b) q = q.or(`numero_loja.ilike.%${b}%,cliente_nome.ilike.%${b}%`)
  if (f.situacao) q = q.eq('situacao', f.situacao)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('recebido_em', { ascending: false }).range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as unknown as PedidoLoja[], total: r.count ?? 0 }
}

export async function contarPedidosLojaComProblema() {
  const r = await supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).in('situacao', ['pendente', 'atencao'])
  if (r.error) throw r.error
  return r.count ?? 0
}

export async function reprocessarPedidoLoja(id: string) {
  const r = await supabase.rpc('loja_reprocessar_pedido', { p_id: id })
  if (r.error) throw r.error
  return r.data as { situacao: SituacaoLoja; mensagem: string | null; venda_numero: number | null }
}
