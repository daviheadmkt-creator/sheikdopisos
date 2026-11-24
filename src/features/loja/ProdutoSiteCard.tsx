import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, ExternalLink, Globe, Loader2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarData } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { obterProdutoSite, publicarNoSite, SITUACAO_SITE, tirarDoSite } from './produtosSite'

/** Cartão "Loja virtual" no cadastro do produto: situação no site e botões de publicar/tirar. */
export function ProdutoSiteCard({ produtoId, podeEditar }: { produtoId: string; podeEditar: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['produto-site', produtoId], queryFn: () => obterProdutoSite(produtoId) })
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['produto-site', produtoId] })
    qc.invalidateQueries({ queryKey: ['produtos'] })
  }

  const publicar = useMutation({
    mutationFn: () => publicarNoSite(produtoId),
    onSuccess: (r) => {
      atualizar()
      if (r.resultado?.situacao === 'erro') toast.error(r.resultado.mensagem ?? 'O site não aceitou o produto.')
      else toast.success('Produto enviado ao site.')
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const tirar = useMutation({
    mutationFn: () => tirarDoSite(produtoId),
    onSuccess: () => {
      atualizar()
      toast.success('Produto retirado do site.')
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const ocupado = publicar.isPending || tirar.isPending
  const site = q.data?.site
  const situacao = site ? SITUACAO_SITE[site.situacao] : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" /> Loja virtual
        </CardTitle>
        <CardDescription>
          Com "Vender no site" ligado, o produto entra sozinho no site quando houver estoque. Preço, estoque e categoria são
          atualizados a cada 10 minutos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isLoading ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : q.error ? (
          <p className="text-destructive">{mensagemErro(q.error)}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Vender no site:</span>
              <Badge variant={q.data?.vender_no_site ? 'success' : 'neutral'}>{q.data?.vender_no_site ? 'Sim' : 'Não'}</Badge>
              {situacao && <Badge variant={situacao.variant}>{situacao.label}</Badge>}
            </div>
            {site && (
              <div className="space-y-1 text-muted-foreground">
                {site.estoque_enviado !== null && <p>Estoque no site: {site.estoque_enviado}</p>}
                <p>Última sincronização: {formatarData(site.sincronizado_em, true)}</p>
                {site.mensagem && <p className={site.situacao === 'erro' ? 'text-destructive' : ''}>{site.mensagem}</p>}
                {site.url && site.situacao === 'publicado' && (
                  <a href={site.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                    Ver no site <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
            {podeEditar && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" disabled={ocupado} onClick={() => publicar.mutate()}>
                  {publicar.isPending ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                  {site?.situacao === 'publicado' ? 'Atualizar no site' : 'Adicionar no site'}
                </Button>
                {(q.data?.vender_no_site || site?.situacao === 'publicado') && (
                  <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => tirar.mutate()}>
                    {tirar.isPending ? <Loader2 className="animate-spin" /> : <EyeOff />} Tirar do site
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
