import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeftRight, Bookmark, Boxes, ChevronDown, ChevronRight, Search, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarCategorias } from '@/features/produtos/api'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { listarDepositos, listarEstoqueProdutos, listarSaldos, listarSaldosDoProduto } from './api'
import { Qtd } from './componentes'
import { DepositosTab } from './DepositosTab'
import { MovimentacaoDialog } from './MovimentacaoDialog'
import { ReservaDialog } from './ReservaDialog'
import { ReservasTab } from './ReservasTab'

const POR_PAGINA = 20

export function EstoquePage() {
  const { pode } = useAuth()
  const [params] = useSearchParams()
  const [movimentar, setMovimentar] = useState(false)
  const [reservar, setReservar] = useState(false)

  return (
    <>
      <PageHeader
        titulo="Estoque"
        descricao="Físico, reservado, avariado e disponível por produto, lote, depósito e localização."
        acoes={
          <>
            {pode('estoque', 'criar') && (
              <Button variant="outline" onClick={() => setReservar(true)}>
                <Bookmark /> Nova reserva
              </Button>
            )}
            {pode('movimentacoes', 'criar') && (
              <Button onClick={() => setMovimentar(true)}>
                <ArrowLeftRight /> Nova movimentação
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue={params.get('aba') ?? 'produtos'}>
        <TabsList>
          <TabsTrigger value="produtos">
            <Boxes /> Por produto
          </TabsTrigger>
          <TabsTrigger value="saldos">
            <Warehouse /> Por lote e local
          </TabsTrigger>
          <TabsTrigger value="reservas">
            <Bookmark /> Reservas
          </TabsTrigger>
          <TabsTrigger value="depositos">
            <Warehouse /> Depósitos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="produtos">
          <ProdutosTab key={params.get('situacao') ?? ''} criticoInicial={params.get('situacao') === 'critico'} />
        </TabsContent>
        <TabsContent value="saldos">
          <SaldosTab />
        </TabsContent>
        <TabsContent value="reservas">
          <ReservasTab />
        </TabsContent>
        <TabsContent value="depositos">
          <DepositosTab />
        </TabsContent>
      </Tabs>

      <MovimentacaoDialog aberto={movimentar} onFechar={() => setMovimentar(false)} />
      <ReservaDialog aberto={reservar} onFechar={() => setReservar(false)} />
    </>
  )
}

function ProdutosTab({ criticoInicial }: { criticoInicial: boolean }) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [situacao, setSituacao] = useState<'' | 'com_saldo' | 'critico' | 'sem_saldo'>(criticoInicial ? 'critico' : '')
  const [pagina, setPagina] = useState(1)
  const [expandido, setExpandido] = useState<string | null>(null)
  const b = useDebounce(busca)

  const filtros = { busca: b, categoria, situacao, pagina, porPagina: POR_PAGINA }
  const q = useQuery({
    queryKey: ['estoque', 'produtos', filtros],
    queryFn: () => listarEstoqueProdutos(filtros),
    placeholderData: keepPreviousData,
  })
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias })
  const detalhe = useQuery({
    queryKey: ['estoque', 'saldos-produto', expandido, 'todos'],
    queryFn: () => listarSaldosDoProduto(expandido!, false),
    enabled: !!expandido,
  })
  const f = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <Card>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_200px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => f(() => setBusca(e.target.value))} placeholder="Produto ou SKU" className="pl-9" aria-label="Pesquisar" />
        </div>
        <NativeSelect value={categoria} onChange={(e) => f(() => setCategoria(e.target.value))} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={situacao} onChange={(e) => f(() => setSituacao(e.target.value as typeof situacao))} aria-label="Situação">
          <option value="">Todos os produtos ativos</option>
          <option value="com_saldo">Com saldo</option>
          <option value="sem_saldo">Sem saldo</option>
          <option value="critico">Estoque crítico</option>
        </NativeSelect>
      </div>
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <ErroCarregamento mensagem={mensagemErro(q.error)} />
      ) : !q.data?.linhas.length ? (
        <Vazio titulo="Nenhum produto encontrado" descricao="Cadastre produtos e registre entradas para formar o estoque." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Físico</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Avariado</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead>Lotes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.linhas.map((p) => {
                const aberto = expandido === p.produto_id
                const m2 = p.eh_revestimento ? p.m2_por_caixa : null
                return (
                  <Fragment key={p.produto_id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandido(aberto ? null : p.produto_id)}>
                      <TableCell>{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell>
                        <p className="font-medium">{p.descricao}</p>
                        <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Qtd valor={p.fisico} unidade={p.unidade} m2PorCaixa={m2} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Qtd valor={p.reservado} unidade={p.unidade} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Qtd valor={p.avariado} unidade={p.unidade} className={p.avariado > 0 ? 'text-destructive' : ''} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <Qtd valor={p.disponivel} unidade={p.unidade} m2PorCaixa={m2} />
                      </TableCell>
                      <TableCell className="text-right">
                        {p.critico ? (
                          <Badge variant="danger" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            <Qtd valor={p.estoque_minimo} unidade={p.unidade} />
                          </Badge>
                        ) : (
                          <Qtd valor={p.estoque_minimo} unidade={p.unidade} className="text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>{p.lotes_com_saldo || '—'}</TableCell>
                    </TableRow>
                    {aberto && (
                      <TableRow className="bg-background/60 hover:bg-background/60">
                        <TableCell colSpan={8} className="p-0">
                          {detalhe.isLoading ? (
                            <Carregando />
                          ) : !detalhe.data?.length ? (
                            <p className="px-12 py-4 text-sm text-muted-foreground">Sem saldo registrado.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <tbody>
                                {detalhe.data.map((s) => (
                                  <tr key={s.id} className="border-t">
                                    <td className="py-2 pl-12 pr-4">
                                      {s.deposito_nome}
                                      {s.localizacao_codigo && <span className="text-muted-foreground"> · {s.localizacao_codigo}</span>}
                                    </td>
                                    <td className="px-4 py-2">
                                      {s.lote_codigo ? (
                                        <>
                                          Lote <strong>{s.lote_codigo}</strong>
                                          {s.tonalidade && ` · Ton. ${s.tonalidade}`}
                                          {s.calibre && ` · Cal. ${s.calibre}`}
                                          {s.lote_bloqueado && <Badge variant="danger" className="ml-2">Bloqueado</Badge>}
                                        </>
                                      ) : (
                                        <span className="text-muted-foreground">Sem lote</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-right">Físico <Qtd valor={s.quantidade_fisica} unidade={s.unidade} /></td>
                                    <td className="px-4 py-2 text-right">Reserv. <Qtd valor={s.quantidade_reservada} unidade={s.unidade} /></td>
                                    <td className="px-4 py-2 text-right font-medium">
                                      Disp. <Qtd valor={s.quantidade_disponivel} unidade={s.unidade} m2PorCaixa={m2} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
          <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
        </>
      )}
    </Card>
  )
}

function SaldosTab() {
  const [busca, setBusca] = useState('')
  const [deposito, setDeposito] = useState('')
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)
  const filtros = { busca: b, deposito, pagina, porPagina: POR_PAGINA }
  const q = useQuery({ queryKey: ['estoque', 'saldos', filtros], queryFn: () => listarSaldos(filtros), placeholderData: keepPreviousData })
  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos })

  return (
    <Card>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            placeholder="Produto, SKU, lote, tonalidade ou localização"
            className="pl-9"
            aria-label="Pesquisar"
          />
        </div>
        <NativeSelect
          value={deposito}
          onChange={(e) => {
            setDeposito(e.target.value)
            setPagina(1)
          }}
          aria-label="Depósito"
        >
          <option value="">Todos os depósitos</option>
          {depositos.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </NativeSelect>
      </div>
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <ErroCarregamento mensagem={mensagemErro(q.error)} />
      ) : !q.data?.linhas.length ? (
        <Vazio titulo="Nenhum saldo encontrado" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Lote / Ton. / Cal.</TableHead>
                <TableHead>Depósito / Local</TableHead>
                <TableHead className="text-right">Físico</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Avariado</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.linhas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="font-medium">{s.produto_descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.sku}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.lote_codigo ?? '—'}
                    {s.tonalidade && <span className="text-muted-foreground"> / {s.tonalidade}</span>}
                    {s.calibre && <span className="text-muted-foreground"> / {s.calibre}</span>}
                    {s.lote_bloqueado && <Badge variant="danger" className="ml-2">Bloqueado</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.deposito_nome}
                    {s.localizacao_codigo && <span className="text-muted-foreground"> · {s.localizacao_codigo}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Qtd valor={s.quantidade_fisica} unidade={s.unidade} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Qtd valor={s.quantidade_reservada} unidade={s.unidade} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Qtd valor={s.quantidade_avariada} unidade={s.unidade} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <Qtd valor={s.quantidade_disponivel} unidade={s.unidade} m2PorCaixa={s.eh_revestimento ? s.m2_por_caixa : null} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
        </>
      )}
    </Card>
  )
}
