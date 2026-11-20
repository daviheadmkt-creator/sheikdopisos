import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import type { FormaPagamento, StatusOrcamento, StatusVenda } from './tipos'

const ok = <T>(r: { data: unknown; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}

// ----------------------------------------------------------------- Parâmetros
export interface ParametrosComerciais {
  reservar_ao_confirmar: boolean
  validade_orcamento_dias: number
  validade_reserva_dias: number
  perc_sobra_padrao: number
  desconto_max_sem_aprovacao: number
}
export const PARAMETROS_PADRAO: ParametrosComerciais = {
  reservar_ao_confirmar: true,
  validade_orcamento_dias: 10,
  validade_reserva_dias: 7,
  perc_sobra_padrao: 10,
  desconto_max_sem_aprovacao: 5,
}
export async function obterParametros() {
  const r = await supabase.from('parametros_comerciais').select('*').limit(1)
  const linhas = ok<ParametrosComerciais[]>(r)
  return linhas?.[0] ?? PARAMETROS_PADRAO
}

// ----------------------------------------------------------------- Tipos de leitura
interface ItemDB {
  id: string
  ordem: number
  produto_id: string
  descricao: string
  unidade: string
  m2_por_caixa: number | null
  area_m2: number | null
  perc_sobra: number
  caixas: number | null
  quantidade: number
  preco_unitario: number
  desconto_perc: number
  valor_bruto: number
  valor_desconto: number
  valor_total: number
  observacao: string | null
  produto: { sku: string; eh_revestimento: boolean; m2_por_caixa: number | null } | null
}
export interface ClienteResumo {
  id: string
  nome: string
  razao_social: string | null
  documento: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
}

export interface OrcamentoLista {
  id: string
  numero: number
  status: StatusOrcamento
  cliente_id: string | null
  cliente_nome: string | null
  vendedor_id: string | null
  validade: string
  total: number
  created_at: string
  cliente: { nome: string } | null
}
export interface OrcamentoDB extends OrcamentoLista {
  cliente_telefone: string | null
  condicoes_pagamento: string | null
  observacoes: string | null
  subtotal: number
  desconto_total: number
  frete: number
  venda_id: string | null
  motivo_status: string | null
  updated_at: string
  cliente: ClienteResumo | null
  orcamento_itens: ItemDB[]
}

export interface VendaItemDB extends ItemDB {
  lote_id: string | null
  deposito_id: string | null
  localizacao_id: string | null
  reserva_id: string | null
  lote: { codigo: string; tonalidade: string | null; calibre: string | null } | null
  deposito: { nome: string } | null
}
export interface VendaLista {
  id: string
  numero: number
  status: StatusVenda
  cliente_id: string
  vendedor_id: string | null
  total: number
  tipo_entrega: 'retirada' | 'entrega'
  created_at: string
  confirmada_em: string | null
  cliente: { nome: string } | null
}
export interface VendaDB extends VendaLista {
  orcamento_id: string | null
  endereco_entrega_id: string | null
  subtotal: number
  desconto_total: number
  frete: number
  observacoes: string | null
  motivo_cancelamento: string | null
  updated_at: string
  cliente: ClienteResumo | null
  endereco: {
    logradouro: string
    numero: string
    complemento: string | null
    bairro: string
    cidade: string
    uf: string
    cep: string
  } | null
  orcamento: { numero: number } | null
  venda_itens: VendaItemDB[]
  venda_pagamentos: {
    id: string
    forma: FormaPagamento
    valor: number
    parcelas: number
    primeiro_vencimento: string | null
    intervalo_dias: number
    observacao: string | null
  }[]
}

export interface FiltrosDocumentos {
  busca: string
  status: string
  de: string
  ate: string
  pagina: number
  porPagina: number
}

const CLIENTE = 'cliente:clientes(id,nome,razao_social,documento,telefone,whatsapp,email)'
const ITEM_PRODUTO = 'produto:produtos(sku,eh_revestimento,m2_por_caixa)'

interface Filtravel {
  or(s: string): Filtravel
  eq(c: string, v: string): Filtravel
  gte(c: string, v: string): Filtravel
  lte(c: string, v: string): Filtravel
}

function aplicarFiltros<T>(consulta: T, f: FiltrosDocumentos, colunaNome: string | null): T {
  return filtrar(consulta as unknown as Filtravel, f, colunaNome) as unknown as T
}

function filtrar(q: Filtravel, f: FiltrosDocumentos, colunaNome: string | null) {
  const t = sanitizarBusca(f.busca)
  if (t) {
    if (/^\d{1,12}$/.test(t)) q = q.or(`numero.eq.${t}`)
    else if (colunaNome) q = q.or(`${colunaNome}.ilike.%${t}%`)
  }
  if (f.status) q = q.eq('status', f.status)
  if (f.de) q = q.gte('created_at', new Date(`${f.de}T00:00:00`).toISOString())
  if (f.ate) q = q.lte('created_at', new Date(`${f.ate}T23:59:59.999`).toISOString())
  return q
}

// ----------------------------------------------------------------- Orçamentos
export async function listarOrcamentos(f: FiltrosDocumentos) {
  const q = aplicarFiltros(
    supabase.from('orcamentos').select('id,numero,status,cliente_id,cliente_nome,vendedor_id,validade,total,created_at,cliente:clientes(nome)', { count: 'exact' }),
    f,
    'cliente_nome',
  )
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('created_at', { ascending: false }).range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as unknown as OrcamentoLista[], total: r.count ?? 0 }
}

export async function obterOrcamento(id: string) {
  const r = await supabase.from('orcamentos').select(`*, ${CLIENTE}, orcamento_itens(*, ${ITEM_PRODUTO})`).eq('id', id).single()
  const o = ok<OrcamentoDB>(r)
  o.orcamento_itens.sort((a, b) => a.ordem - b.ordem)
  return o
}

export async function salvarOrcamento(cabecalho: Record<string, unknown>, itens: unknown[]) {
  return ok<string>(await supabase.rpc('salvar_orcamento', { p: cabecalho, p_itens: itens }))
}
export async function alterarStatusOrcamento(id: string, status: StatusOrcamento, motivo?: string) {
  ok(await supabase.rpc('alterar_status_orcamento', { p_id: id, p_status: status, p_motivo: motivo ?? null }))
}
export async function converterOrcamentoEmVenda(id: string) {
  return ok<string>(await supabase.rpc('converter_orcamento_em_venda', { p_id: id }))
}

// ----------------------------------------------------------------- Vendas
export async function listarVendas(f: FiltrosDocumentos & { clienteId?: string }) {
  let q = aplicarFiltros(
    supabase.from('vendas').select('id,numero,status,cliente_id,vendedor_id,total,tipo_entrega,created_at,confirmada_em,cliente:clientes(nome)', { count: 'exact' }),
    f,
    null,
  )
  if (f.clienteId) q = q.eq('cliente_id', f.clienteId)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('created_at', { ascending: false }).range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as unknown as VendaLista[], total: r.count ?? 0 }
}

const SELECT_VENDA: string = [
  '*',
  CLIENTE,
  'endereco:cliente_enderecos(logradouro,numero,complemento,bairro,cidade,uf,cep)',
  'orcamento:orcamentos!vendas_orcamento_id_fkey(numero)',
  `venda_itens(*,${ITEM_PRODUTO},lote:lotes(codigo,tonalidade,calibre),deposito:depositos(nome))`,
  'venda_pagamentos(*)',
].join(',')

export async function obterVenda(id: string) {
  const r = await supabase.from('vendas').select(SELECT_VENDA).eq('id', id).single()
  const v = ok<VendaDB>(r)
  v.venda_itens.sort((a, b) => a.ordem - b.ordem)
  return v
}

export async function salvarVenda(cabecalho: Record<string, unknown>, itens: unknown[], pagamentos: unknown[]) {
  return ok<string>(await supabase.rpc('salvar_venda', { p: cabecalho, p_itens: itens, p_pagamentos: pagamentos }))
}
export async function confirmarVenda(id: string) {
  ok(await supabase.rpc('confirmar_venda', { p_id: id }))
}
export async function cancelarVenda(id: string, motivo: string) {
  ok(await supabase.rpc('cancelar_venda', { p_id: id, p_motivo: motivo }))
}

// ----------------------------------------------------------------- Clientes
export async function listarEnderecosCliente(clienteId: string) {
  return ok<{ id: string; descricao: string | null; logradouro: string; numero: string; bairro: string; cidade: string; uf: string; principal: boolean }[]>(
    await supabase.from('cliente_enderecos').select('id,descricao,logradouro,numero,bairro,cidade,uf,principal').eq('cliente_id', clienteId).order('principal', { ascending: false }),
  )
}

// ----------------------------------------------------------------- Empresa (cabeçalho de impressão)
export interface Empresa {
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}
export async function obterEmpresa() {
  const linhas = ok<Empresa[]>(await supabase.from('empresas').select('*').limit(1))
  return linhas?.[0] ?? null
}
