import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
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
import { listarFornecedores } from './api'

const POR_PAGINA = 20

export function FornecedoresPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('ativo')
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(busca)
  const filtros = { busca: b, status, pagina, porPagina: POR_PAGINA }
  const q = useQuery({ queryKey: ['fornecedores', 'lista', filtros], queryFn: () => listarFornecedores(filtros), placeholderData: keepPreviousData })

  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        descricao="Fabricantes e distribuidores: contatos, condições comerciais, produtos fornecidos e histórico de compras."
        acoes={
          pode('fornecedores', 'criar') && (
            <Button asChild>
              <Link to="/fornecedores/novo">
                <Plus /> Novo fornecedor
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              placeholder="Razão social, fantasia, CNPJ, contato ou código"
              className="pl-9"
              aria-label="Pesquisar fornecedores"
            />
          </div>
          <NativeSelect
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPagina(1)
            }}
            aria-label="Status"
          >
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
            <option value="">Todos</option>
          </NativeSelect>
        </div>
        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.linhas.length ? (
          <Vazio
            titulo={busca ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
            acao={
              !busca &&
              pode('fornecedores', 'criar') && (
                <Button asChild>
                  <Link to="/fornecedores/novo">
                    <Plus /> Cadastrar fornecedor
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
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/fornecedores/${f.id}`)}>
                    <TableCell className="tabular-nums text-muted-foreground">{f.codigo}</TableCell>
                    <TableCell>
                      <p className="font-medium">{f.nome_fantasia || f.razao_social}</p>
                      {f.nome_fantasia && <p className="text-xs text-muted-foreground">{f.razao_social}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatarDocumento(f.cnpj)}</TableCell>
                    <TableCell>
                      <p>{f.contato_nome ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{formatarTelefone(f.whatsapp || f.telefone)}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{f.cidade ? `${f.cidade}/${f.uf}` : '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={f.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
          </>
        )}
      </Card>
    </>
  )
}
