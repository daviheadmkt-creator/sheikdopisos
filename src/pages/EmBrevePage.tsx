import { Link } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NavItem } from '@/components/layout/nav'

/** Indica claramente que o módulo ainda não está disponível (nenhuma ação simulada). */
export function EmBrevePage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sidebar text-primary">
        <item.icon className="h-7 w-7" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">{item.label}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium">
          <Construction className="h-3.5 w-3.5 text-primary" /> Previsto para a Fase {item.fase}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Este módulo ainda não está disponível. Ele será liberado após a conclusão e homologação das fases anteriores.
      </p>
      <Button variant="outline" asChild>
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  )
}

export function NaoEncontradoPage() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
      <Button variant="outline" className="mt-6" asChild>
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  )
}
