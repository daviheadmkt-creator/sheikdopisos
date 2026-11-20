import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Loader2, Search, User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { listarClientes } from '@/features/clientes/api'
import { formatarDocumento, formatarTelefone } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import type { ClienteResumo } from './api'

export function ClienteBusca({
  valor,
  onSelecionar,
  disabled,
}: {
  valor: ClienteResumo | null
  onSelecionar: (c: ClienteResumo | null) => void
  disabled?: boolean
}) {
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const t = useDebounce(termo, 300)
  const ref = useRef<HTMLDivElement>(null)

  const q = useQuery({
    queryKey: ['clientes', 'busca-rapida', t],
    queryFn: () => listarClientes({ busca: t, status: 'ativo', tipo: '', pagina: 1, porPagina: 8 }),
    enabled: aberto && t.trim().length >= 2,
  })

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  if (valor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{valor.nome}</p>
          <p className="text-xs text-muted-foreground">
            {formatarDocumento(valor.documento)} · {formatarTelefone(valor.whatsapp || valor.telefone)}
          </p>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onSelecionar(null)} className="rounded p-1 hover:bg-background" aria-label="Trocar cliente">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={termo}
        disabled={disabled}
        onChange={(e) => {
          setTermo(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        placeholder="Nome, CPF/CNPJ ou telefone do cliente"
        className="pl-9"
        aria-label="Buscar cliente"
      />
      {aberto && t.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {q.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </div>
          ) : !q.data?.linhas.length ? (
            <p className="p-3 text-sm text-muted-foreground">Nenhum cliente ativo encontrado.</p>
          ) : (
            q.data.linhas.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelecionar({
                    id: c.id,
                    nome: c.nome,
                    razao_social: c.razao_social,
                    documento: c.documento,
                    telefone: c.telefone,
                    whatsapp: c.whatsapp,
                    email: c.email,
                  })
                  setTermo('')
                  setAberto(false)
                }}
              >
                {c.tipo_pessoa === 'PJ' ? <Building2 className="h-4 w-4 text-info" /> : <User className="h-4 w-4 text-primary" />}
                <span>
                  <span className="block font-medium">{c.nome}</span>
                  <span className="text-xs text-muted-foreground">{formatarDocumento(c.documento)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
