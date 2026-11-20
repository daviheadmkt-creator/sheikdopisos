import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mensagemErro } from '@/lib/supabase'
import { salvarPerfis, type UsuarioLista } from './api'
import { SeletorPerfis } from './SeletorPerfis'

export function PerfisUsuarioDialog({
  usuario,
  onFechar,
  podeAdmin,
}: {
  usuario: UsuarioLista | null
  onFechar: () => void
  podeAdmin: boolean
}) {
  const qc = useQueryClient()
  const atuais = usuario?.usuario_perfis.map((p) => p.perfil) ?? []
  const [perfis, setPerfis] = useState<string[]>([])

  useEffect(() => {
    if (usuario) setPerfis(usuario.usuario_perfis.map((p) => p.perfil))
  }, [usuario])

  const salvar = useMutation({
    mutationFn: () => salvarPerfis(usuario!.id, atuais, perfis),
    onSuccess: () => {
      toast.success('Perfis atualizados.')
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['vendedores'] })
      qc.invalidateQueries({ queryKey: ['auth'] })
      onFechar()
    },
    onError: (e) => {
      toast.error(mensagemErro(e))
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })

  return (
    <Dialog open={!!usuario} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Perfis de {usuario?.nome}</DialogTitle>
          <DialogDescription>As permissões efetivas são a soma das permissões de todos os perfis marcados.</DialogDescription>
        </DialogHeader>
        <SeletorPerfis valor={perfis} onChange={setPerfis} podeAdmin={podeAdmin} />
        {perfis.length === 0 && <p className="text-sm text-destructive">Selecione ao menos um perfil.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || perfis.length === 0}>
            {salvar.isPending && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
