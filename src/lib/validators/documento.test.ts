import { validarCNPJ, validarCPF, validarGTIN } from './documento'
import { digitosParaCanonico, formatarCanonico, paraCanonico } from '../decimal'
import { formatarDocumento, mascararDocumento } from '../format'

describe('CPF', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(validarCPF('529.982.247-25')).toBe(true)
    expect(validarCPF('52998224725')).toBe(true)
  })
  it('rejeita dígito verificador errado, repetidos e tamanho inválido', () => {
    expect(validarCPF('52998224724')).toBe(false)
    expect(validarCPF('111.111.111-11')).toBe(false)
    expect(validarCPF('1234567890')).toBe(false)
  })
})

describe('CNPJ', () => {
  it('aceita CNPJ numérico válido', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
  })
  it('aceita CNPJ alfanumérico válido (IN RFB 2.229/2024)', () => {
    expect(validarCNPJ('12.ABC.345/01DE-35')).toBe(true)
    expect(validarCNPJ('12abc34501de35')).toBe(true)
  })
  it('rejeita CNPJ inválido', () => {
    expect(validarCNPJ('11.222.333/0001-80')).toBe(false)
    expect(validarCNPJ('12.ABC.345/01DE-36')).toBe(false)
    expect(validarCNPJ('00.000.000/0000-00')).toBe(false)
    expect(validarCNPJ('12.ABC.345/01DE-3A')).toBe(false)
  })
})

describe('GTIN', () => {
  it('valida EAN-13', () => {
    expect(validarGTIN('4006381333931')).toBe(true)
    expect(validarGTIN('4006381333932')).toBe(false)
  })
  it('rejeita tamanhos inválidos', () => {
    expect(validarGTIN('123')).toBe(false)
  })
})

describe('Decimais canônicos (sem ponto flutuante)', () => {
  it('máscara da direita para a esquerda', () => {
    expect(digitosParaCanonico('12345', 2)).toBe('123.45')
    expect(digitosParaCanonico('5', 2)).toBe('0.05')
    expect(digitosParaCanonico('21600', 4)).toBe('2.1600')
    expect(digitosParaCanonico('000', 2)).toBe('')
    expect(digitosParaCanonico('1.234,56', 2)).toBe('1234.56')
    expect(digitosParaCanonico('42', 0)).toBe('42')
  })
  it('formata no padrão brasileiro', () => {
    expect(formatarCanonico('1234567.8', 2)).toBe('1.234.567,80')
    expect(formatarCanonico('0.05', 2)).toBe('0,05')
    expect(formatarCanonico('', 2)).toBe('')
  })
  it('converte valores do banco', () => {
    expect(paraCanonico(89.9, 2)).toBe('89.90')
    expect(paraCanonico('2.16', 4)).toBe('2.1600')
    expect(paraCanonico(null, 2)).toBe('')
    expect(paraCanonico(10, 0)).toBe('10')
  })
})

describe('Formatação de documentos', () => {
  it('formata CPF e CNPJ', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatarDocumento('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
  })
  it('aplica máscara progressiva', () => {
    expect(mascararDocumento('52998224725', 'PF')).toBe('529.982.247-25')
    expect(mascararDocumento('12abc34501de35', 'PJ')).toBe('12.ABC.345/01DE-35')
  })
})
