import { contatoVazio, fornecedorParaPayload, fornecedorSchema, fornecedorVazio } from './schema'

describe('fornecedorSchema', () => {
  it('exige razão social', () => {
    expect(fornecedorSchema.safeParse(fornecedorVazio).success).toBe(false)
    expect(fornecedorSchema.safeParse({ ...fornecedorVazio, razao_social: 'Cerâmica Exemplo Ltda' }).success).toBe(true)
  })
  it('valida CNPJ numérico e alfanumérico quando informado', () => {
    const base = { ...fornecedorVazio, razao_social: 'Fornecedor' }
    expect(fornecedorSchema.safeParse({ ...base, cnpj: '11.222.333/0001-80' }).success).toBe(false)
    expect(fornecedorSchema.safeParse({ ...base, cnpj: '11.222.333/0001-81' }).success).toBe(true)
    expect(fornecedorSchema.safeParse({ ...base, cnpj: '12.ABC.345/01DE-35' }).success).toBe(true)
  })
  it('permite no máximo um contato principal', () => {
    const c = { ...contatoVazio(true), nome: 'Ana' }
    expect(fornecedorSchema.safeParse({ ...fornecedorVazio, razao_social: 'F', contatos: [c, c] }).success).toBe(false)
  })
})

describe('fornecedorParaPayload', () => {
  it('normaliza CNPJ, telefones e define o contato principal', () => {
    const { fornecedor, contatos } = fornecedorParaPayload({
      ...fornecedorVazio,
      razao_social: ' Cerâmica X ',
      cnpj: '12.abc.345/01de-35',
      telefone: '(11) 3333-4444',
      contatos: [
        { ...contatoVazio(false), nome: 'Bruno', whatsapp: '(11) 98888-7777' },
        { ...contatoVazio(true), nome: 'Carla' },
      ],
    })
    expect(fornecedor.cnpj).toBe('12ABC34501DE35')
    expect(fornecedor.telefone).toBe('1133334444')
    expect(fornecedor.razao_social).toBe('Cerâmica X')
    expect(fornecedor.contato_nome).toBe('Carla')
    expect(contatos[0].whatsapp).toBe('11988887777')
  })
})
