import { clienteParaPayload, clienteSchema, clienteVazio, enderecoVazio, idade } from './schema'

const endereco = {
  ...enderecoVazio(true),
  cep: '01310-100',
  logradouro: 'Av. Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
}

describe('clienteSchema', () => {
  it('aceita pessoa física sem CPF (cadastro rápido de balcão)', () => {
    expect(clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria Souza' }).success).toBe(true)
  })

  it('rejeita CPF inválido quando informado', () => {
    const r = clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', documento: '123.456.789-00' })
    expect(r.success).toBe(false)
  })

  it('exige CNPJ válido e razão social para pessoa jurídica', () => {
    const semCnpj = clienteSchema.safeParse({ ...clienteVazio, tipo_pessoa: 'PJ', nome: 'Construtora' })
    expect(semCnpj.success).toBe(false)
    const ok = clienteSchema.safeParse({
      ...clienteVazio,
      tipo_pessoa: 'PJ',
      nome: 'Construtora',
      razao_social: 'Construtora Exemplo Ltda',
      documento: '11.222.333/0001-81',
    })
    expect(ok.success).toBe(true)
  })

  it('exige exatamente um endereço principal', () => {
    const dois = clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', enderecos: [endereco, endereco] })
    expect(dois.success).toBe(false)
    const nenhum = clienteSchema.safeParse({
      ...clienteVazio,
      nome: 'Maria',
      enderecos: [{ ...endereco, principal: false }],
    })
    expect(nenhum.success).toBe(false)
    const um = clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', enderecos: [endereco] })
    expect(um.success).toBe(true)
  })

  it('valida telefone e e-mail', () => {
    expect(clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', telefone: '1234' }).success).toBe(false)
    expect(clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', email: 'invalido@' }).success).toBe(false)
    expect(
      clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', telefone: '(11) 98765-4321', email: 'm@x.com' }).success,
    ).toBe(true)
  })
})

describe('clienteParaPayload', () => {
  it('normaliza documento, telefones, CEP e e-mail', () => {
    const { cliente, enderecos } = clienteParaPayload({
      ...clienteVazio,
      tipo_pessoa: 'PJ',
      nome: ' Construtora ',
      razao_social: 'Construtora Ltda',
      documento: '12.abc.345/01de-35',
      telefone: '(11) 3333-4444',
      email: ' Compras@Construtora.com.BR ',
      enderecos: [endereco],
    })
    expect(cliente.documento).toBe('12ABC34501DE35')
    expect(cliente.telefone).toBe('1133334444')
    expect(cliente.email).toBe('compras@construtora.com.br')
    expect(cliente.nome).toBe('Construtora')
    expect(cliente.limite_credito).toBe('0')
    expect(enderecos[0].cep).toBe('01310100')
  })

  it('descarta razão social de pessoa física', () => {
    const { cliente } = clienteParaPayload({ ...clienteVazio, nome: 'Ana', razao_social: 'X' })
    expect(cliente.razao_social).toBe('')
  })
})

describe('data de nascimento e contato', () => {
  it('aceita nascimento válido e recusa data futura ou muito antiga', () => {
    expect(clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', data_nascimento: '1985-07-14' }).success).toBe(true)
    expect(clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', data_nascimento: '2999-01-01' }).success).toBe(false)
    expect(clienteSchema.safeParse({ ...clienteVazio, nome: 'Maria', data_nascimento: '1899-12-31' }).success).toBe(false)
  })

  it('calcula a idade considerando se o aniversário já passou', () => {
    expect(idade('1985-07-14', '2026-07-13')).toBe(40)
    expect(idade('1985-07-14', '2026-07-14')).toBe(41)
    expect(idade('', '2026-07-14')).toBeNull()
  })

  it('PF grava o próprio nascimento; PJ grava contato e nascimento do contato', () => {
    const pf = clienteParaPayload({ ...clienteVazio, nome: 'Ana', data_nascimento: '1990-03-02', contato_nome: 'X' })
    expect(pf.cliente.data_nascimento).toBe('1990-03-02')
    expect(pf.cliente.contato_nome).toBe('')
    const pj = clienteParaPayload({
      ...clienteVazio,
      tipo_pessoa: 'PJ',
      nome: 'Construtora',
      razao_social: 'Construtora Ltda',
      documento: '11.222.333/0001-81',
      data_nascimento: '1990-03-02',
      contato_nome: ' Carlos Lima ',
      contato_nascimento: '1978-11-20',
    })
    expect(pj.cliente.data_nascimento).toBe('')
    expect(pj.cliente.contato_nome).toBe('Carlos Lima')
    expect(pj.cliente.contato_nascimento).toBe('1978-11-20')
  })
})
