import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import type { StatusEntrega } from './regras'

const ok = <T>(r: { data: unknown; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}
const rpc = async <T = void>(fn: string, args: Record<string, unknown>) => ok<T>(await supabase.rpc(fn, args))

export interface Entrega {
  id: string
  numero: number
  venda_id: string
  venda_numero: number
  entrega_origem_id: string | null
  tipo: 'entrega' | 'retirada'
  status: StatusEntrega
  cliente_id: string
  cliente_nome: string
  cliente_telefone: string | null
  cliente_whatsapp: string | null
  cep: string | null
  logradouro: string | null
  numero_endereco: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  referencia: string | null
  data_agendada: string | null
  janela: string | null
  motorista_id: string | null
  motorista_nome: string | null
  veiculo_id: string | null
  veiculo_placa: string | null
  veiculo_descricao: string | null
  transportadora_id: string | null
  transportadora_nome: string | null
  frete_custo: number
  separador_nome: string | null
  separado_em: string | null
  saiu_em: string | null
  entregue_em: string | null
  recebedor_nome: string | null
  recebedor_documento: string | null
  comprovante_path: string | null
  motivo_ocorrencia: string | null
  observacoes: string | null
  qtd_itens: number
  peso_estimado_kg: number
  created_at: string
}

export interface EntregaItem {
  id: string
  entrega_id: string
  venda_item_id: string
  produto_id: string
  lote_id: string | null
  deposito_id: string | null
  localizacao_id: string | null
  quantidade: number
  quantidade_separada: number
  quantidade_devolvida: number
  conferido: boolean
  divergencia: string | null
  sku: string
  produto_descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  lote_codigo: string | null
  tonalidade: string | null
  calibre: string | null
  deposito_nome: string | null
  localizacao_codigo: string | null
}

export interface FiltrosEntregas {
  status?: StatusEntrega[]
  tipo?: string
  busca?: string
  de?: string
  ate?: string
  data?: string
  vendaId?: string
  pagina?: number
  porPagina?: number
}

export async function listarEntregas(f: FiltrosEntregas) {
  let q = supabase.from('vw_entregas').select('*', { count: 'exact' })
  if (f.status?.length) q = q.in('status', f.status)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.vendaId) q = q.eq('venda_id', f.vendaId)
  if (f.data) q = q.eq('data_agendada', f.data)
  if (f.de) q = q.gte('data_agendada', f.de)
  if (f.ate) q = q.lte('data_agendada', f.ate)
  const t = sanitizarBusca(f.busca ?? '')
  if (t) {
    const filtros = [`cliente_nome.ilike.%${t}%`, `bairro.ilike.%${t}%`, `cidade.ilike.%${t}%`]
    if (/^\d{1,12}$/.test(t)) filtros.push(`numero.eq.${t}`, `venda_numero.eq.${t}`)
    q = q.or(filtros.join(','))
  }
  const pagina = f.pagina ?? 1
  const por = f.porPagina ?? 200
  const r = await q.order('data_agendada', { ascending: true, nullsFirst: false }).order('numero').range((pagina - 1) * por, pagina * por - 1)
  if (r.error) throw r.error
  return { linhas: r.data as Entrega[], total: r.count ?? 0 }
}

export async function obterEntrega(id: string) {
  const [e, itens] = await Promise.all([
    supabase.from('vw_entregas').select('*').eq('id', id).single(),
    supabase.from('vw_entrega_itens').select('*').eq('entrega_id', id),
  ])
  return { entrega: ok<Entrega>(e), itens: ok<EntregaItem[]>(itens) }
}

export const concluirSeparacao = (entrega: string, itens: { item_id: string; quantidade_separada: string; conferido: boolean; divergencia: string }[]) =>
  rpc<string | null>('concluir_separacao', { p_entrega: entrega, p_itens: itens })
export const agendarEntrega = (p: Record<string, unknown>) => rpc('agendar_entrega', { p })
export const iniciarRota = (ids: string[]) => rpc<number>('iniciar_rota', { p_entregas: ids })
export const confirmarEntrega = (p: Record<string, unknown>) => rpc('confirmar_entrega', { p })
export const registrarDevolucao = (id: string, motivo: string, reentregar: boolean) =>
  rpc<string | null>('registrar_devolucao_entrega', { p_entrega: id, p_motivo: motivo, p_reentregar: reentregar })
export const cancelarEntrega = (id: string, motivo: string) => rpc('cancelar_entrega', { p_entrega: id, p_motivo: motivo })
export const alterarTipoEntrega = (id: string, tipo: 'entrega' | 'retirada', endereco?: string) =>
  rpc('alterar_tipo_entrega', { p_entrega: id, p_tipo: tipo, p_endereco: endereco || null })

const TIPOS_COMPROVANTE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export async function enviarComprovante(entregaId: string, arquivo: File) {
  const ext = TIPOS_COMPROVANTE[arquivo.type]
  if (!ext) throw new Error('Use foto (JPG, PNG, WEBP) ou PDF.')
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('O comprovante deve ter no máximo 10 MB.')
  const caminho = `${entregaId}/${crypto.randomUUID()}.${ext}`
  const r = await supabase.storage.from('comprovantes').upload(caminho, arquivo, { contentType: arquivo.type })
  if (r.error) throw r.error
  return caminho
}
export async function urlComprovante(caminho: string) {
  const r = await supabase.storage.from('comprovantes').createSignedUrl(caminho, 300)
  if (r.error) throw r.error
  return r.data.signedUrl
}

// ----------------------------------------------------------------- Cadastros
export interface Veiculo { id: string; placa: string; descricao: string; capacidade_kg: number | null; ativo: boolean }
export interface Motorista { id: string; nome: string; telefone: string | null; cnh: string | null; ativo: boolean }
export interface Transportadora { id: string; nome: string; cnpj: string | null; telefone: string | null; ativo: boolean }

export const listarVeiculos = async () => ok<Veiculo[]>(await supabase.from('veiculos').select('*').order('placa'))
export const listarMotoristas = async () => ok<Motorista[]>(await supabase.from('motoristas').select('*').order('nome'))
export const listarTransportadoras = async () => ok<Transportadora[]>(await supabase.from('transportadoras').select('*').order('nome'))
export async function criarCadastroLogistica(tabela: 'veiculos' | 'motoristas' | 'transportadoras', dados: Record<string, unknown>) {
  ok(await supabase.from(tabela).insert(dados))
}
export async function alterarAtivoLogistica(tabela: 'veiculos' | 'motoristas' | 'transportadoras', id: string, ativo: boolean) {
  ok(await supabase.from(tabela).update({ ativo }).eq('id', id))
}
