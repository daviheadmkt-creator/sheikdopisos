import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  pagina: number
  porPagina: number
  total: number
  onChange: (pagina: number) => void
}

export function Pagination({ pagina, porPagina, total, onChange }: Props) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const inicio = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const fim = Math.min(pagina * porPagina, total)

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
      <span className="text-muted-foreground">
        {total === 0 ? 'Nenhum registro' : `Exibindo ${inicio}–${fim} de ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>
          <ChevronLeft /> Anterior
        </Button>
        <span className="min-w-[90px] text-center text-muted-foreground">
          Página {pagina} de {totalPaginas}
        </span>
        <Button variant="outline" size="sm" disabled={pagina >= totalPaginas} onClick={() => onChange(pagina + 1)}>
          Próxima <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
