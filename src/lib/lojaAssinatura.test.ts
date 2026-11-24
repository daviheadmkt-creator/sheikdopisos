import { assinarLoja, verificarAssinaturaLoja } from './lojaAssinatura'

const CHAVE = 'a'.repeat(64)
const AGORA = 1_795_000_000
const TS = String(AGORA)
const CORPO = '{"evento":"pedido","dados":{"id":10}}'

describe('assinatura da loja virtual', () => {
  it('aceita mensagem assinada corretamente', () => {
    expect(verificarAssinaturaLoja(CHAVE, TS, assinarLoja(CHAVE, TS, CORPO), CORPO, AGORA)).toEqual({ ok: true })
  })

  it('confere com a mesma conta feita pelo PHP (hash_hmac sha256)', () => {
    // php -r 'echo hash_hmac("sha256", "1795000000.{}", str_repeat("a", 64));'
    expect(assinarLoja(CHAVE, TS, '{}')).toBe('7586687bf7bd1cff86af7f001224cacd6116c2a92e017f425398593a15176d63')
  })

  it('recusa corpo alterado', () => {
    const assinatura = assinarLoja(CHAVE, TS, CORPO)
    expect(verificarAssinaturaLoja(CHAVE, TS, assinatura, CORPO.replace('10', '11'), AGORA).ok).toBe(false)
  })

  it('recusa chave diferente', () => {
    const assinatura = assinarLoja('b'.repeat(64), TS, CORPO)
    expect(verificarAssinaturaLoja(CHAVE, TS, assinatura, CORPO, AGORA).ok).toBe(false)
  })

  it('recusa mensagem antiga ou do futuro (reenvio capturado)', () => {
    const velho = String(AGORA - 301)
    expect(verificarAssinaturaLoja(CHAVE, velho, assinarLoja(CHAVE, velho, CORPO), CORPO, AGORA)).toEqual({ ok: false, motivo: 'mensagem expirada' })
    const futuro = String(AGORA + 301)
    expect(verificarAssinaturaLoja(CHAVE, futuro, assinarLoja(CHAVE, futuro, CORPO), CORPO, AGORA).ok).toBe(false)
  })

  it('recusa cabeçalhos ausentes ou malformados', () => {
    expect(verificarAssinaturaLoja(CHAVE, null, 'x', CORPO, AGORA).ok).toBe(false)
    expect(verificarAssinaturaLoja(CHAVE, TS, null, CORPO, AGORA).ok).toBe(false)
    expect(verificarAssinaturaLoja(CHAVE, TS, 'zz', CORPO, AGORA).ok).toBe(false)
  })

  it('recusa tudo se a chave do servidor for fraca ou vazia', () => {
    expect(verificarAssinaturaLoja('', TS, assinarLoja('', TS, CORPO), CORPO, AGORA).ok).toBe(false)
    expect(verificarAssinaturaLoja('curta', TS, assinarLoja('curta', TS, CORPO), CORPO, AGORA).ok).toBe(false)
  })
})
