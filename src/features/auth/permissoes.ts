export const ACOES = ['ler', 'criar', 'editar', 'aprovar', 'cancelar', 'exportar'] as const
export type Acao = (typeof ACOES)[number]

export const ACAO_LABEL: Record<Acao, string> = {
  ler: 'Leitura',
  criar: 'Criação',
  editar: 'Edição',
  aprovar: 'Aprovação',
  cancelar: 'Cancelamento',
  exportar: 'Exportação',
}

export const PERFIS = [
  'administrador',
  'gerente',
  'vendedor',
  'estoquista',
  'comprador',
  'financeiro',
  'logistica',
] as const
export type Perfil = (typeof PERFIS)[number]

export const PERFIL_LABEL: Record<string, string> = {
  administrador: 'Administrador',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
  estoquista: 'Estoquista',
  comprador: 'Comprador',
  financeiro: 'Financeiro',
  logistica: 'Logística',
}

export interface PermissaoLinha {
  modulo: string
  acao: Acao
}

/**
 * Verificador de permissões para a interface. É apenas conveniência de UX:
 * a autorização real é aplicada no banco (RLS + tem_permissao) e na Edge Function.
 */
export function criarVerificador(linhas: PermissaoLinha[]) {
  const set = new Set(linhas.map((l) => `${l.modulo}:${l.acao}`))
  return (modulo: string, acao: Acao = 'ler') => set.has(`${modulo}:${acao}`)
}
