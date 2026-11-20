import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog'
import { modoVisualizacao } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

const CHAVE_MENU = 'sheik.menuRecolhido'

function lerPreferencia() {
  try {
    return localStorage.getItem(CHAVE_MENU) === '1'
  } catch {
    return false
  }
}

export function AppLayout() {
  const [recolhido, setRecolhido] = useState(lerPreferencia)
  const [menuMobile, setMenuMobile] = useState(false)
  const location = useLocation()

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_MENU, recolhido ? '1' : '0')
    } catch {
      /* preferência visual apenas; ignorar falhas de armazenamento */
    }
  }, [recolhido])

  useEffect(() => setMenuMobile(false), [location.pathname])

  return (
    <div className="flex min-h-full">
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 lg:block print:!hidden',
          recolhido ? 'w-[76px]' : 'w-64',
        )}
      >
        <Sidebar recolhido={recolhido} onAlternar={() => setRecolhido((v) => !v)} />
      </aside>

      <Dialog open={menuMobile} onOpenChange={setMenuMobile}>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <Sidebar recolhido={false} onNavegar={() => setMenuMobile(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        {modoVisualizacao && (
          <div className="bg-primary px-4 py-1.5 text-center text-xs font-medium text-primary-foreground print:hidden">
            Modo visualização — banco de dados não conectado. As telas aparecem vazias e nada é salvo.
          </div>
        )}
        <Header onAbrirMenu={() => setMenuMobile(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
