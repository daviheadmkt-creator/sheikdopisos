import { Link, useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Button } from '@/components/ui/button'
import { dataLocalISO, formatarData, formatarNumero, formatarTelefone } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { listarEntregas, obterEntrega } from './api'
import { JANELAS } from './regras'

/** Romaneio de entregas do dia, para o motorista (impressão / PDF). */
export function RomaneioPage() {
  const [params] = useSearchParams()
  const data = params.get('data') ?? dataLocalISO()
  const lista = useQuery({ queryKey: ['logistica', 'romaneio', data], queryFn: () => listarEntregas({ data, tipo: 'entrega', status: ['agendado', 'em_rota', 'separado'] }) })
  const detalhes = useQueries({ queries: (lista.data?.linhas ?? []).map((e) => ({ queryKey: ['logistica', 'entrega', e.id], queryFn: () => obterEntrega(e.id) })) })

  if (lista.isLoading) return <Carregando />
  if (lista.error) return <ErroCarregamento mensagem={mensagemErro(lista.error)} />
  const entregas = lista.data?.linhas ?? []

  return (
    <div className="min-h-full bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Button variant="outline" asChild><Link to="/entregas"><ArrowLeft /> Voltar</Link></Button>
        <Button onClick={() => window.print()}><Printer /> Imprimir / Salvar PDF</Button>
      </div>
      <article className="documento mx-auto max-w-[210mm] bg-white p-[12mm] text-[11px] text-black shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-center justify-between border-b-2 border-primary pb-3">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-sidebar p-1.5"><Logo className="h-14 w-14" /></div><div><p className="text-base font-bold">ROMANEIO DE ENTREGAS</p><p>{formatarData(`${data}T12:00:00`)} · {entregas.length} entrega(s)</p></div></div>
          <p className="text-right">Motorista: ______________________<br />Veículo: ______________________</p>
        </header>
        {!entregas.length && <p>Nenhuma entrega para esta data.</p>}
        {entregas.map((e, n) => {
          const itens = detalhes[n]?.data?.itens ?? []
          return (
            <section key={e.id} className="mb-4 break-inside-avoid rounded-md border p-3">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-sm font-bold">{n + 1}. {e.cliente_nome} <span className="font-normal">· Entrega #{e.numero} · Venda #{e.venda_numero}</span></p>
                  <p>{e.logradouro}, {e.numero_endereco}{e.complemento && ` — ${e.complemento}`} · {e.bairro} · {e.cidade}/{e.uf}{e.referencia && ` · Ref.: ${e.referencia}`}</p>
                  <p>Tel.: {formatarTelefone(e.cliente_whatsapp || e.cliente_telefone)} · {e.janela ? JANELAS[e.janela] : 'Sem janela'}{e.motorista_nome && ` · ${e.motorista_nome}`}{e.veiculo_placa && ` · ${e.veiculo_placa}`}</p>
                </div>
              </div>
              <table className="mt-2 w-full border-collapse">
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="py-1">{i.produto_descricao}{i.lote_codigo && ` — Lote ${i.lote_codigo}${i.tonalidade ? ` / ${i.tonalidade}` : ''}`}</td>
                      <td className="py-1 text-right">{formatarNumero(i.quantidade_separada || i.quantidade, i.unidade === 'M2' ? 2 : 0)} {i.unidade}{i.eh_revestimento && i.m2_por_caixa ? ` (${Math.round(Number(i.quantidade_separada || i.quantidade) / Number(i.m2_por_caixa))} cx)` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-6 grid grid-cols-3 gap-6">
                <div className="border-t border-neutral-400 pt-1 text-center">Recebedor</div>
                <div className="border-t border-neutral-400 pt-1 text-center">Documento</div>
                <div className="border-t border-neutral-400 pt-1 text-center">Data / hora</div>
              </div>
            </section>
          )
        })}
      </article>
    </div>
  )
}
