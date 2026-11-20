import { escalar } from '@/features/produtos/regras'

export type StatusEntrega = 'aguardando_separacao' | 'separado' | 'agendado' | 'em_rota' | 'entregue' | 'devolvido' | 'cancelado'

type Variante = 'default' | 'success' | 'danger' | 'info' | 'neutral' | 'dark'
export const STATUS_ENTREGA: Record<StatusEntrega, { label: string; variant: Variante }> = {
  aguardando_separacao: { label: 'Aguardando separação', variant: 'default' },
  separado: { label: 'Separado', variant: 'info' },
  agendado: { label: 'Agendado', variant: 'info' },
  em_rota: { label: 'Em rota', variant: 'dark' },
  entregue: { label: 'Entregue', variant: 'success' },
  devolvido: { label: 'Devolvido', variant: 'danger' },
  cancelado: { label: 'Cancelado', variant: 'neutral' },
}

export const JANELAS: Record<string, string> = { manha: 'Manhã (8h–12h)', tarde: 'Tarde (13h–18h)', comercial: 'Horário comercial' }

/** Etapas exibidas na linha do tempo da entrega. */
export function etapasEntrega(tipo: 'entrega' | 'retirada'): StatusEntrega[] {
  return tipo === 'retirada' ? ['aguardando_separacao', 'separado', 'entregue'] : ['aguardando_separacao', 'separado', 'agendado', 'em_rota', 'entregue']
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23), sem hífen e em maiúsculas. */
export const normalizarPlaca = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
export const validarPlaca = (v: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(v))

/** Ordem de coleta: depósito → localização (ordem natural: A-2 antes de A-10) → produto. */
export function ordenarParaSeparacao<T extends { deposito_nome: string | null; localizacao_codigo: string | null; produto_descricao: string }>(itens: T[]): T[] {
  const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  return [...itens].sort(
    (a, b) =>
      col.compare(a.deposito_nome ?? '', b.deposito_nome ?? '') ||
      col.compare(a.localizacao_codigo ?? 'zzz', b.localizacao_codigo ?? 'zzz') ||
      col.compare(a.produto_descricao, b.produto_descricao),
  )
}

/** Resume a separação informada: o que vai agora e o que fica para nova entrega. */
export function resumoSeparacao(itens: { quantidade: string; separada: string }[]) {
  let completos = 0
  let parciais = 0
  let zerados = 0
  for (const i of itens) {
    const q = escalar(i.quantidade || '0', 4)
    const s = escalar(i.separada || '0', 4)
    if (s <= 0n) zerados++
    else if (s < q) parciais++
    else completos++
  }
  return { completos, parciais, zerados, geraSaldo: parciais + zerados > 0, nenhum: completos + parciais === 0 }
}
