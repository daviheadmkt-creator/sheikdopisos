import { etapasEntrega, normalizarPlaca, ordenarParaSeparacao, resumoSeparacao, validarPlaca } from './regras'

describe('placas', () => {
  it('aceita padrão antigo e Mercosul', () => {
    expect(validarPlaca('abc-1234')).toBe(true)
    expect(validarPlaca('BRA2E19')).toBe(true)
    expect(validarPlaca('AB12345')).toBe(false)
    expect(normalizarPlaca('bra-2e19')).toBe('BRA2E19')
  })
})

describe('ordem de separação', () => {
  it('ordena por depósito, localização (natural) e produto', () => {
    const r = ordenarParaSeparacao([
      { deposito_nome: 'Loja', localizacao_codigo: 'A-10', produto_descricao: 'Z' },
      { deposito_nome: 'Loja', localizacao_codigo: 'A-2', produto_descricao: 'B' },
      { deposito_nome: 'Loja', localizacao_codigo: null, produto_descricao: 'A' },
      { deposito_nome: 'CD', localizacao_codigo: 'B-1', produto_descricao: 'C' },
    ])
    expect(r.map((x) => `${x.deposito_nome}/${x.localizacao_codigo}`)).toEqual(['CD/B-1', 'Loja/A-2', 'Loja/A-10', 'Loja/null'])
  })
})

describe('resumo da separação', () => {
  it('identifica separação total', () => {
    expect(resumoSeparacao([{ quantidade: '14.4', separada: '14.4' }])).toMatchObject({ completos: 1, geraSaldo: false, nenhum: false })
  })
  it('separação parcial gera saldo para nova entrega', () => {
    const r = resumoSeparacao([
      { quantidade: '14.4', separada: '7.2' },
      { quantidade: '4', separada: '' },
      { quantidade: '2', separada: '2' },
    ])
    expect(r).toMatchObject({ completos: 1, parciais: 1, zerados: 1, geraSaldo: true, nenhum: false })
  })
  it('nada separado', () => {
    expect(resumoSeparacao([{ quantidade: '1', separada: '0' }]).nenhum).toBe(true)
  })
})

describe('etapas', () => {
  it('retirada não passa por agenda e rota', () => {
    expect(etapasEntrega('retirada')).toEqual(['aguardando_separacao', 'separado', 'entregue'])
    expect(etapasEntrega('entrega')).toContain('em_rota')
  })
})
