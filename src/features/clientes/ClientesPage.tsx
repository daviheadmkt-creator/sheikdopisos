import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus, Search, User } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, StatusBadge, Vazio } from '@/components/common/Estados'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatarDocumento, formatarTelefone } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { listarClientes, listarVendedores } from './api'

const POR_PAGINA = 20

export function ClientesPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('ativo')
  const [tipo, setTipo] = useState('')
  const [pagina, setPagina] = useState(1)
  const buscaDebounced = useDebounce(busca)

  const filtros = { busca: buscaDebounced, status, tipo, pagina, porPagina: POR_PAGINA }
  const q = useQuery({
    queryKey: ['clientes', 'lista', filtros],
    queryFn: () => listarClientes(filtros),
    placeholderData: keepPreviousData,
  })
  const vendedores = useQuery({ queryKey: ['vendedores'], queryFn: listarVendedores, staleTime: 5 * 60_000 })
  const nomeVendedor = useMemo(() => new Map((vendedores.data ?? []).map((v) => [v.id, v.nome])), [vendedores.data])

  const alterarFiltro = (fn: () => void) => {
    fn()
    setPagina(1)
  }

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Cadastro de pessoas físicas e jurídicas, endereços de entrega e histórico."
        acoes={
          pode('clientes', 'criar') && (
            <Button asChild>
              <Link to="/clientes/novo">
                <Plus /> Novo cliente
              </Link>
            </Button>
          )
        }
      />

      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => alterarFiltro(() => setBusca(e.target.value))}
              placeholder="Nome, razão social, CPF/CNPJ, telefone, e-mail ou código"
              className="pl-9"
              aria-label="Pesquisar clientes"
            />
          </div>
          <NativeSelect value={status} onChange={(e) => alterarFiltro(() => setStatus(e.target.value))} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
            <option value="bloqueado">Bloqueados</option>
          </NativeSelect>
          <NativeSelect value={tipo} onChange={(e) => alterarFiltro(() => setTipo(e.target.value))} aria-label="Tipo de pessoa">
            <option value="">PF e PJ</option>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </NativeSelect>
        </div>

        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.linhas.length ? (
          <Vazio
            titulo={busca || tipo || status !== 'ativo' ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            descricao={busca ? 'Revise os termos da pesquisa ou os filtros.' : undefined}
            acao={
              !busca &&
              pode('clientes', 'criar') && (
                <Button asChild>
                  <Link to="/clientes/novo">
                    <Plus /> Cadastrar primeiro cliente
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
                  <TableHead className="w-20">Cód.</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((c) => {
                  const end = c.cliente_enderecos.find((e) => e.principal) ?? c.cliente_enderecos[0]
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/clientes/${c.id}`)}>
                      <TableCell className="tabular-nums text-muted-foreground">{c.codigo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {c.tipo_pessoa === 'PJ' ? (
                            <Building2 className="h-4 w-4 shrink-0 text-info" />
                          ) : (
                            <User className="h-4 w-4 shrink-0 text-primary" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.nome}</p>
                            {c.razao_social && <p className="truncate text-xs text-muted-foreground">{c.razao_social}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatarDocumento(c.documento)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p>{formatarTelefone(c.whatsapp || c.telefone)}</p>
                        {c.email && <p className="max-w-[200px] truncate text-xs text-muted-foreground">{c.email}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{end ? `${end.cidade}/${end.uf}` : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.vendedor_id ? nomeVendedor.get(c.vendedor_id) ?? '—' : '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild onClick={(e) => e.stopPropagation()}>
                          <Link to={`/clientes/${c.id}`} aria-label={`Abrir ${c.nome}`}>
                            <Pencil />
                          </Link>
                        </Button>
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
    </>
  )
}
