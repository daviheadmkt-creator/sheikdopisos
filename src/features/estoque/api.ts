import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import type { TipoMovimentacao } from './regras'

// ----------------------------------------------------------------- Tipos
export interface Deposito {
  id: string
  codigo: string
  nome: string
  endereco: string | null
  padrao: boolean
  ativo: boolean
}
export interface Localizacao {
  id: string
  deposito_id: string
  codigo: string
  descricao: string | null
  ativo: boolean
}
export interface Lote {
  id: string
  produto_id: string
  codigo: string
  tonalidade: string | null
  calibre: string | null
  data_fabricacao: string | null
  bloqueado: boolean
  motivo_bloqueio: string | null
  observacoes: string | null
}
export interface LoteResumo extends Lote {
  sku: string
  produto_descricao: string
  unidade: string
  m2_por_caixa: number | null
  fisico: number
  reservado: number
  avariado: number
  disponivel: number
  created_at: string
}
export interface SaldoDetalhe {
  id: string
  produto_id: string
  lote_id: string | null
  deposito_id: string
  localizacao_id: string | null
  quantidade_fisica: number
  quantidade_reservada: number
  quantidade_avariada: number
  quantidade_disponivel: number
  sku: string
  produto_descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  lote_codigo: string | null
  tonalidade: string | null
  calibre: string | null
  lote_bloqueado: boolean
  deposito_nome: string
  localizacao_codigo: string | null
}
export interface EstoqueProduto {
  produto_id: string
  sku: string
  descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  estoque_minimo: number
  status: string
  fisico: number
  reservado: number
  avariado: number
  disponivel: number
  critico: boolean
  lotes_com_saldo: number
}
export interface Movimentacao {
  id: string
  numero: number
  tipo: TipoMovimentacao
  produto_id: string
  quantidade: number
  custo_unitario: number | null
  saldo_origem_apos: number | null
  saldo_destino_apos: number | null
  motivo: string | null
  documento_tipo: string
  documento_id: string | null
  observacoes: string | null
  created_at: string
  created_by_nome: string | null
  sku: string
  produto_descricao: string
  unidade: string
  m2_por_caixa: number | null
  lote_codigo: string | null
  tonalidade: string | null
  calibre: string | null
  deposito_origem_nome: string | null
  localizacao_origem_codigo: string | null
  deposito_destino_nome: string | null
  localizacao_destino_codigo: string | null
}
export interface Reserva {
  id: string
  numero: number
  produto_id: string
  lote_id: string | null
  deposito_id: string
  localizacao_id: string | null
  quantidade: number
  quantidade_consumida: number
  quantidade_restante: number
  status: 'ativa' | 'consumida' | 'liberada'
  vencida: boolean
  documento_tipo: string
  documento_id: string | null
  validade: string | null
  observacoes: string | null
  created_at: string
  created_by_nome: string | null
  motivo_encerramento: string | null
  sku: string
  produto_descricao: string
  unidade: string
  m2_por_caixa: number | null
  lote_codigo: string | null
  tonalidade: string | null
  deposito_nome: string
  localizacao_codigo: string | null
  cliente_nome: string | null
}

const lancar = <T>(r: { data: T | null; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}

// ----------------------------------------------------------------- Depósitos
export async function listarDepositos() {
  return lancar(await supabase.from('depositos').select('*').order('padrao', { ascending: false }).order('nome')) as Deposito[]
}
export async function salvarDeposito(d: { codigo: string; nome: string; endereco?: string }) {
  const r = await supabase
    .from('depositos')
    .insert({ codigo: d.codigo.trim().toUpperCase(), nome: d.nome.trim(), endereco: d.endereco?.trim() || null })
  if (r.error) throw r.error
}
export async function alterarDepositoAtivo(id: string, ativo: boolean) {
  const r = await supabase.from('depositos').update({ ativo }).eq('id', id)
  if (r.error) throw r.error
}
export async function listarLocalizacoes(depositoId?: string) {
  let q = supabase.from('localizacoes').select('*').order('codigo')
  if (depositoId) q = q.eq('deposito_id', depositoId)
  return lancar(await q) as Localizacao[]
}
export async function criarLocalizacao(depositoId: string, codigo: string, descricao: string) {
  const r = await supabase
    .from('localizacoes')
    .insert({ deposito_id: depositoId, codigo: codigo.trim().toUpperCase(), descricao: descricao.trim() || null })
  if (r.error) throw r.error
}
export async function alterarLocalizacaoAtiva(id: string, ativo: boolean) {
  const r = await supabase.from('localizacoes').update({ ativo }).eq('id', id)
  if (r.error) throw r.error
}

// ----------------------------------------------------------------- Lotes
export async function listarLotesDoProduto(produtoId: string) {
  return lancar(
    await supabase.from('lotes').select('*').eq('produto_id', produtoId).order('created_at', { ascending: false }),
  ) as Lote[]
}
export interface FiltrosLotes {
  busca: string
  situacao: '' | 'com_saldo' | 'bloqueados'
  pagina: number
  porPagina: number
}
export async function listarLotes(f: FiltrosLotes) {
  let q = supabase.from('vw_lotes').select('*', { count: 'exact' })
  const t = sanitizarBusca(f.busca)
  if (t) q = q.or(`codigo.ilike.%${t}%,tonalidade.ilike.%${t}%,sku.ilike.%${t}%,produto_descricao.ilike.%${t}%`)
  if (f.situacao === 'com_saldo') q = q.gt('fisico', 0)
  if (f.situacao === 'bloqueados') q = q.eq('bloqueado', true)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('produto_descricao').order('codigo').range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as LoteResumo[], total: r.count ?? 0 }
}
export interface LoteForm {
  produto_id: string
  codigo: string
  tonalidade: string
  calibre: string
  data_fabricacao: string
  observacoes: string
}
export async function criarLote(l: LoteForm) {
  const r = await supabase
    .from('lotes')
    .insert({
      produto_id: l.produto_id,
      codigo: l.codigo.trim().toUpperCase(),
      tonalidade: l.tonalidade.trim().toUpperCase() || null,
      calibre: l.calibre.trim().toUpperCase() || null,
      data_fabricacao: l.data_fabricacao || null,
      observacoes: l.observacoes.trim() || null,
    })
    .select('*')
    .single()
  if (r.error) throw r.error
  return r.data as Lote
}
export async function alterarBloqueioLote(id: string, bloqueado: boolean, motivo: string) {
  const r = await supabase
    .from('lotes')
    .update({ bloqueado, motivo_bloqueio: bloqueado ? motivo.trim() : null })
    .eq('id', id)
  if (r.error) throw r.error
}

// ----------------------------------------------------------------- Saldos
export interface FiltrosEstoqueProdutos {
  busca: string
  categoria: string
  situacao: '' | 'com_saldo' | 'critico' | 'sem_saldo'
  pagina: number
  porPagina: number
}
export async function listarEstoqueProdutos(f: FiltrosEstoqueProdutos) {
  let q = supabase.from('vw_estoque_produtos').select('*', { count: 'exact' }).eq('status', 'ativo')
  const t = sanitizarBusca(f.busca)
  if (t) q = q.or(`descricao.ilike.%${t}%,sku.ilike.%${t}%`)
  if (f.categoria) q = q.eq('categoria_id', f.categoria)
  if (f.situacao === 'com_saldo') q = q.gt('fisico', 0)
  if (f.situacao === 'sem_saldo') q = q.eq('fisico', 0)
  if (f.situacao === 'critico') q = q.eq('critico', true)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('descricao').range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as EstoqueProduto[], total: r.count ?? 0 }
}
export async function contarCriticos() {
  const r = await supabase.from('vw_estoque_produtos').select('produto_id', { count: 'exact', head: true }).eq('critico', true).eq('status', 'ativo')
  if (r.error) throw r.error
  return r.count ?? 0
}
export async function listarSaldosDoProduto(produtoId: string, somenteComFisico = true) {
  let q = supabase.from('vw_estoque_saldos').select('*').eq('produto_id', produtoId)
  if (somenteComFisico) q = q.gt('quantidade_fisica', 0)
  return lancar(await q.order('deposito_nome').order('lote_codigo')) as SaldoDetalhe[]
}
export interface FiltrosSaldos {
  busca: string
  deposito: string
  pagina: number
  porPagina: number
}
export async function listarSaldos(f: FiltrosSaldos) {
  let q = supabase.from('vw_estoque_saldos').select('*', { count: 'exact' }).gt('quantidade_fisica', 0)
  const t = sanitizarBusca(f.busca)
  if (t) q = q.or(`produto_descricao.ilike.%${t}%,sku.ilike.%${t}%,lote_codigo.ilike.%${t}%,tonalidade.ilike.%${t}%,localizacao_codigo.ilike.%${t}%`)
  if (f.deposito) q = q.eq('deposito_id', f.deposito)
  const de = (f.pagina - 1) * f.porPagina
  const r = await q.order('produto_descricao').order('lote_codigo').range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as SaldoDetalhe[], total: r.count ?? 0 }
}

// ----------------------------------------------------------------- Movimentações
export interface NovaMovimentacao {
  tipo: TipoMovimentacao
  produto_id: string
  lote_id: string
  quantidade: string
  deposito_origem_id: string
  localizacao_origem_id: string
  deposito_destino_id: string
  localizacao_destino_id: string
  custo_unitario: string
  motivo: string
  documento: string
  observacoes: string
  reserva_id?: string
  chave_idempotencia: string
}
export async function registrarMovimentacao(m: NovaMovimentacao) {
  const r = await supabase.rpc('registrar_movimentacao', { p: m })
  if (r.error) throw r.error
  return r.data as string
}

export interface FiltrosMovimentacoes {
  busca: string
  tipo: string
  deposito: string
  de: string
  ate: string
  pagina: number
  porPagina: number
}
function consultaMovimentacoes(f: Omit<FiltrosMovimentacoes, 'pagina' | 'porPagina'>, contar: boolean) {
  let q = supabase.from('vw_estoque_movimentacoes').select('*', contar ? { count: 'exact' } : undefined)
  const t = sanitizarBusca(f.busca)
  if (t) {
    const filtros = [`produto_descricao.ilike.%${t}%`, `sku.ilike.%${t}%`, `lote_codigo.ilike.%${t}%`, `documento_id.ilike.%${t}%`, `motivo.ilike.%${t}%`]
    if (/^\d{1,12}$/.test(t)) filtros.push(`numero.eq.${t}`)
    q = q.or(filtros.join(','))
  }
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.deposito) q = q.or(`deposito_origem_id.eq.${f.deposito},deposito_destino_id.eq.${f.deposito}`)
  // Datas do filtro são do fuso local do usuário; convertidas para UTC
  if (f.de) q = q.gte('created_at', new Date(`${f.de}T00:00:00`).toISOString())
  if (f.ate) q = q.lte('created_at', new Date(`${f.ate}T23:59:59.999`).toISOString())
  return q.order('created_at', { ascending: false })
}
export async function listarMovimentacoes(f: FiltrosMovimentacoes) {
  const de = (f.pagina - 1) * f.porPagina
  const r = await consultaMovimentacoes(f, true).range(de, de + f.porPagina - 1)
  if (r.error) throw r.error
  return { linhas: r.data as Movimentacao[], total: r.count ?? 0 }
}
/** Exportação: até 10.000 linhas com os filtros atuais. */
export async function exportarMovimentacoes(f: Omit<FiltrosMovimentacoes, 'pagina' | 'porPagina'>) {
  const r = await consultaMovimentacoes(f, false).range(0, 9999)
  if (r.error) throw r.error
  return r.data as Movimentacao[]
}

// ----------------------------------------------------------------- Reservas
export async function listarReservas(status: string, busca: string) {
  let q = supabase.from('vw_estoque_reservas').select('*')
  if (status) q = q.eq('status', status)
  const t = sanitizarBusca(busca)
  if (t) q = q.or(`produto_descricao.ilike.%${t}%,sku.ilike.%${t}%,documento_id.ilike.%${t}%,cliente_nome.ilike.%${t}%`)
  return lancar(await q.order('created_at', { ascending: false }).limit(200)) as Reserva[]
}
export interface NovaReserva {
  produto_id: string
  lote_id: string
  deposito_id: string
  localizacao_id: string
  quantidade: string
  documento_id: string
  validade: string
  observacoes: string
  chave_idempotencia: string
}
export async function reservarEstoque(r: NovaReserva) {
  const res = await supabase.rpc('reservar_estoque', {
    p: { ...r, validade: r.validade ? new Date(`${r.validade}T23:59:59`).toISOString() : '' },
  })
  if (res.error) throw res.error
  return res.data as string
}
export async function liberarReserva(id: string, motivo: string) {
  const r = await supabase.rpc('liberar_reserva', { p_reserva_id: id, p_motivo: motivo })
  if (r.error) throw r.error
}
