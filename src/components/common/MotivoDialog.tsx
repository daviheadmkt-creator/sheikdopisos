import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'

/** Confirmação que exige justificativa (fica registrada na auditoria). */
export function MotivoDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  destrutivo,
  carregando,
  onConfirmar,
  onFechar,
  children,
}: {
  aberto: boolean
  titulo: string
  descricao?: ReactNode
  rotuloConfirmar: string
  destrutivo?: boolean
  carregando?: boolean
  onConfirmar: (motivo: string) => void
  onFechar: () => void
  children?: ReactNode
}) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    if (aberto) setMotivo('')
  }, [aberto])

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        {children}
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (obrigatório)"
          rows={3}
          autoFocus
          aria-label="Motivo"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button
            variant={destrutivo ? 'destructive' : 'default'}
            disabled={motivo.trim().length < 3 || carregando}
            onClick={() => onConfirmar(motivo.trim())}
          >
            {carregando && <Loader2 className="animate-spin" />}
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
