import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ImageOff, Package, Plus, Search, Tags } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, StatusBadge, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { listarCategorias, listarProdutos, urlImagem } from './api'
import { CadastrosAuxiliares } from './CadastrosAuxiliares'

const POR_PAGINA = 20

export function ProdutosPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [status, setStatus] = useState('ativo')
  const [pagina, setPagina] = useState(1)
  const buscaDebounced = useDebounce(busca)

  const filtros = { busca: buscaDebounced, categoria, status, pagina, porPagina: POR_PAGINA }
  const q = useQuery({
    queryKey: ['produtos', 'lista', filtros],
    queryFn: () => listarProdutos(filtros),
    placeholderData: keepPreviousData,
  })
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias })

  const filtrar = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Porcelanatos, cerâmicas, argamassas, rejuntes e demais materiais."
        acoes={
          pode('produtos', 'criar') && (
            <Button asChild>
              <Link to="/produtos/novo">
                <Plus /> Novo produto
              </Link>
            </Button>
          )
        }
      />

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">
            <Package /> Produtos
          </TabsTrigger>
          <TabsTrigger value="auxiliares">
            <Tags /> Categorias e marcas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          <Card>
            <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_220px_160px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => filtrar(() => setBusca(e.target.value))}
                  placeholder="Descrição, SKU ou código de barras"
                  className="pl-9"
                  aria-label="Pesquisar produtos"
                />
              </div>
              <NativeSelect value={categoria} onChange={(e) => filtrar(() => setCategoria(e.target.value))} aria-label="Categoria">
                <option value="">Todas as categorias</option>
                {categorias.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={status} onChange={(e) => filtrar(() => setStatus(e.target.value))} aria-label="Status">
                <option value="">Todos</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </NativeSelect>
            </div>

            {q.isLoading ? (
              <Carregando />
            ) : q.error ? (
              <ErroCarregamento mensagem={mensagemErro(q.error)} />
            ) : !q.data?.linhas.length ? (
              <Vazio
                titulo={busca || categoria ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                acao={
                  !busca &&
                  pode('produtos', 'criar') && (
                    <Button asChild>
                      <Link to="/produtos/novo">
                        <Plus /> Cadastrar primeiro produto
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16" />
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.linhas.map((p) => {
                      const img = p.produto_imagens.find((i) => i.principal) ?? p.produto_imagens[0]
                      return (
                        <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/produtos/${p.id}`)}>
                          <TableCell>
                            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border bg-background">
                              {img ? (
                                <img src={urlImagem(img.storage_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <ImageOff className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{p.sku}</TableCell>
                          <TableCell>
                            <p className="font-medium">{p.descricao}</p>
                            {p.eh_revestimento && p.m2_por_caixa && (
                              <p className="text-xs text-muted-foreground">{formatarNumero(p.m2_por_caixa, 4)} m²/caixa</p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {p.categoria?.nome}
                            {p.eh_revestimento && (
                              <Badge variant="info" className="ml-2">
                                Revestimento
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{p.marca?.nome ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {formatarMoeda(p.preco_venda)}
                            <span className="text-xs text-muted-foreground"> /{p.unidade}</span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="auxiliares">
          <CadastrosAuxiliares />
        </TabsContent>
      </Tabs>
    </>
  )
}
