import { Checkbox } from '@/components/ui/checkbox'
import { PERFIS, PERFIL_LABEL } from '@/features/auth/permissoes'

export function SeletorPerfis({
  valor,
  onChange,
  podeAdmin,
}: {
  valor: string[]
  onChange: (v: string[]) => void
  podeAdmin: boolean
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERFIS.map((p) => {
        const bloqueado = p === 'administrador' && !podeAdmin
        const marcado = valor.includes(p)
        return (
          <label
            key={p}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              marcado ? 'border-primary bg-accent' : 'hover:bg-accent/50'
            } ${bloqueado ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Checkbox
              checked={marcado}
              disabled={bloqueado}
              onCheckedChange={(c) => onChange(c ? [...valor, p] : valor.filter((x) => x !== p))}
            />
            {PERFIL_LABEL[p]}
          </label>
        )
      })}
    </div>
  )
}
