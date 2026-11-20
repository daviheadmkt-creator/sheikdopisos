type Variante = 'default' | 'success' | 'danger' | 'info' | 'neutral' | 'dark'

export type StatusPedidoCompra = 'rascunho' | 'aprovado' | 'parcialmente_recebido' | 'recebido' | 'encerrado' | 'cancelado'
export type StatusSolicitacao = 'pendente' | 'em_cotacao' | 'em_pedido' | 'atendida' | 'cancelada'
export type StatusCotacao = 'aberta' | 'finalizada' | 'cancelada'
export type StatusRecebimento = 'em_conferencia' | 'confirmado' | 'cancelado'

export const STATUS_PEDIDO_COMPRA: Record<StatusPedidoCompra, { label: string; variant: Variante }> = {
  rascunho: { label: 'Rascunho', variant: 'neutral' },
  aprovado: { label: 'Aprovado', variant: 'info' },
  parcialmente_recebido: { label: 'Recebido parcial', variant: 'default' },
  recebido: { label: 'Recebido', variant: 'success' },
  encerrado: { label: 'Encerrado', variant: 'dark' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
}

export const STATUS_SOLICITACAO: Record<StatusSolicitacao, { label: string; variant: Variante }> = {
  pendente: { label: 'Pendente', variant: 'default' },
  em_cotacao: { label: 'Em cotação', variant: 'info' },
  em_pedido: { label: 'Em pedido', variant: 'dark' },
  atendida: { label: 'Atendida', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'neutral' },
}

export const STATUS_COTACAO: Record<StatusCotacao, { label: string; variant: Variante }> = {
  aberta: { label: 'Aberta', variant: 'info' },
  finalizada: { label: 'Finalizada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'neutral' },
}

export const STATUS_RECEBIMENTO: Record<StatusRecebimento, { label: string; variant: Variante }> = {
  em_conferencia: { label: 'Em conferência', variant: 'default' },
  confirmado: { label: 'Confirmado', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'neutral' },
}

export const URGENCIA: Record<string, { label: string; variant: Variante }> = {
  baixa: { label: 'Baixa', variant: 'neutral' },
  normal: { label: 'Normal', variant: 'info' },
  alta: { label: 'Alta', variant: 'danger' },
}

/** Item de pedido de compra em edição (decimais como string canônica). */
export interface ItemCompraForm {
  produto_id: string
  sku: string
  descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  codigo_fornecedor: string
  quantidade: string
  custo_unitario: string
  desconto_perc: string
  solicitacao_id: string
  /** somente leitura (pedidos já salvos) */
  quantidade_recebida?: number
}
