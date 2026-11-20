import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { FASE_ATUAL, NAV } from './nav'

interface Props {
  recolhido: boolean
  onAlternar?: () => void
  onNavegar?: () => void
}

export function Sidebar({ recolhido, onAlternar, onNavegar }: Props) {
  const { pode } = useAuth()

  return (
    <div className="flex h-full flex-col bg-sidebar text-zinc-300">
      <div className={cn('flex shrink-0 items-center justify-center border-b border-white/5', recolhido ? 'h-20 px-2' : 'h-36 px-6')}>
        <Logo className={recolhido ? 'h-12 w-12' : 'h-28 w-auto max-w-full'} compacto={recolhido} />
      </div>

      <nav className="scrollbar-fina flex-1 overflow-y-auto px-3 py-4" aria-label="Menu principal">
        {NAV.map((grupo) => {
          const itens = grupo.itens.filter((i) => !i.modulo || pode(i.modulo, 'ler'))
          if (!itens.length) return null
          return (
            <div key={grupo.titulo} className="mb-4">
              {!recolhido && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {grupo.titulo}
                </p>
              )}
              <ul className="space-y-0.5">
                {itens.map((item) => {
                  const emBreve = item.fase > FASE_ATUAL
                  return (
                    <li key={item.rota}>
                      <NavLink
                        to={item.rota}
                        end={item.rota === '/'}
                        onClick={onNavegar}
                        title={recolhido ? `${item.label}${emBreve ? ` (Fase ${item.fase})` : ''}` : undefined}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            recolhido && 'justify-center px-0',
                            isActive
                              ? 'bg-primary/15 font-medium text-white'
                              : 'hover:bg-white/5 hover:text-white',
                            emBreve && !isActive && 'text-zinc-500',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-primary" />}
                            <item.icon
                              className={cn('h-[18px] w-[18px] shrink-0', isActive || !emBreve ? 'text-primary' : 'text-zinc-500')}
                            />
                            {!recolhido && (
                              <>
                                <span className="truncate">{item.label}</span>
                                {emBreve && (
                                  <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500">
                                    Fase {item.fase}
                                  </span>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {onAlternar && (
        <button
          onClick={onAlternar}
          className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-white/5 text-xs text-zinc-500 transition-colors hover:text-primary"
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
        >
          {recolhido ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!recolhido && 'Recolher menu'}
        </button>
      )}
    </div>
  )
}
