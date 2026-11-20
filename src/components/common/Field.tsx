import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { digitosParaCanonico, formatarCanonico } from '@/lib/decimal'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  htmlFor?: string
  erro?: string
  obrigatorio?: boolean
  ajuda?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function Field({ label, htmlFor, erro, obrigatorio, ajuda, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {obrigatorio && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {erro ? (
        <p className="text-xs text-destructive" role="alert">
          {erro}
        </p>
      ) : ajuda ? (
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      ) : null}
    </div>
  )
}

interface DecimalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  onChange: (canonico: string) => void
  casas?: number
  prefixo?: string
}

/**
 * Campo numérico com máscara brasileira. O valor é mantido como string canônica
 * ("1234.56") para preservar a precisão até o NUMERIC do banco.
 */
export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, casas = 2, prefixo, className, ...props }, ref) => (
    <div className="relative">
      {prefixo && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {prefixo}
        </span>
      )}
      <Input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        value={formatarCanonico(value, casas)}
        onChange={(e) => onChange(digitosParaCanonico(e.target.value, casas))}
        placeholder={casas > 0 ? `0,${'0'.repeat(casas)}` : '0'}
        className={cn('text-right tabular-nums', prefixo && 'pl-10', className)}
        {...props}
      />
    </div>
  ),
)
DecimalInput.displayName = 'DecimalInput'
