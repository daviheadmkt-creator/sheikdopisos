import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { DecimalInput } from '@/components/common/Field'
import { Input } from '@/components/ui/input'
import { listarProdutos, listarUnidades, type ProdutoLista } from '@/features/produtos/api'
import { formatarCanonico, paraCanonico } from '@/lib/decimal'
import { formatarNumero } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { caixasParaQuantidade, descreverCaixas, quantidadeEmCaixas } from './regras'

/** Casas decimais por unidade (M2 = 4, CX = 0 …). */
export function useCasasUnidade() {
  const q = useQuery({ queryKey: ['unidades'], queryFn: listarUnidades, staleTime: Infinity })
  return (unidade?: string | null) => q.data?.find((u) => u.codigo === unidade)?.casas_decimais ?? 2
}

/** Quantidade de estoque formatada com a unidade e, para revestimentos, o equivalente em caixas. */
export function Qtd({
  valor,
  unidade,
  m2PorCaixa,
  className,
}: {
  valor: number | null | undefined
  unidade: string
  m2PorCaixa?: number | null
  className?: string
}) {
  const casas = useCasasUnidade()(unidade)
  const cx = m2PorCaixa ? descreverCaixas(valor ?? 0, m2PorCaixa) : ''
  return (
    <span className={cn('tabular-nums', className)}>
      {formatarNumero(valor ?? 0, casas)} <span className="text-xs text-muted-foreground">{unidade}</span>
      {cx && valor ? <span className="block text-xs text-muted-foreground">{cx}</span> : null}
    </span>
  )
}

/** Busca de produto com lista suspensa. */
export function ProdutoBusca({
  valor,
  onSelecionar,
  disabled,
}: {
  valor: ProdutoLista | null
  onSelecionar: (p: ProdutoLista | null) => void
  disabled?: boolean
}) {
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const t = useDebounce(termo, 300)
  const ref = useRef<HTMLDivElement>(null)

  const q = useQuery({
    queryKey: ['produtos', 'busca-rapida', t],
    queryFn: () => listarProdutos({ busca: t, categoria: '', status: 'ativo', pagina: 1, porPagina: 8 }),
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
          <p className="truncate font-medium">{valor.descricao}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {valor.sku} · {valor.unidade}
            {valor.m2_por_caixa ? ` · ${formatarNumero(valor.m2_por_caixa, 4)} m²/cx` : ''}
          </p>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onSelecionar(null)} className="rounded p-1 hover:bg-background" aria-label="Trocar produto">
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
        placeholder="Digite descrição, SKU ou código de barras"
        className="pl-9"
        aria-label="Buscar produto"
      />
      {aberto && t.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {q.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </div>
          ) : !q.data?.linhas.length ? (
            <p className="p-3 text-sm text-muted-foreground">Nenhum produto ativo encontrado.</p>
          ) : (
            q.data.linhas.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelecionar(p)
                  setTermo('')
                  setAberto(false)
                }}
              >
                <span className="block font-medium">{p.descricao}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.sku} · {p.unidade}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Entrada de quantidade. Para revestimentos, permite digitar em caixas (conversão exata para m²).
 */
export function QuantidadeInput({
  valor,
  onChange,
  unidade,
  m2PorCaixa,
  invalido,
}: {
  valor: string
  onChange: (v: string) => void
  unidade: string
  m2PorCaixa?: number | null
  invalido?: boolean
}) {
  const casas = useCasasUnidade()(unidade)
  const m2 = m2PorCaixa ? paraCanonico(m2PorCaixa, 4) : ''
  const decomp = m2 && valor ? quantidadeEmCaixas(valor, m2) : null
  const [caixas, setCaixas] = useState('')

  // mantém o campo "caixas" coerente quando o valor muda por fora
  useEffect(() => {
    if (!m2) return
    if (!valor) setCaixas('')
    else if (decomp?.exato) setCaixas(decomp.caixas.toString())
  }, [valor, m2]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('grid gap-2', m2 && 'sm:grid-cols-2')}>
      {m2 && (
        <div className="relative">
          <Input
            inputMode="numeric"
            value={caixas}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '')
              setCaixas(v)
              onChange(caixasParaQuantidade(v, m2))
            }}
            placeholder="0"
            className="pr-10 text-right tabular-nums"
            aria-label="Quantidade em caixas"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cx</span>
        </div>
      )}
      <div className="relative">
        <DecimalInput
          value={valor}
          onChange={(v) => {
            onChange(v)
            if (m2) setCaixas('')
          }}
          casas={casas}
          className="pr-12"
          aria-invalid={invalido}
          aria-label={`Quantidade em ${unidade}`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unidade}</span>
      </div>
      {m2 && valor && decomp && !decomp.exato && (
        <p className="text-xs text-amber-700 sm:col-span-2">
          Não corresponde a caixas fechadas: {decomp.caixas.toString()} cx + {formatarCanonico(decomp.resto, 4)} m².
        </p>
      )}
    </div>
  )
}
