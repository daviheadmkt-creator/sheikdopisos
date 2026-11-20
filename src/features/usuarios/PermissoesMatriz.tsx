import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ACAO_LABEL, ACOES, PERFIS, PERFIL_LABEL, type Acao } from '@/features/auth/permissoes'
import { mensagemErro } from '@/lib/supabase'
import { alternarPermissao, listarModulos, listarPerfis, listarPermissoesDoPerfil } from './api'

export function PermissoesMatriz({ editavel }: { editavel: boolean }) {
  const qc = useQueryClient()
  const [perfil, setPerfil] = useState<string>('gerente')
  const ehAdminPerfil = perfil === 'administrador'

  const modulos = useQuery({ queryKey: ['modulos'], queryFn: listarModulos, staleTime: Infinity })
  const perfis = useQuery({ queryKey: ['perfis'], queryFn: listarPerfis, staleTime: Infinity })
  const perms = useQuery({
    queryKey: ['perfil_permissoes', perfil],
    queryFn: () => listarPermissoesDoPerfil(perfil),
    enabled: !ehAdminPerfil,
  })
  const set = useMemo(() => new Set((perms.data ?? []).map((p) => `${p.modulo}:${p.acao}`)), [perms.data])

  const alternar = useMutation({
    mutationFn: (a: { modulo: string; acao: Acao; conceder: boolean }) =>
      alternarPermissao(perfil, a.modulo, a.acao, a.conceder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfil_permissoes', perfil] })
      qc.invalidateQueries({ queryKey: ['auth'] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const descricao = perfis.data?.find((p) => p.codigo === perfil)?.descricao

  return (
    <Card>
      <CardHeader className="gap-3 border-b sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Matriz de permissões</CardTitle>
          <CardDescription>
            {editavel
              ? 'Marque as ações permitidas para cada módulo. As alterações valem imediatamente.'
              : 'Somente administradores podem alterar permissões.'}
          </CardDescription>
        </div>
        <NativeSelect value={perfil} onChange={(e) => setPerfil(e.target.value)} className="sm:w-56" aria-label="Perfil">
          {PERFIS.map((p) => (
            <option key={p} value={p}>
              {PERFIL_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
      </CardHeader>
      {descricao && <p className="border-b bg-background/50 px-5 py-3 text-sm text-muted-foreground">{descricao}</p>}
      {ehAdminPerfil && (
        <p className="flex items-center gap-2 border-b bg-accent px-5 py-3 text-sm">
          <Lock className="h-4 w-4 text-primary" /> O perfil Administrador possui acesso total e não pode ser restringido.
        </p>
      )}

      {modulos.isLoading || (!ehAdminPerfil && perms.isLoading) ? (
        <Carregando />
      ) : modulos.error || perms.error ? (
        <ErroCarregamento mensagem={mensagemErro(modulos.error ?? perms.error)} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              {ACOES.map((a) => (
                <TableHead key={a} className="text-center">
                  {ACAO_LABEL[a]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.data?.map((m) => (
              <TableRow key={m.codigo}>
                <TableCell className="whitespace-nowrap font-medium">{m.nome}</TableCell>
                {ACOES.map((a) => {
                  const marcado = ehAdminPerfil || set.has(`${m.codigo}:${a}`)
                  return (
                    <TableCell key={a} className="text-center">
                      <Checkbox
                        checked={marcado}
                        disabled={!editavel || ehAdminPerfil || alternar.isPending}
                        onCheckedChange={(c) => alternar.mutate({ modulo: m.codigo, acao: a, conceder: c === true })}
                        aria-label={`${ACAO_LABEL[a]} em ${m.nome}`}
                      />
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
