import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import type { FormaPagamento } from '@/features/comercial/tipos'

const ok = <T>(r: { data: unknown; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}
const rpc = async <T = void>(fn: string, args: Record<string, unknown>) => ok<T>(await supabase.rpc(fn, args))

export type TipoTitulo = 'receber' | 'pagar'
export type TipoConta = 'caixa' | 'banco' | 'carteira'

// ----------------------------------------------------------------- Cadastros
export interface ContaFinanceira {
  id: string
  nome: string
  tipo: TipoConta
  banco: string | null
  agencia: string | null
  numero_conta: string | null
  saldo_inicial: number
  data_saldo_inicial: string
  ativo: boolean
  saldo_atual: number
  sessao_aberta_id: string | null
}
export interface Categoria {
  id: string
  nome: string
  tipo: TipoTitulo
  grupo_dre: string
  sistema: boolean
  ativo: boolean
}
export interface CentroCusto {
  id: string
  nome: string
  ativo: boolean
}
export interface ParametrosFinanceiros {
  multa_perc: number
  juros_mes_perc: number
  dias_carencia: number
}

export const listarContas = async () => ok<ContaFinanceira[]>(await supabase.from('vw_contas_financeiras').select('*').order('tipo').order('nome'))
export async function salvarConta(c: { nome: string; tipo: TipoConta; banco: string; agencia: string; numero_conta: string; saldo_inicial: string; data_saldo_inicial: string }) {
  ok(await supabase.from('contas_financeiras').insert({ ...c, banco: c.banco || null, agencia: c.agencia || null, numero_conta: c.numero_conta || null, saldo_inicial: c.saldo_inicial || '0' }))
}
export async function alterarContaAtiva(id: string, ativo: boolean) {
  ok(await supabase.from('contas_financeiras').update({ ativo }).eq('id', id))
}
export const listarCategorias = async () => ok<Categoria[]>(await supabase.from('categorias_financeiras').select('*').order('tipo').order('nome'))
export async function criarCategoria(nome: string, tipo: TipoTitulo, grupo_dre: string) {
  ok(await supabase.from('categorias_financeiras').insert({ nome: nome.trim(), tipo, grupo_dre }))
}
export async function alterarCategoriaAtiva(id: string, ativo: boolean) {
  ok(await supabase.from('categorias_financeiras').update({ ativo }).eq('id', id))
}
export const listarCentros = async () => ok<CentroCusto[]>(await supabase.from('centros_custo').select('*').order('nome'))
export async function criarCentro(nome: string) {
  ok(await supabase.from('centros_custo').insert({ nome: nome.trim() }))
}
export const PARAMETROS_FIN_PADRAO: ParametrosFinanceiros = { multa_perc: 2, juros_mes_perc: 1, dias_carencia: 0 }
export async function obterParametrosFin() {
  const l = ok<ParametrosFinanceiros[]>(await supabase.from('parametros_financeiros').select('*').limit(1))
  return l?.[0] ?? PARAMETROS_FIN_PADRAO
}
export async function salvarParametrosFin(p: ParametrosFinanceiros) {
  ok(await supabase.from('parametros_financeiros').update(p).eq('id', true))
}

export const GRUPOS_DRE: Record<string, { label: string; tipo: TipoTitulo }> = {
  receita_vendas: { label: 'Receita de vendas', tipo: 'receber' },
  outras_receitas: { label: 'Outras receitas operacionais', tipo: 'receber' },
  receitas_financeiras: { label: 'Receitas financeiras', tipo: 'receber' },
  estoque: { label: 'Estoque (compras — entra no CMV)', tipo: 'pagar' },
  despesas_vendas: { label: 'Despesas com vendas', tipo: 'pagar' },
  despesas_pessoal: { label: 'Despesas com pessoal', tipo: 'pagar' },
  despesas_ocupacao: { label: 'Ocupação', tipo: 'pagar' },
  despesas_administrativas: { label: 'Despesas administrativas', tipo: 'pagar' },
  despesas_financeiras: { label: 'Despesas financeiras', tipo: 'pagar' },
  impostos: { label: 'Impostos e taxas', tipo: 'pagar' },
  nao_operacional: { label: 'Não operacional', tipo: 'pagar' },
}

// ----------------------------------------------------------------- Títulos e parcelas
export interface Parcela {
  id: string
  titulo_id: string
  numero: number
  vencimento: string
  valor: number
  valor_pago: number
  valor_aberto: number
  juros_pagos: number
  descontos: number
  status: 'aberta' | 'parcial' | 'paga' | 'cancelada'
  forma_prevista: FormaPagamento | null
  liquidada_em: string | null
  dias_atraso: number
  titulo_numero: number
  tipo: TipoTitulo
  descricao: string
  documento_tipo: 'manual' | 'venda' | 'compra'
  documento_id: string | null
  titulo_status: string
  total_parcelas: number
  pessoa_nome: string | null
  categoria_nome: string | null
  centro_custo_nome: string | null
}

export interface FiltrosParcelas {
  tipo: TipoTitulo
  situacao: 'abertas' | 'vencidas' | 'pagas' | 'todas'
  busca: string
  de: string
  ate: string
  pagina: number
  porPagina: number
}

export async function listarParcelas(f: FiltrosParcelas) {
  let q = supabase.from('vw_parcelas').select('*', { count: 'exact' }).eq('tipo', f.tipo)
  if (f.situacao === 'abertas') q = q.in('status', ['aberta', 'parcial'])
  if (f.situacao === 'vencidas') q = q.in('status', ['aberta', 'parcial']).gt('dias_atraso', 0)
  if (f.situacao === 'pagas') q = q.eq('status', 'paga')
  if (f.de) q = q.gte('vencimento', f.de)
  if (f.ate) q = q.lte('vencimento', f.ate)
  const t = sanitizarBusca(f.busca)
  if (t) {
    const filtros = [`descricao.ilike.%${t}%`, `pessoa_nome.ilike.%${t}%`, `categoria_nome.ilike.%${t}%`]
    if (/^\d{1,12}$/.test(t)) filtros.push(`titulo_numero.eq.${t}`)
    q = q.or(filtros.join(','))
  }
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('vencimento').order('titulo_numero').range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as Parcela[], total: r.count ?? 0 }
}

export async function totaisParcelas(f: Omit<FiltrosParcelas, 'pagina' | 'porPagina'>) {
  const todas = await listarParcelas({ ...f, pagina: 1, porPagina: 2000 })
  return todas.linhas.reduce((s, p) => s + Number(p.valor_aberto), 0)
}

export const parcelasDoTitulo = async (tituloId: string) =>
  ok<Parcela[]>(await supabase.from('vw_parcelas').select('*').eq('titulo_id', tituloId).order('numero'))

export const parcelasAbertasCliente = async (busca: string) => {
  let q = supabase.from('vw_parcelas').select('*').eq('tipo', 'receber').in('status', ['aberta', 'parcial'])
  const t = sanitizarBusca(busca)
  if (t) q = /^\d{1,12}$/.test(t) ? q.or(`titulo_numero.eq.${t},descricao.ilike.%${t}%`) : q.or(`pessoa_nome.ilike.%${t}%,descricao.ilike.%${t}%`)
  return ok<Parcela[]>(await q.order('vencimento').limit(30))
}

export const liquidarParcela = (p: { parcela_id: string; conta_id: string; data: string; principal: string; juros: string; desconto: string; forma: string; chave_idempotencia: string }) =>
  rpc<string>('liquidar_parcela', { p })
export const criarTitulo = (p: Record<string, unknown>) => rpc<string>('criar_titulo', { p })
export const cancelarTitulo = (id: string, motivo: string) => rpc('cancelar_titulo', { p_titulo: id, p_motivo: motivo })

// ----------------------------------------------------------------- Movimentos
export interface Movimento {
  id: string
  numero: number
  conta_id: string
  conta_nome: string
  tipo: 'entrada' | 'saida'
  natureza: 'recebimento' | 'pagamento' | 'suprimento' | 'sangria' | 'transferencia' | 'ajuste' | 'estorno'
  valor: number
  data: string
  descricao: string
  forma_pagamento: FormaPagamento | null
  valor_juros: number
  valor_desconto: number
  categoria_nome: string | null
  titulo_numero: number | null
  parcela_numero: number | null
  sessao_numero: number | null
  caixa_sessao_id: string | null
  estorno_de: string | null
  estornado: boolean
  created_at: string
  created_by_nome: string | null
}
export async function listarMovimentos(f: { conta: string; de: string; ate: string; sessao?: string; tituloId?: string }) {
  let q = supabase.from('vw_movimentos_financeiros').select('*')
  if (f.conta) q = q.eq('conta_id', f.conta)
  if (f.sessao) q = q.eq('caixa_sessao_id', f.sessao)
  if (f.tituloId) q = q.eq('titulo_id', f.tituloId)
  if (f.de) q = q.gte('data', f.de)
  if (f.ate) q = q.lte('data', f.ate)
  return ok<Movimento[]>(await q.order('created_at', { ascending: false }).limit(500))
}
export const estornarMovimento = (id: string, motivo: string) => rpc<number>('estornar_movimento', { p_movimento: id, p_motivo: motivo })
export const transferir = (p: { conta_origem_id: string; conta_destino_id: string; valor: string; data: string; descricao: string; chave_idempotencia: string }) =>
  rpc<string>('transferir_entre_contas', { p })

// ----------------------------------------------------------------- Caixa
export interface SessaoCaixa {
  id: string
  numero: number
  conta_id: string
  operador_id: string
  operador_nome: string | null
  status: 'aberto' | 'fechado'
  aberto_em: string
  valor_abertura: number
  saldo_sistema_abertura: number
  fechado_em: string | null
  valor_esperado: number | null
  valor_contado: number | null
  diferenca: number | null
  observacoes: string | null
  conta: { nome: string } | null
}
export const listarSessoes = async (limite = 50) =>
  ok<SessaoCaixa[]>(await supabase.from('caixa_sessoes').select('*, conta:contas_financeiras(nome)').order('aberto_em', { ascending: false }).limit(limite))
export const abrirCaixa = (conta: string, valor: string, obs: string) => rpc<string>('abrir_caixa', { p_conta: conta, p_valor_abertura: valor || '0', p_observacoes: obs || null })
export const movimentarCaixa = (p: { tipo: 'suprimento' | 'sangria'; conta_id: string; outra_conta_id: string; valor: string; descricao: string; chave_idempotencia: string }) =>
  rpc<string>('movimentar_caixa', { p })
export const fecharCaixa = (sessao: string, contado: string, obs: string) => rpc<number>('fechar_caixa', { p_sessao: sessao, p_valor_contado: contado || '0', p_observacoes: obs || null })

// ----------------------------------------------------------------- Relatórios
export interface Resumo {
  faturamento: number
  recebido: number
  pago: number
  saldo_contas: number
  receber_aberto: number
  receber_vencido: number
  pagar_aberto: number
  pagar_7_dias: number
}
export async function resumoFinanceiro(de: string, ate: string) {
  const r = await rpc<Resumo | Resumo[] | null>('resumo_financeiro', { p_de: de, p_ate: ate })
  const v = Array.isArray(r) ? r[0] : r
  return v ?? { faturamento: 0, recebido: 0, pago: 0, saldo_contas: 0, receber_aberto: 0, receber_vencido: 0, pagar_aberto: 0, pagar_7_dias: 0 }
}
export interface DiaFluxo {
  data: string
  entradas_realizadas: number
  saidas_realizadas: number
  entradas_previstas: number
  saidas_previstas: number
}
export const fluxoCaixa = (de: string, ate: string) => rpc<DiaFluxo[]>('fluxo_caixa', { p_de: de, p_ate: ate })
export interface LinhaDRE {
  ordem: number
  tipo: 'linha' | 'total' | 'despesa' | 'resultado'
  descricao: string
  valor: number
}
export const dreGerencial = (de: string, ate: string) => rpc<LinhaDRE[]>('dre_gerencial', { p_de: de, p_ate: ate })
