import { FORMAS_PAGAMENTO } from '@/features/comercial/tipos'
import { STATUS_VENDA } from '@/features/comercial/tipos'
import { STATUS_PEDIDO_COMPRA } from '@/features/compras/tipos'
import { dreGerencial, fluxoCaixa, listarParcelas } from '@/features/financeiro/api'
import type { ColunaRelatorio } from '@/lib/exportacao'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { executarRelatorio } from './api'

export type Linha = Record<string, unknown>

export interface FiltrosRelatorio {
  de: string
  ate: string
  extra: string
}

export interface Relatorio {
  id: string
  titulo: string
  descricao: string
  grupo: 'Comercial' | 'Estoque' | 'Compras' | 'Financeiro' | 'Logística'
  /** basta ter leitura em um destes módulos */
  modulos: string[]
  periodo: boolean
  rotuloPeriodo?: string
  extra?: { rotulo: string; padrao: string; opcoes: { valor: string; label: string }[] }
  colunas: ColunaRelatorio<Linha>[]
  carregar: (f: FiltrosRelatorio) => Promise<Linha[]>
  resumo?: (linhas: Linha[]) => { rotulo: string; valor: string }[]
}

const rotulosObj = <T extends Record<string, { label: string }>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.label]))
const soma = (l: Linha[], k: string) => l.reduce((s, x) => s + Number(x[k] ?? 0), 0)
const periodo = (f: FiltrosRelatorio) => ({ p_de: f.de, p_ate: f.ate })

export const RELATORIOS: Relatorio[] = [
  // ------------------------------------------------------------------ Comercial
  {
    id: 'vendas', titulo: 'Vendas', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Vendas confirmadas e concluídas no período, com custo (CMV) e margem.',
    colunas: [
      { chave: 'numero', titulo: 'Nº', tipo: 'inteiro', largura: 8 },
      { chave: 'data', titulo: 'Data', tipo: 'data', largura: 12 },
      { chave: 'cliente', titulo: 'Cliente', tipo: 'texto' },
      { chave: 'vendedor', titulo: 'Vendedor', tipo: 'texto', largura: 20 },
      { chave: 'itens', titulo: 'Itens', tipo: 'inteiro', total: 'soma', largura: 8 },
      { chave: 'subtotal', titulo: 'Subtotal', tipo: 'moeda', total: 'soma' },
      { chave: 'descontos', titulo: 'Descontos', tipo: 'moeda', total: 'soma' },
      { chave: 'frete', titulo: 'Frete', tipo: 'moeda', total: 'soma' },
      { chave: 'total', titulo: 'Total', tipo: 'moeda', total: 'soma' },
      { chave: 'custo', titulo: 'Custo (CMV)', tipo: 'moeda', total: 'soma' },
      { chave: 'margem', titulo: 'Margem bruta', tipo: 'moeda', total: 'soma' },
      { chave: 'status', titulo: 'Situação', tipo: 'texto', rotulos: rotulosObj(STATUS_VENDA), largura: 12 },
      { chave: 'entrega', titulo: 'Recebimento', tipo: 'texto', rotulos: { entrega: 'Entrega', retirada: 'Retirada' }, largura: 12 },
    ],
    carregar: (f) => executarRelatorio('relatorio_vendas', periodo(f)),
    resumo: (l) => {
      const t = soma(l, 'total')
      return [
        { rotulo: 'Vendas', valor: formatarNumero(l.length, 0) },
        { rotulo: 'Faturamento', valor: formatarMoeda(t) },
        { rotulo: 'Ticket médio', valor: formatarMoeda(l.length ? t / l.length : 0) },
        { rotulo: 'Margem bruta', valor: `${formatarNumero(t - soma(l, 'frete') ? (soma(l, 'margem') / (t - soma(l, 'frete'))) * 100 : 0, 1)}%` },
      ]
    },
  },
  {
    id: 'faturamento', titulo: 'Faturamento', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Faturamento agrupado por dia ou por mês.',
    extra: { rotulo: 'Agrupar por', padrao: 'dia', opcoes: [{ valor: 'dia', label: 'Dia' }, { valor: 'mes', label: 'Mês' }] },
    colunas: [
      { chave: 'periodo', titulo: 'Período', tipo: 'texto', largura: 12 },
      { chave: 'qtd_vendas', titulo: 'Vendas', tipo: 'inteiro', total: 'soma' },
      { chave: 'subtotal', titulo: 'Subtotal', tipo: 'moeda', total: 'soma' },
      { chave: 'descontos', titulo: 'Descontos', tipo: 'moeda', total: 'soma' },
      { chave: 'frete', titulo: 'Frete', tipo: 'moeda', total: 'soma' },
      { chave: 'total', titulo: 'Faturamento', tipo: 'moeda', total: 'soma' },
      { chave: 'ticket_medio', titulo: 'Ticket médio', tipo: 'moeda', total: 'media' },
    ],
    carregar: async (f) => {
      const r = await executarRelatorio<Linha>('relatorio_faturamento', { ...periodo(f), p_agrupar: f.extra || 'dia' })
      // dia → 19/11/2026 · mês → 11/2026
      return r.map((x) => {
        const [a, m, d] = String(x.periodo).split('-')
        return { ...x, periodo: f.extra === 'mes' ? `${m}/${a}` : `${d}/${m}/${a}` }
      })
    },
  },
  {
    id: 'formas', titulo: 'Formas de pagamento', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Participação de cada forma de pagamento nas vendas.',
    colunas: [
      { chave: 'forma', titulo: 'Forma', tipo: 'texto', rotulos: rotulosObj(FORMAS_PAGAMENTO) },
      { chave: 'qtd', titulo: 'Lançamentos', tipo: 'inteiro', total: 'soma' },
      { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: 'soma' },
      { chave: 'participacao', titulo: 'Participação', tipo: 'percentual' },
    ],
    carregar: (f) => executarRelatorio('relatorio_formas_pagamento', periodo(f)),
  },
  {
    id: 'vendedores', titulo: 'Vendedores', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Desempenho por vendedor: faturamento, ticket, descontos e conversão de orçamentos.',
    colunas: [
      { chave: 'vendedor', titulo: 'Vendedor', tipo: 'texto' },
      { chave: 'qtd_vendas', titulo: 'Vendas', tipo: 'inteiro', total: 'soma' },
      { chave: 'faturamento', titulo: 'Faturamento', tipo: 'moeda', total: 'soma' },
      { chave: 'ticket_medio', titulo: 'Ticket médio', tipo: 'moeda' },
      { chave: 'descontos', titulo: 'Descontos', tipo: 'moeda', total: 'soma' },
      { chave: 'desconto_medio_perc', titulo: 'Desc. médio', tipo: 'percentual' },
      { chave: 'orcamentos', titulo: 'Orçamentos', tipo: 'inteiro', total: 'soma' },
      { chave: 'orcamentos_convertidos', titulo: 'Convertidos', tipo: 'inteiro', total: 'soma' },
      { chave: 'conversao_perc', titulo: 'Conversão', tipo: 'percentual' },
    ],
    carregar: (f) => executarRelatorio('relatorio_vendedores', periodo(f)),
  },
  {
    id: 'clientes', titulo: 'Clientes', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Clientes que compraram no período, por valor, com recência.',
    colunas: [
      { chave: 'cliente', titulo: 'Cliente', tipo: 'texto' },
      { chave: 'documento', titulo: 'CPF/CNPJ', tipo: 'texto', largura: 18 },
      { chave: 'cidade', titulo: 'Cidade', tipo: 'texto', largura: 20 },
      { chave: 'qtd_compras', titulo: 'Compras', tipo: 'inteiro', total: 'soma' },
      { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: 'soma' },
      { chave: 'ticket_medio', titulo: 'Ticket médio', tipo: 'moeda' },
      { chave: 'primeira_compra', titulo: '1ª compra', tipo: 'data' },
      { chave: 'ultima_compra', titulo: 'Última compra', tipo: 'data' },
      { chave: 'dias_sem_comprar', titulo: 'Dias sem comprar', tipo: 'inteiro' },
    ],
    carregar: (f) => executarRelatorio('relatorio_clientes', periodo(f)),
  },
  {
    id: 'produtos', titulo: 'Produtos vendidos', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Quantidade (com caixas), valor, custo e margem por produto.',
    colunas: [
      { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 16 },
      { chave: 'descricao', titulo: 'Produto', tipo: 'texto', largura: 40 },
      { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 18 },
      { chave: 'quantidade', titulo: 'Quantidade', tipo: 'numero', casas: 2 },
      { chave: 'unidade', titulo: 'Un.', tipo: 'texto', largura: 6 },
      { chave: 'caixas', titulo: 'Caixas', tipo: 'numero', casas: 1 },
      { chave: 'qtd_vendas', titulo: 'Vendas', tipo: 'inteiro' },
      { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: 'soma' },
      { chave: 'custo', titulo: 'Custo', tipo: 'moeda', total: 'soma' },
      { chave: 'margem', titulo: 'Margem', tipo: 'moeda', total: 'soma' },
      { chave: 'margem_perc', titulo: 'Margem %', tipo: 'percentual' },
    ],
    carregar: (f) => executarRelatorio('relatorio_produtos', periodo(f)),
  },
  {
    id: 'abc', titulo: 'Curva ABC de produtos', grupo: 'Comercial', modulos: ['relatorios'], periodo: true,
    descricao: 'Classe A: até 80% do faturamento acumulado; B: até 95%; C: restante.',
    colunas: [
      { chave: 'posicao', titulo: '#', tipo: 'inteiro', largura: 6 },
      { chave: 'classe', titulo: 'Classe', tipo: 'texto', largura: 8 },
      { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 16 },
      { chave: 'descricao', titulo: 'Produto', tipo: 'texto', largura: 40 },
      { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 18 },
      { chave: 'valor', titulo: 'Faturamento', tipo: 'moeda', total: 'soma' },
      { chave: 'participacao', titulo: 'Part.', tipo: 'percentual', casas: 2 },
      { chave: 'acumulado', titulo: 'Acumulado', tipo: 'percentual', casas: 2 },
    ],
    carregar: (f) => executarRelatorio('relatorio_curva_abc', periodo(f)),
    resumo: (l) =>
      (['A', 'B', 'C'] as const).map((c) => {
        const g = l.filter((x) => x.classe === c)
        const total = soma(l, 'valor') || 1
        return { rotulo: `Classe ${c}`, valor: `${g.length} produto(s) · ${formatarNumero((soma(g, 'valor') / total) * 100, 1)}% do valor` }
      }),
  },
  // ------------------------------------------------------------------ Estoque
  {
    id: 'estoque', titulo: 'Estoque valorizado', grupo: 'Estoque', modulos: ['relatorios', 'estoque'], periodo: false,
    descricao: 'Posição atual: físico, reservado, avariado, disponível, valor a custo médio e dias sem venda.',
    colunas: [
      { chave: 'sku', titulo: 'SKU', tipo: 'texto', largura: 16 },
      { chave: 'descricao', titulo: 'Produto', tipo: 'texto', largura: 40 },
      { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 18 },
      { chave: 'unidade', titulo: 'Un.', tipo: 'texto', largura: 6 },
      { chave: 'fisico', titulo: 'Físico', tipo: 'numero', casas: 2 },
      { chave: 'reservado', titulo: 'Reservado', tipo: 'numero', casas: 2 },
      { chave: 'avariado', titulo: 'Avariado', tipo: 'numero', casas: 2 },
      { chave: 'disponivel', titulo: 'Disponível', tipo: 'numero', casas: 2 },
      { chave: 'estoque_minimo', titulo: 'Mínimo', tipo: 'numero', casas: 2 },
      { chave: 'critico', titulo: 'Crítico', tipo: 'texto', largura: 8 },
      { chave: 'custo', titulo: 'Custo médio', tipo: 'numero', casas: 4 },
      { chave: 'valor_estoque', titulo: 'Valor em estoque', tipo: 'moeda', total: 'soma' },
      { chave: 'lotes', titulo: 'Lotes', tipo: 'inteiro' },
      { chave: 'dias_sem_venda', titulo: 'Dias sem venda', tipo: 'inteiro' },
    ],
    carregar: () => executarRelatorio('relatorio_estoque', {}),
    resumo: (l) => [
      { rotulo: 'Produtos', valor: formatarNumero(l.length, 0) },
      { rotulo: 'Valor em estoque', valor: formatarMoeda(soma(l, 'valor_estoque')) },
      { rotulo: 'Críticos', valor: formatarNumero(l.filter((x) => x.critico === true).length, 0) },
      { rotulo: 'Sem venda há +90 dias', valor: formatarNumero(l.filter((x) => Number(x.fisico) > 0 && (x.dias_sem_venda === null || Number(x.dias_sem_venda) > 90)).length, 0) },
    ],
  },
  // ------------------------------------------------------------------ Compras
  {
    id: 'compras', titulo: 'Compras', grupo: 'Compras', modulos: ['relatorios', 'compras'], periodo: true,
    descricao: 'Pedidos de compra emitidos no período, com percentual recebido e atrasos.',
    colunas: [
      { chave: 'numero', titulo: 'Pedido', tipo: 'inteiro', largura: 8 },
      { chave: 'data', titulo: 'Emissão', tipo: 'data' },
      { chave: 'fornecedor', titulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'status', titulo: 'Situação', tipo: 'texto', rotulos: rotulosObj(STATUS_PEDIDO_COMPRA) },
      { chave: 'previsao', titulo: 'Previsão', tipo: 'data' },
      { chave: 'total', titulo: 'Total', tipo: 'moeda', total: 'soma' },
      { chave: 'recebido_perc', titulo: 'Recebido', tipo: 'percentual' },
      { chave: 'atrasado', titulo: 'Atrasado', tipo: 'texto', largura: 10 },
    ],
    carregar: (f) => executarRelatorio('relatorio_compras', periodo(f)),
  },
  {
    id: 'fornecedores', titulo: 'Fornecedores', grupo: 'Compras', modulos: ['relatorios', 'fornecedores'], periodo: true,
    descricao: 'Volume comprado, recebimentos, prazo médio de entrega e atrasos por fornecedor.',
    colunas: [
      { chave: 'fornecedor', titulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'cnpj', titulo: 'CNPJ', tipo: 'texto', largura: 18 },
      { chave: 'pedidos', titulo: 'Pedidos', tipo: 'inteiro', total: 'soma' },
      { chave: 'valor_pedidos', titulo: 'Valor pedido', tipo: 'moeda', total: 'soma' },
      { chave: 'recebimentos', titulo: 'Recebimentos', tipo: 'inteiro', total: 'soma' },
      { chave: 'valor_recebido', titulo: 'Valor recebido', tipo: 'moeda', total: 'soma' },
      { chave: 'prazo_medio_dias', titulo: 'Prazo médio (dias)', tipo: 'numero', casas: 1 },
      { chave: 'pedidos_atrasados', titulo: 'Atrasados', tipo: 'inteiro', total: 'soma' },
      { chave: 'produtos_fornecidos', titulo: 'Produtos', tipo: 'inteiro' },
    ],
    carregar: (f) => executarRelatorio('relatorio_fornecedores', periodo(f)),
  },
  // ------------------------------------------------------------------ Financeiro
  ...(['receber', 'pagar'] as const).map<Relatorio>((tipo) => ({
    id: `contas_${tipo}`, titulo: tipo === 'receber' ? 'Contas a receber' : 'Contas a pagar', grupo: 'Financeiro', modulos: ['financeiro', 'contas'],
    periodo: true, rotuloPeriodo: 'Vencimento',
    descricao: tipo === 'receber' ? 'Parcelas a receber por vencimento, com atraso.' : 'Parcelas a pagar por vencimento, com atraso.',
    extra: { rotulo: 'Situação', padrao: 'abertas', opcoes: [{ valor: 'abertas', label: 'Em aberto' }, { valor: 'vencidas', label: 'Vencidas' }, { valor: 'pagas', label: 'Liquidadas' }, { valor: 'todas', label: 'Todas' }] },
    colunas: [
      { chave: 'vencimento', titulo: 'Vencimento', tipo: 'data' },
      { chave: 'titulo_numero', titulo: 'Título', tipo: 'inteiro', largura: 8 },
      { chave: 'parcela', titulo: 'Parcela', tipo: 'texto', largura: 8 },
      { chave: 'pessoa_nome', titulo: tipo === 'receber' ? 'Cliente' : 'Fornecedor', tipo: 'texto' },
      { chave: 'descricao', titulo: 'Descrição', tipo: 'texto' },
      { chave: 'categoria_nome', titulo: 'Categoria', tipo: 'texto', largura: 22 },
      { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: 'soma' },
      { chave: 'valor_pago', titulo: 'Pago', tipo: 'moeda', total: 'soma' },
      { chave: 'valor_aberto', titulo: 'Em aberto', tipo: 'moeda', total: 'soma' },
      { chave: 'dias_atraso', titulo: 'Dias de atraso', tipo: 'inteiro' },
    ],
    carregar: async (f: FiltrosRelatorio) => {
      const r = await listarParcelas({ tipo, situacao: (f.extra || 'abertas') as 'abertas', busca: '', de: f.de, ate: f.ate, pagina: 1, porPagina: 5000 })
      return r.linhas.map((p) => ({ ...p, parcela: `${p.numero}/${p.total_parcelas}` })) as unknown as Linha[]
    },
  })),
  ...(['receber', 'pagar'] as const).map<Relatorio>((tipo) => ({
    id: `aging_${tipo}`, titulo: tipo === 'receber' ? 'Inadimplência (aging) a receber' : 'Aging de contas a pagar', grupo: 'Financeiro',
    modulos: ['financeiro', 'contas'], periodo: false,
    descricao: 'Saldo em aberto por faixa de vencimento/atraso (posição de hoje).',
    colunas: [
      { chave: 'faixa', titulo: 'Faixa', tipo: 'texto', largura: 30 },
      { chave: 'parcelas', titulo: 'Parcelas', tipo: 'inteiro', total: 'soma' },
      { chave: 'valor', titulo: 'Valor em aberto', tipo: 'moeda', total: 'soma' },
    ],
    carregar: () => executarRelatorio('relatorio_aging', { p_tipo: tipo }),
  })),
  {
    id: 'fluxo', titulo: 'Fluxo de caixa', grupo: 'Financeiro', modulos: ['financeiro'], periodo: true,
    descricao: 'Entradas e saídas realizadas e previstas por dia, com saldo acumulado.',
    colunas: [
      { chave: 'data', titulo: 'Data', tipo: 'data' },
      { chave: 'entradas_realizadas', titulo: 'Entradas realizadas', tipo: 'moeda', total: 'soma' },
      { chave: 'saidas_realizadas', titulo: 'Saídas realizadas', tipo: 'moeda', total: 'soma' },
      { chave: 'entradas_previstas', titulo: 'A receber', tipo: 'moeda', total: 'soma' },
      { chave: 'saidas_previstas', titulo: 'A pagar', tipo: 'moeda', total: 'soma' },
      { chave: 'saldo', titulo: 'Saldo do dia', tipo: 'moeda', total: 'soma' },
      { chave: 'acumulado', titulo: 'Acumulado', tipo: 'moeda' },
    ],
    carregar: async (f) => {
      let ac = 0
      return (await fluxoCaixa(f.de, f.ate) ?? [])
        .filter((d) => d.entradas_realizadas || d.saidas_realizadas || d.entradas_previstas || d.saidas_previstas)
        .map((d) => {
          const saldo = Number(d.entradas_realizadas) - Number(d.saidas_realizadas) + Number(d.entradas_previstas) - Number(d.saidas_previstas)
          ac += saldo
          return { ...d, saldo, acumulado: ac } as unknown as Linha
        })
    },
  },
  {
    id: 'dre', titulo: 'DRE gerencial', grupo: 'Financeiro', modulos: ['financeiro'], periodo: true,
    descricao: 'Demonstração de resultado gerencial do período.',
    colunas: [
      { chave: 'descricao', titulo: 'Linha', tipo: 'texto', largura: 60 },
      { chave: 'valor', titulo: 'Valor', tipo: 'moeda' },
    ],
    carregar: async (f) => ((await dreGerencial(f.de, f.ate)) ?? []) as unknown as Linha[],
  },
  // ------------------------------------------------------------------ Logística
  {
    id: 'entregas', titulo: 'Entregas', grupo: 'Logística', modulos: ['relatorios', 'entregas'], periodo: true,
    descricao: 'Desempenho por motorista/transportadora: entregues, devoluções, atrasos, prazo médio e custo de frete.',
    colunas: [
      { chave: 'responsavel', titulo: 'Responsável', tipo: 'texto' },
      { chave: 'total', titulo: 'Entregas', tipo: 'inteiro', total: 'soma' },
      { chave: 'entregues', titulo: 'Entregues', tipo: 'inteiro', total: 'soma' },
      { chave: 'devolvidas', titulo: 'Devolvidas', tipo: 'inteiro', total: 'soma' },
      { chave: 'com_devolucao_parcial', titulo: 'Dev. parcial', tipo: 'inteiro', total: 'soma' },
      { chave: 'atrasadas', titulo: 'Atrasadas', tipo: 'inteiro', total: 'soma' },
      { chave: 'prazo_medio_horas', titulo: 'Prazo médio (h)', tipo: 'numero', casas: 1 },
      { chave: 'frete_custo', titulo: 'Custo de frete', tipo: 'moeda', total: 'soma' },
    ],
    carregar: (f) => executarRelatorio('relatorio_entregas', periodo(f)),
  },
]

export const GRUPOS = ['Comercial', 'Estoque', 'Compras', 'Financeiro', 'Logística'] as const
