import { criarVerificador } from './permissoes'

describe('criarVerificador', () => {
  const pode = criarVerificador([
    { modulo: 'clientes', acao: 'ler' },
    { modulo: 'clientes', acao: 'criar' },
    { modulo: 'produtos', acao: 'ler' },
  ])

  it('concede somente as ações atribuídas', () => {
    expect(pode('clientes')).toBe(true)
    expect(pode('clientes', 'criar')).toBe(true)
    expect(pode('clientes', 'editar')).toBe(false)
    expect(pode('produtos', 'criar')).toBe(false)
  })

  it('nega módulos sem permissão', () => {
    expect(pode('usuarios')).toBe(false)
    expect(pode('financeiro', 'exportar')).toBe(false)
  })

  it('lista vazia não concede nada', () => {
    expect(criarVerificador([])('clientes')).toBe(false)
  })
})
