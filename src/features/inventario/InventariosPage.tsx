import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ClipboardCheck, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { listarDepositos } from '@/features/estoque/api'
import { listarCategorias } from '@/features/produtos/api'
import { formatarData } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { abrirInventario, listarInventarios, STATUS_INVENTARIO } from './api'

export function InventariosPage() {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const [novo, setNovo] = useState(false)
  const q = useQuery({ queryKey: ['estoque', 'inventarios'], queryFn: listarInventarios })

  return (
    <>
      <PageHeader
        titulo="Inventário"
        descricao="Contagem física, divergências, recontagem, aprovação e ajustes auditáveis."
        acoes={
          pode('inventario', 'criar') && (
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo inventário
            </Button>
          )
        }
      />
      <Card>
        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.length ? (
          <Vazio titulo="Nenhum inventário realizado" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Depósito</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Aberto em</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => navigate(`/inventario/${i.id}`)}>
                  <TableCell className="tabular-nums font-medium">#{i.numero}</TableCell>
                  <TableCell>
                    <p className="font-medium">{i.descricao}</p>
                    {i.categoria && <p className="text-xs text-muted-foreground">Categoria: {i.categoria.nome}</p>}
                  </TableCell>
                  <TableCell>{i.deposito?.nome}</TableCell>
                  <TableCell className="tabular-nums">{i.inventario_itens[0]?.count ?? 0}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatarData(i.created_at, true)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_INVENTARIO[i.status].variant}>{STATUS_INVENTARIO[i.status].label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <NovoInventarioDialog aberto={novo} onFechar={() => setNovo(false)} />
    </>
  )
}

function NovoInventarioDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deposito, setDeposito] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const depositos = useQuery({ queryKey: ['estoque', 'depositos'], queryFn: listarDepositos, enabled: aberto })
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias, enabled: aberto })

  useEffect(() => {
    if (aberto) {
      setCategoria('')
      setDescricao(`Inventário ${new Date().toLocaleDateString('pt-BR')}`)
      setDeposito('')
    }
  }, [aberto])
  useEffect(() => {
    if (aberto && !deposito && depositos.data) setDeposito(depositos.data.find((d) => d.padrao)?.id ?? '')
  }, [aberto, deposito, depositos.data])

  const abrir = useMutation({
    mutationFn: () => abrirInventario(deposito, descricao, categoria),
    onSuccess: (id) => {
      toast.success('Inventário aberto. O depósito está bloqueado para movimentações.')
      qc.invalidateQueries({ queryKey: ['estoque'] })
      onFechar()
      navigate(`/inventario/${id}`)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Abrir inventário
          </DialogTitle>
          <DialogDescription>O sistema registra o saldo atual de cada item para comparar com a contagem física.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Depósito" obrigatorio>
            <NativeSelect value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              <option value="">Selecione</option>
              {depositos.data
                ?.filter((d) => d.ativo)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Categoria" ajuda="Opcional: inventário parcial de uma categoria.">
            <NativeSelect value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Descrição" obrigatorio>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Enquanto o inventário estiver aberto, entradas, saídas e transferências deste depósito ficam bloqueadas.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => abrir.mutate()} disabled={!deposito || descricao.trim().length < 3 || abrir.isPending}>
            {abrir.isPending && <Loader2 className="animate-spin" />}
            Abrir inventário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
