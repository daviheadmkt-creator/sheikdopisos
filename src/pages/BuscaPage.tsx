import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Package, Users } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento, StatusBadge, Vazio } from '@/components/common/Estados'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarClientes } from '@/features/clientes/api'
import { listarProdutos } from '@/features/produtos/api'
import { formatarDocumento, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'

export function BuscaPage() {
  const [params] = useSearchParams()
  const termo = params.get('q') ?? ''
  const { pode } = useAuth()
  const verClientes = pode('clientes')
  const verProdutos = pode('produtos')

  const clientes = useQuery({
    queryKey: ['busca', 'clientes', termo],
    queryFn: () => listarClientes({ busca: termo, status: '', tipo: '', pagina: 1, porPagina: 10 }),
    enabled: verClientes && termo.length >= 2,
  })
  const produtos = useQuery({
    queryKey: ['busca', 'produtos', termo],
    queryFn: () => listarProdutos({ busca: termo, categoria: '', status: '', pagina: 1, porPagina: 10 }),
    enabled: verProdutos && termo.length >= 2,
  })

  return (
    <>
      <PageHeader titulo="Resultados da busca" descricao={`Termo pesquisado: “${termo}”`} />
      <div className="grid gap-6 lg:grid-cols-2">
        {verClientes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Clientes
                {clientes.data && <span className="text-sm font-normal text-muted-foreground">({clientes.data.total})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clientes.isLoading ? (
                <Carregando />
              ) : clientes.error ? (
                <ErroCarregamento mensagem={mensagemErro(clientes.error)} />
              ) : !clientes.data?.linhas.length ? (
                <Vazio titulo="Nenhum cliente encontrado" />
              ) : (
                <ul className="divide-y">
                  {clientes.data.linhas.map((c) => (
                    <li key={c.id}>
                      <Link to={`/clientes/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                        <span>
                          <span className="font-medium">{c.nome}</span>
                          <span className="block text-xs text-muted-foreground">{formatarDocumento(c.documento)}</span>
                        </span>
                        <StatusBadge status={c.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
        {verProdutos && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Produtos
                {produtos.data && <span className="text-sm font-normal text-muted-foreground">({produtos.data.total})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {produtos.isLoading ? (
                <Carregando />
              ) : produtos.error ? (
                <ErroCarregamento mensagem={mensagemErro(produtos.error)} />
              ) : !produtos.data?.linhas.length ? (
                <Vazio titulo="Nenhum produto encontrado" />
              ) : (
                <ul className="divide-y">
                  {produtos.data.linhas.map((p) => (
                    <li key={p.id}>
                      <Link to={`/produtos/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                        <span>
                          <span className="font-medium">{p.descricao}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{p.sku}</span>
                        </span>
                        <span className="whitespace-nowrap tabular-nums">{formatarMoeda(p.preco_venda)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
        {!verClientes && !verProdutos && <Vazio titulo="Seu perfil não tem acesso a módulos pesquisáveis." />}
      </div>
    </>
  )
}
