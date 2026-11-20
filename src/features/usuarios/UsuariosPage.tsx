import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MoreHorizontal, Power, ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { PERFIL_LABEL } from '@/features/auth/permissoes'
import { formatarData, iniciais } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { definirAtivo, enviarRedefinicaoSenha, listarUsuarios, type UsuarioLista } from './api'
import { NovoUsuarioDialog } from './NovoUsuarioDialog'
import { PerfisUsuarioDialog } from './PerfisUsuarioDialog'
import { PermissoesMatriz } from './PermissoesMatriz'

export function UsuariosPage() {
  const { pode, usuario: eu } = useAuth()
  const qc = useQueryClient()
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<UsuarioLista | null>(null)
  const ehAdmin = eu?.perfis.includes('administrador') ?? false

  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios })

  const ativar = useMutation({
    mutationFn: (u: UsuarioLista) => definirAtivo(u.id, !u.ativo),
    onSuccess: (_d, u) => {
      toast.success(u.ativo ? 'Usuário desativado. As sessões dele serão bloqueadas.' : 'Usuário reativado.')
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const redefinir = useMutation({
    mutationFn: (u: UsuarioLista) => enviarRedefinicaoSenha(u.email),
    onSuccess: (_d, u) => toast.success(`Link de redefinição enviado para ${u.email}.`),
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <>
      <PageHeader
        titulo="Usuários e Permissões"
        descricao="Controle de acesso por perfil. As permissões também são verificadas no servidor."
        acoes={
          pode('usuarios', 'criar') && (
            <Button onClick={() => setNovo(true)}>
              <UserPlus /> Novo usuário
            </Button>
          )
        }
      />

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">
            <Users /> Usuários
          </TabsTrigger>
          <TabsTrigger value="permissoes">
            <ShieldCheck /> Permissões por perfil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Card>
            {usuarios.isLoading ? (
              <Carregando />
            ) : usuarios.error ? (
              <ErroCarregamento mensagem={mensagemErro(usuarios.error)} />
            ) : !usuarios.data?.length ? (
              <Vazio titulo="Nenhum usuário" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Perfis</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.data.map((u) => {
                    const ehEu = u.id === eu?.id
                    const alvoAdmin = u.usuario_perfis.some((p) => p.perfil === 'administrador')
                    const podeGerenciar = pode('usuarios', 'editar') && (ehAdmin || !alvoAdmin)
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar text-xs font-semibold text-primary">
                              {iniciais(u.nome)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {u.nome} {ehEu && <span className="text-xs text-muted-foreground">(você)</span>}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.usuario_perfis.length ? (
                              u.usuario_perfis.map((p) => (
                                <Badge key={p.perfil} variant={p.perfil === 'administrador' ? 'dark' : 'default'}>
                                  {PERFIL_LABEL[p.perfil] ?? p.perfil}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="danger">Sem perfil</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.ativo ? 'success' : 'neutral'}>{u.ativo ? 'Ativo' : 'Desativado'}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {u.ultimo_acesso ? formatarData(u.ultimo_acesso, true) : 'Nunca acessou'}
                        </TableCell>
                        <TableCell>
                          {podeGerenciar && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Ações para ${u.nome}`}>
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setEditando(u)}>
                                  <UserCog /> Alterar perfis
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => redefinir.mutate(u)}>
                                  <KeyRound /> Enviar redefinição de senha
                                </DropdownMenuItem>
                                {!ehEu && (
                                  <DropdownMenuItem
                                    onSelect={() => ativar.mutate(u)}
                                    className={u.ativo ? 'text-destructive focus:text-destructive' : ''}
                                  >
                                    <Power /> {u.ativo ? 'Desativar usuário' : 'Reativar usuário'}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="permissoes">
          <PermissoesMatriz editavel={ehAdmin} />
        </TabsContent>
      </Tabs>

      <NovoUsuarioDialog aberto={novo} onFechar={() => setNovo(false)} podeAdmin={ehAdmin} />
      <PerfisUsuarioDialog usuario={editando} onFechar={() => setEditando(null)} podeAdmin={ehAdmin} />
    </>
  )
}
