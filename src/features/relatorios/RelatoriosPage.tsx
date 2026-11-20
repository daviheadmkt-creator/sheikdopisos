import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileDown, FileSpreadsheet, FileText, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Logo } from '@/components/common/Logo'
import { PeriodoFiltro } from '@/components/common/PeriodoFiltro'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { exportarCsv, exportarExcel, formatarCelula, totalizar } from '@/lib/exportacao'
import { formatarData } from '@/lib/format'
import { periodoPreset } from '@/lib/periodos'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { GRUPOS, RELATORIOS, type Linha } from './definicoes'

const NUMERICOS = ['moeda', 'numero', 'inteiro', 'percentual']

export function RelatoriosPage() {
  const { pode } = useAuth()
  const [params, setParams] = useSearchParams()
  const disponiveis = RELATORIOS.filter((r) => r.modulos.some((m) => pode(m)))
  const rel = disponiveis.find((r) => r.id === params.get('r')) ?? disponiveis[0]
  const [p, setP] = useState(periodoPreset('mes'))
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [exportando, setExportando] = useState(false)
  const valorExtra = rel ? extra[rel.id] ?? rel.extra?.padrao ?? '' : ''

  const q = useQuery({
    queryKey: ['relatorios', rel?.id, rel?.periodo ? p : null, valorExtra],
    queryFn: () => rel!.carregar({ ...p, extra: valorExtra }),
    enabled: !!rel,
  })
  const linhas = useMemo(() => q.data ?? [], [q.data])
  const podeExportar = pode('relatorios', 'exportar') || (rel?.modulos.some((m) => pode(m, 'exportar')) ?? false)
  const sufixo = rel?.periodo ? `${p.de}_a_${p.ate}` : new Date().toISOString().slice(0, 10)

  if (!rel) return <Vazio titulo="Seu perfil não tem acesso a relatórios." />

  const excel = async () => {
    setExportando(true)
    try {
      await exportarExcel(rel.titulo, sufixo, rel.colunas, linhas)
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setExportando(false)
    }
  }
  const temTotal = rel.colunas.some((c) => c.total)

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="no-print space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        {GRUPOS.map((g) => {
          const itens = disponiveis.filter((r) => r.grupo === g)
          if (!itens.length) return null
          return (
            <div key={g}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{g}</p>
              <ul className="space-y-0.5">
                {itens.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setParams({ r: r.id }, { replace: true })}
                      className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors', r.id === rel.id ? 'bg-sidebar font-medium text-white' : 'hover:bg-accent')}
                    >
                      <FileText className={cn('h-4 w-4 shrink-0', r.id === rel.id ? 'text-primary' : 'text-muted-foreground')} /> {r.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="no-print flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{rel.titulo}</h2>
              <p className="text-sm text-muted-foreground">{rel.descricao}</p>
            </div>
            {podeExportar && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!linhas.length} onClick={() => exportarCsv(rel.titulo, sufixo, rel.colunas, linhas)}><FileDown /> CSV</Button>
                <Button variant="outline" size="sm" disabled={!linhas.length || exportando} onClick={() => void excel()}>{exportando ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel</Button>
                <Button size="sm" disabled={!linhas.length} onClick={() => window.print()}><Printer /> PDF</Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {rel.periodo && (
              <>
                {rel.rotuloPeriodo && <span className="text-sm text-muted-foreground">{rel.rotuloPeriodo}:</span>}
                <PeriodoFiltro de={p.de} ate={p.ate} onChange={setP} />
              </>
            )}
            {rel.extra && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{rel.extra.rotulo}</span>
                <NativeSelect value={valorExtra} onChange={(e) => setExtra({ ...extra, [rel.id]: e.target.value })} className="h-9 w-40">
                  {rel.extra.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                </NativeSelect>
              </label>
            )}
          </div>
        </div>

        {/* Cabeçalho do PDF */}
        <div className="hidden items-center justify-between border-b-2 border-primary pb-3 print:flex">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sidebar p-1.5"><Logo className="h-12 w-12" /></div>
            <div>
              <p className="text-base font-bold">SHEIK DOS PISOS — {rel.titulo}</p>
              <p className="text-xs">{rel.periodo ? `${rel.rotuloPeriodo ?? 'Período'}: ${formatarData(`${p.de}T12:00:00`)} a ${formatarData(`${p.ate}T12:00:00`)}` : 'Posição atual'}{rel.extra && ` · ${rel.extra.rotulo}: ${rel.extra.opcoes.find((o) => o.valor === valorExtra)?.label}`}</p>
            </div>
          </div>
          <p className="text-xs">Emitido em {formatarData(new Date().toISOString(), true)}</p>
        </div>

        {rel.resumo && linhas.length > 0 && (
          <div className="documento grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rel.resumo(linhas).map((r) => (
              <Card key={r.rotulo}><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{r.rotulo}</p><p className="mt-1 text-lg font-semibold">{r.valor}</p></CardContent></Card>
            ))}
          </div>
        )}

        <Card className="documento overflow-hidden">
          {q.isLoading ? <Carregando /> : q.error ? <ErroCarregamento mensagem={mensagemErro(q.error)} /> : !linhas.length ? (
            <Vazio titulo="Sem dados para os filtros selecionados" />
          ) : (
            <div className="max-h-[70vh] overflow-auto print:max-h-none print:overflow-visible">
              <table className="w-full text-sm print:text-[10px]">
                <thead className="sticky top-0 z-10 bg-sidebar text-left text-xs uppercase tracking-wide text-white">
                  <tr>
                    {rel.colunas.map((c) => (
                      <th key={c.chave} className={cn('whitespace-nowrap px-3 py-2.5 font-semibold', NUMERICOS.includes(c.tipo) && 'text-right')}>{c.titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l: Linha, n) => (
                    <tr key={n} className={cn('break-inside-avoid border-b hover:bg-accent/40', (l.tipo === 'total' || l.tipo === 'resultado') && 'bg-secondary font-semibold')}>
                      {rel.colunas.map((c) => {
                        const v = l[c.chave]
                        const neg = NUMERICOS.includes(c.tipo) && Number(v) < 0
                        return (
                          <td key={c.chave} className={cn('px-3 py-2', NUMERICOS.includes(c.tipo) && 'whitespace-nowrap text-right tabular-nums', neg && 'text-destructive')}>
                            {c.chave === 'classe' ? <Badge variant={v === 'A' ? 'success' : v === 'B' ? 'default' : 'neutral'}>{String(v)}</Badge> : formatarCelula(v, c)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
                {temTotal && (
                  <tfoot className="sticky bottom-0 bg-secondary font-semibold">
                    <tr>
                      {rel.colunas.map((c, i) => {
                        const t = totalizar(linhas, c)
                        return (
                          <td key={c.chave} className={cn('px-3 py-2.5', NUMERICOS.includes(c.tipo) && 'whitespace-nowrap text-right tabular-nums')}>
                            {t !== null ? `${c.total === 'media' ? 'média ' : ''}${formatarCelula(t, c)}` : i === 0 ? `Total (${linhas.length})` : ''}
                          </td>
                        )
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
        {linhas.length > 0 && <p className="no-print text-xs text-muted-foreground">{linhas.length} linha(s). Valores calculados no servidor a partir dos registros do sistema.</p>}
      </section>
    </div>
  )
}
