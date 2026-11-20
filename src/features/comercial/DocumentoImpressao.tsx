import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Button } from '@/components/ui/button'
import { formatarDocumento, formatarData, formatarMoeda, formatarNumero, formatarTelefone } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { obterEmpresa, obterOrcamento, obterVenda } from './api'
import { gerarParcelas } from './calculos'
import { FORMAS_PAGAMENTO } from './tipos'

interface LinhaItem {
  descricao: string
  sku: string
  detalhe: string | null
  area: number | null
  sobra: number
  caixas: number | null
  quantidade: number
  unidade: string
  preco: number
  desconto: number
  total: number
}

/** Página de impressão / “Salvar como PDF” do navegador. */
export function DocumentoImpressao({ tipo }: { tipo: 'orcamento' | 'venda' }) {
  const { id } = useParams()
  const empresa = useQuery({ queryKey: ['empresa'], queryFn: obterEmpresa, staleTime: 30 * 60_000 })
  const orc = useQuery({ queryKey: ['orcamentos', id], queryFn: () => obterOrcamento(id!), enabled: tipo === 'orcamento' })
  const venda = useQuery({ queryKey: ['vendas', id], queryFn: () => obterVenda(id!), enabled: tipo === 'venda' })
  const doc = tipo === 'orcamento' ? orc : venda

  useEffect(() => {
    const n = tipo === 'orcamento' ? orc.data?.numero : venda.data?.numero
    if (n) document.title = `${tipo === 'orcamento' ? 'Orcamento' : 'Pedido'}_${n}_SHEIK_DOS_PISOS`
    return () => {
      document.title = 'SHEIK DOS PISOS — ERP'
    }
  }, [tipo, orc.data?.numero, venda.data?.numero])

  if (doc.isLoading) return <Carregando />
  if (doc.error) return <ErroCarregamento mensagem={mensagemErro(doc.error)} />

  const o = orc.data
  const v = venda.data
  const base = (o ?? v)!
  const cliente = base.cliente
  const itens: LinhaItem[] = (o?.orcamento_itens ?? v?.venda_itens ?? []).map((i) => {
    const lt = (i as { lote?: { codigo: string; tonalidade: string | null; calibre: string | null } | null }).lote
    const lote = lt ? [`Lote ${lt.codigo}`, lt.tonalidade && `Ton. ${lt.tonalidade}`, lt.calibre && `Cal. ${lt.calibre}`].filter(Boolean).join(' · ') : null
    return {
      descricao: i.descricao,
      sku: i.produto?.sku ?? '',
      detalhe: [lote, i.observacao].filter(Boolean).join(' — ') || null,
      area: i.area_m2,
      sobra: i.perc_sobra,
      caixas: i.caixas,
      quantidade: i.quantidade,
      unidade: i.unidade,
      preco: i.preco_unitario,
      desconto: i.desconto_perc,
      total: i.valor_total,
    }
  })
  const e = empresa.data
  const titulo = tipo === 'orcamento' ? 'ORÇAMENTO' : 'PEDIDO DE VENDA'

  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Button variant="outline" asChild>
          <Link to={`/${tipo === 'orcamento' ? 'orcamentos' : 'vendas'}/${id}`}>
            <ArrowLeft /> Voltar
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir / Salvar PDF
        </Button>
      </div>

      <article className="documento mx-auto max-w-[210mm] bg-white p-[12mm] text-[11px] leading-snug text-black shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-primary pb-4">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-sidebar p-2">
              <Logo className="h-20 w-20" />
            </div>
            <div>
              <p className="text-base font-bold">{e?.nome_fantasia ?? e?.razao_social ?? 'SHEIK DOS PISOS'}</p>
              {e?.razao_social && e.razao_social !== e.nome_fantasia && <p>{e.razao_social}</p>}
              {e?.cnpj && <p>CNPJ {formatarDocumento(e.cnpj)}{e.inscricao_estadual && ` · IE ${e.inscricao_estadual}`}</p>}
              {e?.logradouro && (
                <p>
                  {e.logradouro}, {e.numero} — {e.bairro} — {e.cidade}/{e.uf}
                </p>
              )}
              <p>{[e?.telefone && formatarTelefone(e.telefone), e?.whatsapp && `WhatsApp ${formatarTelefone(e.whatsapp)}`, e?.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide">{titulo}</p>
            <p className="text-2xl font-bold text-primary">Nº {base.numero}</p>
            <p>Emissão: {formatarData(base.created_at)}</p>
            {o && <p className="font-semibold">Válido até: {formatarData(`${o.validade}T12:00:00`)}</p>}
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-4 rounded-md border p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Cliente</p>
            <p className="text-sm font-semibold">{cliente?.nome ?? o?.cliente_nome}</p>
            {cliente?.razao_social && <p>{cliente.razao_social}</p>}
            {cliente?.documento && <p>CPF/CNPJ: {formatarDocumento(cliente.documento)}</p>}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Contato</p>
            <p>{formatarTelefone(cliente?.whatsapp || cliente?.telefone || o?.cliente_telefone)}</p>
            {cliente?.email && <p>{cliente.email}</p>}
            {v && (
              <p className="mt-1">
                <span className="font-semibold">{v.tipo_entrega === 'entrega' ? 'Entrega: ' : 'Retirada na loja'}</span>
                {v.endereco && `${v.endereco.logradouro}, ${v.endereco.numero}${v.endereco.complemento ? ` ${v.endereco.complemento}` : ''} — ${v.endereco.bairro}, ${v.endereco.cidade}/${v.endereco.uf}`}
              </p>
            )}
          </div>
        </section>

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="bg-sidebar text-left text-[10px] uppercase tracking-wide text-white">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Produto</th>
              <th className="px-2 py-1.5 text-right">Área / Cx</th>
              <th className="px-2 py-1.5 text-right">Qtd</th>
              <th className="px-2 py-1.5 text-right">Preço</th>
              <th className="px-2 py-1.5 text-right">Desc.</th>
              <th className="px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i, n) => (
              <tr key={n} className="break-inside-avoid border-b align-top">
                <td className="px-2 py-1.5">{n + 1}</td>
                <td className="px-2 py-1.5">
                  <p className="font-medium">{i.descricao}</p>
                  <p className="text-[10px] text-neutral-500">
                    {i.sku}
                    {i.detalhe && ` · ${i.detalhe}`}
                  </p>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {i.area !== null && <p>{formatarNumero(i.area, 2)} m² +{formatarNumero(i.sobra, 0)}%</p>}
                  {i.caixas !== null && <p className="font-semibold">{i.caixas} cx</p>}
                  {i.area === null && i.caixas === null && '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  {formatarNumero(i.quantidade, i.unidade === 'M2' ? 2 : 0)} {i.unidade}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">{formatarMoeda(i.preco)}</td>
                <td className="px-2 py-1.5 text-right">{Number(i.desconto) ? `${formatarNumero(i.desconto, 2)}%` : '—'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">{formatarMoeda(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 flex break-inside-avoid justify-between gap-6">
          <div className="flex-1 space-y-3">
            {o?.condicoes_pagamento && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Condições de pagamento</p>
                <p className="whitespace-pre-line">{o.condicoes_pagamento}</p>
              </div>
            )}
            {v && v.venda_pagamentos.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Pagamento</p>
                {v.venda_pagamentos.map((x) => (
                  <div key={x.id}>
                    <p>
                      {FORMAS_PAGAMENTO[x.forma].label}: {formatarMoeda(x.valor)}
                      {x.parcelas > 1 && ` em ${x.parcelas}x`}
                    </p>
                    {FORMAS_PAGAMENTO[x.forma].prazo && x.parcelas > 0 && x.primeiro_vencimento && (
                      <p className="text-[10px] text-neutral-500">
                        {gerarParcelas(String(x.valor), x.parcelas, x.primeiro_vencimento, x.intervalo_dias)
                          .map((p) => `${p.numero}ª ${formatarData(`${p.vencimento}T12:00:00`)} ${formatarMoeda(p.valor)}`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {base.observacoes && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Observações</p>
                <p className="whitespace-pre-line">{base.observacoes}</p>
              </div>
            )}
          </div>
          <div className="w-64 space-y-1 rounded-md border p-3">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatarMoeda(base.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Descontos</span>
              <span>− {formatarMoeda(base.desconto_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Frete</span>
              <span>{formatarMoeda(base.frete)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t-2 border-primary pt-1 text-sm font-bold">
              <span>TOTAL</span>
              <span>{formatarMoeda(base.total)}</span>
            </div>
          </div>
        </section>

        <footer className="mt-8 break-inside-avoid space-y-6 text-[10px] text-neutral-600">
          {tipo === 'orcamento' ? (
            <p>
              Quantidades de revestimentos calculadas em caixas inteiras, com o percentual de sobra indicado para recortes e
              perdas. Preços e disponibilidade válidos até a data de validade. Tonalidade e calibre definidos no momento da
              venda, conforme lote disponível.
            </p>
          ) : (
            <p className="font-semibold">Documento sem valor fiscal. A nota fiscal será emitida separadamente.</p>
          )}
          <div className="grid grid-cols-2 gap-10 pt-6">
            <div className="border-t border-neutral-400 pt-1 text-center">SHEIK DOS PISOS</div>
            <div className="border-t border-neutral-400 pt-1 text-center">Cliente</div>
          </div>
        </footer>
      </article>
    </div>
  )
}
