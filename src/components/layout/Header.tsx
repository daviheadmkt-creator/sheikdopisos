import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, ChevronDown, KeyRound, LogOut, Menu, Search } from 'lucide-react'
import { contarCriticos } from '@/features/estoque/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/AuthProvider'
import { PERFIL_LABEL } from '@/features/auth/permissoes'
import { AlterarSenhaDialog } from '@/features/auth/AlterarSenhaDialog'
import { iniciais } from '@/lib/format'

export function Header({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { usuario, sair, pode } = useAuth()
  const navigate = useNavigate()
  const criticos = useQuery({
    queryKey: ['estoque', 'criticos'],
    queryFn: contarCriticos,
    enabled: pode('estoque'),
    refetchInterval: 5 * 60_000,
  })
  const [busca, setBusca] = useState('')
  const [alterarSenha, setAlterarSenha] = useState(false)

  const buscar = (e: React.FormEvent) => {
    e.preventDefault()
    const termo = busca.trim()
    if (termo.length >= 2) navigate(`/busca?q=${encodeURIComponent(termo)}`)
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6 print:hidden">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onAbrirMenu} aria-label="Abrir menu">
        <Menu className="!size-5" />
      </Button>

      <form onSubmit={buscar} className="relative max-w-md flex-1" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar clientes, produtos, SKU…"
          className="h-10 border-transparent bg-background pl-9"
          aria-label="Busca geral"
        />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
              <Bell className="!size-5" />
              {!!criticos.data && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {criticos.data > 99 ? '99+' : criticos.data}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="font-semibold">Notificações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {criticos.data ? (
              <DropdownMenuItem onSelect={() => navigate('/estoque?situacao=critico')} className="items-start">
                <AlertTriangle className="mt-0.5 text-destructive" />
                <span>
                  <span className="block font-medium">Estoque crítico</span>
                  <span className="text-xs text-muted-foreground">
                    {criticos.data} produto(s) abaixo do estoque mínimo
                  </span>
                </span>
              </DropdownMenuItem>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhuma notificação.
                <p className="mt-1 text-xs">Vencimentos e entregas serão exibidos aqui quando esses módulos forem liberados.</p>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar text-sm font-semibold text-primary">
                {iniciais(usuario?.nome ?? '')}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[160px] truncate text-sm font-medium">{usuario?.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {usuario?.perfis.map((p) => PERFIL_LABEL[p] ?? p).join(', ') || 'Sem perfil'}
                </span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <p className="font-medium">{usuario?.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{usuario?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setAlterarSenha(true)}>
              <KeyRound /> Alterar senha
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void sair()} className="text-destructive focus:text-destructive">
              <LogOut /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlterarSenhaDialog aberto={alterarSenha} onFechar={() => setAlterarSenha(false)} />
    </header>
  )
}
