import { Input } from '@/components/ui/input'
import { periodoPreset, PRESETS } from '@/lib/periodos'
import { cn } from '@/lib/utils'

export function PeriodoFiltro({ de, ate, onChange, className }: { de: string; ate: string; onChange: (p: { de: string; ate: string }) => void; className?: string }) {
  const ativo = PRESETS.find((p) => { const x = periodoPreset(p.id); return x.de === de && x.ate === ate })?.id
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Períodos rápidos">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(periodoPreset(p.id))}
            className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', ativo === p.id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            aria-pressed={ativo === p.id}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Input type="date" value={de} max={ate} onChange={(e) => onChange({ de: e.target.value, ate })} className="h-9 w-[150px]" aria-label="De" />
      <Input type="date" value={ate} min={de} onChange={(e) => onChange({ de, ate: e.target.value })} className="h-9 w-[150px]" aria-label="Até" />
    </div>
  )
}
