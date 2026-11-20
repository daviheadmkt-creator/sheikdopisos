import { supabase } from '@/lib/supabase'
import { sanitizarBusca } from '@/lib/utils'
import { somenteDigitos } from '@/lib/validators/documento'
import type { clienteParaPayload } from './schema'

export interface ClienteLista {
  id: string
  codigo: number
  tipo_pessoa: 'PF' | 'PJ'
  nome: string
  razao_social: string | null
  documento: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  status: string
  vendedor_id: string | null
  cliente_enderecos: { cidade: string; uf: string; principal: boolean }[]
}

export interface EnderecoDB {
  id: string
  descricao: string | null
  cep: string
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  uf: string
  referencia: string | null
  principal: boolean
}

export interface ClienteDB extends Omit<ClienteLista, 'cliente_enderecos'> {
  inscricao_estadual: string | null
  limite_credito: number
  observacoes: string | null
  created_at: string
  updated_at: string
  cliente_enderecos: EnderecoDB[]
}

export interface FiltrosClientes {
  busca: string
  status: string
  tipo: string
  pagina: number
  porPagina: number
}

export async function listarClientes(f: FiltrosClientes) {
  let q = supabase
    .from('clientes')
    .select(
      'id,codigo,tipo_pessoa,nome,razao_social,documento,telefone,whatsapp,email,status,vendedor_id,cliente_enderecos(cidade,uf,principal)',
      { count: 'exact' },
    )

  const termo = sanitizarBusca(f.busca)
  if (termo) {
    const filtros = [`nome.ilike.%${termo}%`, `razao_social.ilike.%${termo}%`, `email.ilike.%${termo}%`]
    const digitos = somenteDigitos(termo)
    if (digitos.length >= 3) {
      filtros.push(`documento.ilike.%${digitos}%`, `telefone.ilike.%${digitos}%`, `whatsapp.ilike.%${digitos}%`)
    }
    if (/^[0-9A-Za-z./-]{14,18}$/.test(termo)) filtros.push(`documento.eq.${termo.replace(/[^0-9A-Za-z]/g, '').toUpperCase()}`)
    if (/^\d{1,12}$/.test(termo)) filtros.push(`codigo.eq.${termo}`)
    q = q.or(filtros.join(','))
  }
  if (f.status) q = q.eq('status', f.status)
  if (f.tipo) q = q.eq('tipo_pessoa', f.tipo)

  const de = (f.pagina - 1) * f.porPagina
  const { data, error, count } = await q.order('nome').range(de, de + f.porPagina - 1)
  if (error) throw error
  return { linhas: (data ?? []) as ClienteLista[], total: count ?? 0 }
}

export async function obterCliente(id: string) {
  const { data, error } = await supabase.from('clientes').select('*, cliente_enderecos(*)').eq('id', id).single()
  if (error) throw error
  return data as ClienteDB
}

export async function salvarCliente(payload: ReturnType<typeof clienteParaPayload>) {
  const { data, error } = await supabase.rpc('salvar_cliente', {
    p_cliente: payload.cliente,
    p_enderecos: payload.enderecos,
  })
  if (error) throw error
  return data as string
}

export interface Vendedor {
  id: string
  nome: string
  ativo: boolean
}

export async function listarVendedores() {
  const { data, error } = await supabase.rpc('listar_vendedores')
  if (error) throw error
  return (data ?? []) as Vendedor[]
}

export interface ResultadoCep {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

/** Consulta de CEP (ViaCEP). Retorna null se o CEP não existir ou o serviço falhar. */
export async function buscarCep(cep: string): Promise<ResultadoCep | null> {
  const d = somenteDigitos(cep)
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    if (!r.ok) return null
    const j = await r.json()
    if (j.erro) return null
    return { logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '' }
  } catch {
    return null
  }
}
