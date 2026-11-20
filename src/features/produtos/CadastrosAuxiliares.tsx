import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/AuthProvider'
import { mensagemErro } from '@/lib/supabase'
import { atualizarCategoria, atualizarMarca, criarCategoria, criarMarca, listarCategorias, listarMarcas } from './api'

export function CadastrosAuxiliares() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const podeCriar = pode('produtos', 'criar')
  const podeEditar = pode('produtos', 'editar')

  const categorias = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias })
  const marcas = useQuery({ queryKey: ['marcas'], queryFn: listarMarcas })

  const [novaCategoria, setNovaCategoria] = useState('')
  const [revestimento, setRevestimento] = useState(false)
  const [novaMarca, setNovaMarca] = useState('')

  const onErro = (e: unknown) => toast.error(mensagemErro(e))

  const addCategoria = useMutation({
    mutationFn: () => criarCategoria(novaCategoria, revestimento),
    onSuccess: () => {
      toast.success('Categoria criada.')
      setNovaCategoria('')
      setRevestimento(false)
      qc.invalidateQueries({ queryKey: ['categorias'] })
    },
    onError: onErro,
  })
  const editCategoria = useMutation({
    mutationFn: (a: { id: string; dados: Parameters<typeof atualizarCategoria>[1] }) => atualizarCategoria(a.id, a.dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorias'] }),
    onError: onErro,
  })
  const addMarca = useMutation({
    mutationFn: () => criarMarca(novaMarca),
    onSuccess: () => {
      toast.success('Marca criada.')
      setNovaMarca('')
      qc.invalidateQueries({ queryKey: ['marcas'] })
    },
    onError: onErro,
  })
  const editMarca = useMutation({
    mutationFn: (a: { id: string; ativo: boolean }) => atualizarMarca(a.id, { ativo: a.ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marcas'] }),
    onError: onErro,
  })

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
          <CardDescription>
            Categorias marcadas como <strong>revestimento</strong> exigem peças/caixa e m²/caixa no cadastro do produto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {podeCriar && (
            <form
              className="flex flex-col gap-3 rounded-lg border bg-background/50 p-3 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault()
                if (novaCategoria.trim().length >= 2) addCategoria.mutate()
              }}
            >
              <Input
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                placeholder="Nova categoria"
                aria-label="Nome da nova categoria"
              />
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Checkbox id="rev" checked={revestimento} onCheckedChange={(v) => setRevestimento(v === true)} />
                <Label htmlFor="rev">Revestimento</Label>
              </div>
              <Button type="submit" disabled={addCategoria.isPending || novaCategoria.trim().length < 2}>
                {addCategoria.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
              </Button>
            </form>
          )}
          {categorias.isLoading ? (
            <Carregando />
          ) : categorias.error ? (
            <ErroCarregamento mensagem={mensagemErro(categorias.error)} />
          ) : (
            <ul className="divide-y rounded-lg border">
              {categorias.data?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={c.ativo ? '' : 'text-muted-foreground line-through'}>{c.nome}</span>
                    {c.revestimento && <Badge variant="info">Revestimento</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.ativo ? 'Ativa' : 'Inativa'}
                    <Switch
                      checked={c.ativo}
                      disabled={!podeEditar}
                      onCheckedChange={(ativo) => editCategoria.mutate({ id: c.id, dados: { ativo } })}
                      aria-label={`Ativar ou inativar ${c.nome}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marcas</CardTitle>
          <CardDescription>Fabricantes dos produtos comercializados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {podeCriar && (
            <form
              className="flex gap-3 rounded-lg border bg-background/50 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (novaMarca.trim().length >= 2) addMarca.mutate()
              }}
            >
              <Input
                value={novaMarca}
                onChange={(e) => setNovaMarca(e.target.value)}
                placeholder="Nova marca"
                aria-label="Nome da nova marca"
              />
              <Button type="submit" disabled={addMarca.isPending || novaMarca.trim().length < 2}>
                {addMarca.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
              </Button>
            </form>
          )}
          {marcas.isLoading ? (
            <Carregando />
          ) : marcas.error ? (
            <ErroCarregamento mensagem={mensagemErro(marcas.error)} />
          ) : !marcas.data?.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma marca cadastrada.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {marcas.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className={m.ativo ? '' : 'text-muted-foreground line-through'}>{m.nome}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {m.ativo ? 'Ativa' : 'Inativa'}
                    <Switch
                      checked={m.ativo}
                      disabled={!podeEditar}
                      onCheckedChange={(ativo) => editMarca.mutate({ id: m.id, ativo })}
                      aria-label={`Ativar ou inativar ${m.nome}`}
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
