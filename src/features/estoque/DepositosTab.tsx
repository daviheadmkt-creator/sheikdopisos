import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  alterarDepositoAtivo,
  alterarLocalizacaoAtiva,
  criarLocalizacao,
  listarDepositos,
  listarLocalizacoes,
  salvarDeposito,
} from './api'

export function DepositosTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const podeCriar = pode('estoque', 'criar')
  const podeEditar = pode('estoque', 'editar')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [novoDep, setNovoDep] = useState({ codigo: '', nome: '' })
  const [novoLocal, setNovoLocal] = useState({ codigo: '', descricao: '' })

  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos })
  const depId = selecionado ?? depositos.data?.[0]?.id ?? null
  const dep = depositos.data?.find((d) => d.id === depId)
  const locais = useQuery({
    queryKey: ['estoque', 'localizacoes', depId],
    queryFn: () => listarLocalizacoes(depId!),
    enabled: !!depId,
  })
  const invalidar = () => qc.invalidateQueries({ queryKey: ['estoque'] })
  const onErro = (e: unknown) => toast.error(mensagemErro(e))

  const criarDep = useMutation({
    mutationFn: () => salvarDeposito(novoDep),
    onSuccess: () => {
      toast.success('Depósito criado.')
      setNovoDep({ codigo: '', nome: '' })
      invalidar()
    },
    onError: onErro,
  })
  const ativarDep = useMutation({
    mutationFn: (a: { id: string; ativo: boolean }) => alterarDepositoAtivo(a.id, a.ativo),
    onSuccess: invalidar,
    onError: onErro,
  })
  const criarLoc = useMutation({
    mutationFn: () => criarLocalizacao(depId!, novoLocal.codigo, novoLocal.descricao),
    onSuccess: () => {
      toast.success('Localização criada.')
      setNovoLocal({ codigo: '', descricao: '' })
      invalidar()
    },
    onError: onErro,
  })
  const ativarLoc = useMutation({
    mutationFn: (a: { id: string; ativo: boolean }) => alterarLocalizacaoAtiva(a.id, a.ativo),
    onSuccess: invalidar,
    onError: onErro,
  })

  if (depositos.isLoading) return <Carregando />
  if (depositos.error) return <ErroCarregamento mensagem={mensagemErro(depositos.error)} />

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Depósitos</CardTitle>
          <CardDescription>Locais físicos de armazenagem.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {podeCriar && (
            <form
              className="grid gap-2 rounded-lg border bg-background/50 p-3 sm:grid-cols-[110px_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault()
                if (novoDep.codigo && novoDep.nome.trim().length >= 2) criarDep.mutate()
              }}
            >
              <Input
                placeholder="Código"
                value={novoDep.codigo}
                onChange={(e) => setNovoDep({ ...novoDep, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) })}
                aria-label="Código do depósito"
              />
              <Input placeholder="Nome" value={novoDep.nome} onChange={(e) => setNovoDep({ ...novoDep, nome: e.target.value })} aria-label="Nome do depósito" />
              <Button type="submit" disabled={criarDep.isPending || !novoDep.codigo || novoDep.nome.trim().length < 2}>
                {criarDep.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Criar
              </Button>
            </form>
          )}
          <ul className="divide-y rounded-lg border">
            {depositos.data?.map((d) => (
              <li
                key={d.id}
                className={cn('flex cursor-pointer items-center justify-between gap-3 px-4 py-3', d.id === depId && 'bg-accent')}
                onClick={() => setSelecionado(d.id)}
              >
                <div>
                  <p className={cn('font-medium', !d.ativo && 'text-muted-foreground line-through')}>
                    {d.nome} {d.padrao && <Star className="ml-1 inline h-3.5 w-3.5 fill-primary text-primary" />}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{d.codigo}</p>
                </div>
                <Switch
                  checked={d.ativo}
                  disabled={!podeEditar || d.padrao}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(ativo) => ativarDep.mutate({ id: d.id, ativo })}
                  aria-label={`Ativar ou inativar ${d.nome}`}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Localizações {dep && <span className="font-normal text-muted-foreground">— {dep.nome}</span>}
          </CardTitle>
          <CardDescription>Endereços de armazenagem (ex.: rua-prateleira-nível: A-01-03).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {podeCriar && depId && (
            <form
              className="grid gap-2 rounded-lg border bg-background/50 p-3 sm:grid-cols-[140px_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault()
                if (novoLocal.codigo) criarLoc.mutate()
              }}
            >
              <Input
                placeholder="Código"
                value={novoLocal.codigo}
                onChange={(e) => setNovoLocal({ ...novoLocal, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9._/-]/g, '').slice(0, 20) })}
                aria-label="Código da localização"
              />
              <Input placeholder="Descrição (opcional)" value={novoLocal.descricao} onChange={(e) => setNovoLocal({ ...novoLocal, descricao: e.target.value })} aria-label="Descrição" />
              <Button type="submit" disabled={criarLoc.isPending || !novoLocal.codigo}>
                {criarLoc.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
              </Button>
            </form>
          )}
          {locais.isLoading ? (
            <Carregando />
          ) : !locais.data?.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma localização. Sem localizações, o saldo fica no depósito como um todo.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {locais.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className={cn('font-mono text-sm font-medium', !l.ativo && 'text-muted-foreground line-through')}>{l.codigo}</p>
                    {l.descricao && <p className="truncate text-xs text-muted-foreground">{l.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!l.ativo && <Badge variant="neutral">Inativa</Badge>}
                    <Switch
                      checked={l.ativo}
                      disabled={!podeEditar}
                      onCheckedChange={(ativo) => ativarLoc.mutate({ id: l.id, ativo })}
                      aria-label={`Ativar ou inativar ${l.codigo}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
