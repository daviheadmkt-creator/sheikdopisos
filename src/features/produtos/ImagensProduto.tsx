import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { definirImagemPrincipal, enviarImagem, removerImagem, urlImagem, type ProdutoImagem } from './api'

export function ImagensProduto({
  produtoId,
  imagens,
  podeEditar,
}: {
  produtoId: string
  imagens: ProdutoImagem[]
  podeEditar: boolean
}) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const ordenadas = [...imagens].sort((a, b) => Number(b.principal) - Number(a.principal) || a.ordem - b.ordem)
  const atualizar = () => qc.invalidateQueries({ queryKey: ['produtos'] })

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return
    setEnviando(true)
    let ordem = imagens.reduce((m, i) => Math.max(m, i.ordem), 0)
    let temPrincipal = imagens.some((i) => i.principal)
    let ok = 0
    for (const arq of Array.from(arquivos)) {
      try {
        ordem += 1
        await enviarImagem(produtoId, arq, ordem, !temPrincipal)
        temPrincipal = true
        ok++
      } catch (e) {
        toast.error(`${arq.name}: ${mensagemErro(e)}`)
      }
    }
    setEnviando(false)
    if (input.current) input.current.value = ''
    if (ok) toast.success(ok === 1 ? 'Imagem adicionada.' : `${ok} imagens adicionadas.`)
    atualizar()
  }

  const remover = useMutation({
    mutationFn: removerImagem,
    onSuccess: () => {
      toast.success('Imagem removida.')
      atualizar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const principal = useMutation({
    mutationFn: definirImagemPrincipal,
    onSuccess: atualizar,
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {ordenadas.map((img) => (
          <div
            key={img.id}
            className={cn('group relative aspect-square overflow-hidden rounded-lg border bg-background', img.principal && 'ring-2 ring-primary')}
          >
            <img src={urlImagem(img.storage_path)} alt="Imagem do produto" className="h-full w-full object-cover" />
            {podeEditar && (
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/60 p-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                {!img.principal && (
                  <button
                    type="button"
                    className="rounded p-1 text-primary hover:bg-white/10"
                    onClick={() => principal.mutate(img)}
                    title="Definir como principal"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="rounded p-1 text-white hover:bg-white/10"
                  onClick={() => remover.mutate(img)}
                  title="Remover imagem"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!imagens.length && <p className="text-sm text-muted-foreground">Nenhuma imagem cadastrada.</p>}
      {podeEditar && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void enviar(e.target.files)}
          />
          <Button type="button" variant="outline" className="w-full" onClick={() => input.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            Adicionar imagens
          </Button>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP, até 5 MB cada.</p>
        </>
      )}
    </div>
  )
}
