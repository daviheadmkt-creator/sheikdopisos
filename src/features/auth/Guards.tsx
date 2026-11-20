import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Carregando } from '@/components/common/Estados'
import { Button } from '@/components/ui/button'
import { useAuth } from './AuthProvider'
import type { Acao } from './permissoes'

export function RequireAuth() {
  const { session, iniciando, carregandoPerfil, usuario, erroPerfil, sair } = useAuth()
  const location = useLocation()

  if (iniciando || carregandoPerfil) return <Carregando texto="Verificando sessão…" />
  if (!session) return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />
  if (erroPerfil)
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 px-4 text-center">
        <ShieldAlert className="h-8 w-8 text-destructive" />
        <h1 className="text-lg font-semibold">Não foi possível carregar seu perfil</h1>
        <p className="text-sm text-muted-foreground">{erroPerfil}</p>
        <Button variant="outline" onClick={() => void sair()}>
          Sair
        </Button>
      </div>
    )
  if (!usuario) return <Carregando texto="Carregando perfil…" />
  return <Outlet />
}

export function RequirePermission({ modulo, acao = 'ler', children }: { modulo: string; acao?: Acao; children: ReactNode }) {
  const { pode } = useAuth()
  if (!pode(modulo, acao)) return <AcessoNegado />
  return <>{children}</>
}

export function AcessoNegado() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <div className="rounded-full bg-destructive/10 p-4 text-destructive">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
      <p className="text-sm text-muted-foreground">
        Seu perfil não possui permissão para acessar esta área. Se precisar, solicite acesso ao administrador.
      </p>
    </div>
  )
}
