import { mensagemErro } from './supabase'

describe('mensagemErro', () => {
  it('mostra a regra de negócio vinda do banco (ex.: limite de desconto)', () => {
    const msg = 'Desconto acima de 5.00 por cento exige aprovação de um gerente'
    expect(mensagemErro({ code: '42501', message: msg })).toBe(msg)
  })

  it('esconde detalhes técnicos de permissão do banco', () => {
    const generica = 'Você não tem permissão para executar esta operação.'
    expect(mensagemErro({ code: '42501', message: 'permission denied for table usuarios' })).toBe(generica)
    expect(mensagemErro({ code: '42501', message: 'new row violates row-level security policy for table "vendas"' })).toBe(generica)
    expect(mensagemErro({ code: '42501', message: '' })).toBe(generica)
  })
})
