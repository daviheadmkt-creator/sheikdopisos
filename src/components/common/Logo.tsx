import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Exibe o logotipo oficial sem distorção (object-contain).
 * Usa a cópia reduzida assets/logo-sheik-512.jpg (mesma arte, 83 KB); o original em alta
 * resolução fica preservado em assets/logo-sheik.png.
 */
export function Logo({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  const [falhou, setFalhou] = useState(false)

  if (falhou) {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center leading-none', className)}>
        <span className={cn('font-bold tracking-wide text-primary', compacto ? 'text-sm' : 'text-xl')}>SHEIK</span>
        {!compacto && <span className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-zinc-300">DOS PISOS</span>}
      </div>
    )
  }

  return (
    <img
      src="/logo-sheik-512.jpg"
      alt="SHEIK DOS PISOS"
      onError={() => setFalhou(true)}
      className={cn('rounded-lg object-contain', className)}
      draggable={false}
    />
  )
}
