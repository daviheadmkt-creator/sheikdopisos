import { supabase } from '@/lib/supabase'

const rpc = async <T>(fn: string, args: Record<string, unknown> = {}) => {
  const r = await supabase.rpc(fn, args)
  if (r.error) throw r.error
  return r.data as T
}

export interface Indicadores {
  faturamento: number
  faturamento_anterior: number
  faturamento_hoje: number
  qtd_vendas: number
  qtd_vendas_anterior: number
  qtd_vendas_hoje: number
  orcamentos_abertos_qtd: number
  orcamentos_abertos_valor: number
  orcamentos_vencendo: number
  orcamentos_periodo: number
  orcamentos_convertidos: number
  estoque_critico: number
  aguardando_separacao: number
  entregas_pendentes: number
  entregas_hoje: number
  entregas_atrasadas: number
  acesso_financeiro: boolean
  receber_aberto: number | null
  receber_vencido: number | null
  pagar_aberto: number | null
  pagar_vencido: number | null
  pagar_hoje: number | null
  saldo_caixa: number | null
  saldo_contas: number | null
  recebido: number | null
}

export const INDICADORES_VAZIOS: Indicadores = {
  faturamento: 0, faturamento_anterior: 0, faturamento_hoje: 0, qtd_vendas: 0, qtd_vendas_anterior: 0, qtd_vendas_hoje: 0,
  orcamentos_abertos_qtd: 0, orcamentos_abertos_valor: 0, orcamentos_vencendo: 0, orcamentos_periodo: 0, orcamentos_convertidos: 0,
  estoque_critico: 0, aguardando_separacao: 0, entregas_pendentes: 0, entregas_hoje: 0, entregas_atrasadas: 0, acesso_financeiro: false,
  receber_aberto: null, receber_vencido: null, pagar_aberto: null, pagar_vencido: null, pagar_hoje: null, saldo_caixa: null, saldo_contas: null, recebido: null,
}

export async function indicadores(de: string, ate: string): Promise<Indicadores> {
  const r = await rpc<Indicadores | Indicadores[] | null>('dashboard_indicadores', { p_de: de, p_ate: ate })
  const v = Array.isArray(r) ? r[0] : r
  return { ...INDICADORES_VAZIOS, ...(v ?? {}) }
}

export const faturamentoDiario = (de: string, ate: string) =>
  rpc<{ data: string; faturamento: number; qtd_vendas: number }[]>('dashboard_faturamento_diario', { p_de: de, p_ate: ate })
export const ultimasVendas = () =>
  rpc<{ id: string; numero: number; cliente: string; total: number; status: string; data: string; vendedor: string | null }[]>('dashboard_ultimas_vendas', { p_limite: 8 })

export interface ProdutoVendido {
  produto_id: string
  sku: string
  descricao: string
  categoria: string
  unidade: string
  quantidade: number
  caixas: number | null
  valor: number
  custo: number
  margem: number
  margem_perc: number | null
  qtd_vendas: number
}
export const produtosVendidos = (de: string, ate: string) => rpc<ProdutoVendido[]>('relatorio_produtos', { p_de: de, p_ate: ate })
export const vendasPorCategoria = (de: string, ate: string) =>
  rpc<{ categoria: string; valor: number; quantidade_itens: number; participacao: number }[]>('relatorio_vendas_categoria', { p_de: de, p_ate: ate })

/** Chamada genérica usada pelas definições de relatório. */
export const executarRelatorio = <T>(fn: string, args: Record<string, unknown>) => rpc<T[]>(fn, args).then((r) => r ?? [])
