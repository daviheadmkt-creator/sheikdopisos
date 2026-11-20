import { formatarCanonico, paraCanonico } from '@/lib/decimal'
import { desescalar, escalar } from '@/features/produtos/regras'

export type TipoMovimentacao =
  | 'entrada'
  | 'saida'
  | 'transferencia'
  | 'ajuste_entrada'
  | 'ajuste_saida'
  | 'devolucao'
  | 'avaria'
  | 'baixa_avaria'
  | 'recuperacao_avaria'

interface InfoTipo {
  label: string
  descricao: string
  origem: boolean
  destino: boolean
  motivoObrigatorio: boolean
  /** efeito no físico: +1 entra, -1 sai, 0 neutro */
  sinal: 1 | -1 | 0
}

export const TIPOS_MOVIMENTACAO: Record<TipoMovimentacao, InfoTipo> = {
  entrada: { label: 'Entrada', descricao: 'Recebimento avulso de mercadoria', origem: false, destino: true, motivoObrigatorio: false, sinal: 1 },
  saida: { label: 'Saída', descricao: 'Baixa de mercadoria (consumo, retirada)', origem: true, destino: false, motivoObrigatorio: false, sinal: -1 },
  transferencia: { label: 'Transferência', descricao: 'Entre depósitos ou localizações', origem: true, destino: true, motivoObrigatorio: false, sinal: 0 },
  ajuste_entrada: { label: 'Ajuste (+)', descricao: 'Correção para mais', origem: false, destino: true, motivoObrigatorio: true, sinal: 1 },
  ajuste_saida: { label: 'Ajuste (−)', descricao: 'Correção para menos', origem: true, destino: false, motivoObrigatorio: true, sinal: -1 },
  devolucao: { label: 'Devolução', descricao: 'Mercadoria devolvida por cliente', origem: false, destino: true, motivoObrigatorio: true, sinal: 1 },
  avaria: { label: 'Avaria', descricao: 'Separa quantidade avariada (não vendável)', origem: true, destino: false, motivoObrigatorio: true, sinal: 0 },
  baixa_avaria: { label: 'Baixa de avaria', descricao: 'Descarta quantidade avariada', origem: true, destino: false, motivoObrigatorio: true, sinal: -1 },
  recuperacao_avaria: { label: 'Recuperação de avaria', descricao: 'Volta avariado para disponível', origem: true, destino: false, motivoObrigatorio: true, sinal: 0 },
}

export const LISTA_TIPOS = Object.keys(TIPOS_MOVIMENTACAO) as TipoMovimentacao[]

/** Quantidade em m² a partir de caixas inteiras (exata, 4 casas). */
export function caixasParaQuantidade(caixas: string, m2PorCaixa: string): string {
  if (!/^\d+$/.test(caixas) || !m2PorCaixa) return ''
  const total = escalar(m2PorCaixa, 4) * BigInt(caixas)
  return total === 0n ? '' : desescalar(total, 4)
}

/** Decompõe uma quantidade em m² em caixas inteiras + sobra em m². */
export function quantidadeEmCaixas(quantidade: string, m2PorCaixa: string) {
  const q = escalar(quantidade || '0', 4)
  const porCaixa = escalar(m2PorCaixa || '0', 4)
  if (porCaixa <= 0n) return null
  const caixas = q / porCaixa
  const resto = q - caixas * porCaixa
  return { caixas, resto: desescalar(resto, 4), exato: resto === 0n }
}

/** Texto amigável: "10 cx" ou "10 cx + 0,7200 m²". */
export function descreverCaixas(quantidade: number | string | null | undefined, m2PorCaixa: number | string | null | undefined) {
  if (quantidade === null || quantidade === undefined || !m2PorCaixa) return ''
  const r = quantidadeEmCaixas(paraCanonico(quantidade, 4), paraCanonico(m2PorCaixa, 4))
  if (!r) return ''
  const cx = `${r.caixas.toString()} cx`
  return r.exato ? cx : `${cx} + ${formatarCanonico(r.resto, 4)} m²`
}
