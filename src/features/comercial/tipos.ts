export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'convertido' | 'cancelado'
export type StatusVenda = 'rascunho' | 'confirmada' | 'cancelada' | 'concluida'
export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'crediario'

type Variante = 'default' | 'success' | 'danger' | 'info' | 'neutral' | 'dark'

export const STATUS_ORCAMENTO: Record<StatusOrcamento, { label: string; variant: Variante }> = {
  rascunho: { label: 'Rascunho', variant: 'neutral' },
  enviado: { label: 'Enviado', variant: 'info' },
  aprovado: { label: 'Aprovado', variant: 'success' },
  recusado: { label: 'Recusado', variant: 'danger' },
  convertido: { label: 'Convertido em venda', variant: 'dark' },
  cancelado: { label: 'Cancelado', variant: 'neutral' },
}

export const STATUS_VENDA: Record<StatusVenda, { label: string; variant: Variante }> = {
  rascunho: { label: 'Rascunho', variant: 'neutral' },
  confirmada: { label: 'Confirmada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'danger' },
  concluida: { label: 'Concluída', variant: 'dark' },
}

export const FORMAS_PAGAMENTO: Record<FormaPagamento, { label: string; parcelavel: boolean; prazo: boolean }> = {
  dinheiro: { label: 'Dinheiro', parcelavel: false, prazo: false },
  pix: { label: 'PIX', parcelavel: false, prazo: false },
  cartao_debito: { label: 'Cartão de débito', parcelavel: false, prazo: false },
  cartao_credito: { label: 'Cartão de crédito', parcelavel: true, prazo: false },
  boleto: { label: 'Boleto', parcelavel: true, prazo: true },
  transferencia: { label: 'Transferência', parcelavel: false, prazo: false },
  crediario: { label: 'Crediário próprio', parcelavel: true, prazo: true },
}
export const LISTA_FORMAS = Object.keys(FORMAS_PAGAMENTO) as FormaPagamento[]

/** Item editável (orçamento e venda). Decimais como string canônica. */
export interface ItemForm {
  produto_id: string
  sku: string
  descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: string
  modo: 'area' | 'quantidade'
  area_m2: string
  perc_sobra: string
  quantidade: string
  preco_unitario: string
  desconto_perc: string
  // somente venda
  saldo_id: string
  lote_id: string
  deposito_id: string
  localizacao_id: string
  observacao: string
}

export interface PagamentoForm {
  forma: FormaPagamento
  valor: string
  parcelas: string
  primeiro_vencimento: string
  intervalo_dias: string
  observacao: string
}

/** Converte o item do formulário no formato aceito pelas funções do servidor. */
export const itemParaPayload = (i: ItemForm, comEstoque: boolean) => ({
  produto_id: i.produto_id,
  area_m2: i.modo === 'area' && i.eh_revestimento ? i.area_m2 : '',
  perc_sobra: i.modo === 'area' ? i.perc_sobra || '0' : '0',
  quantidade: i.quantidade,
  preco_unitario: i.preco_unitario || '0',
  desconto_perc: i.desconto_perc || '0',
  observacao: i.observacao,
  ...(comEstoque ? { lote_id: i.lote_id, deposito_id: i.deposito_id, localizacao_id: i.localizacao_id } : {}),
})

export const itemParaCalculo = (i: ItemForm) => ({
  eh_revestimento: i.eh_revestimento,
  unidade: i.unidade,
  m2_por_caixa: i.m2_por_caixa,
  area_m2: i.modo === 'area' ? i.area_m2 : '',
  perc_sobra: i.perc_sobra,
  quantidade: i.quantidade,
  preco_unitario: i.preco_unitario,
  desconto_perc: i.desconto_perc,
})
