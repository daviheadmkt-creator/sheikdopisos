import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2, Lock, Plus, Search, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { MotivoDialog } from '@/components/common/MotivoDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ProdutoLista } from '@/features/produtos/api'
import { formatarData } from '@/lib/format'
import { useDebounce } from '@/lib/hooks'
import { mensagemErro } from '@/lib/supabase'
import { alterarBloqueioLote, criarLote, listarLotes, type LoteResumo } from './api'
import { ProdutoBusca, Qtd } from './componentes'

const POR_PAGINA = 25

export function LotesPage() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'' | 'com_saldo' | 'bloqueados'>('com_saldo')
  const [pagina, setPagina] = useState(1)
  const [novo, setNovo] = useState(false)
  const [bloqueando, setBloqueando] = useState<LoteResumo | null>(null)
  const b = useDebounce(busca)

  const filtros = { busca: b, situacao, pagina, porPagina: POR_PAGINA }
  const q = useQuery({ queryKey: ['estoque', 'lotes', filtros], queryFn: () => listarLotes(filtros), placeholderData: keepPreviousData })

  const bloqueio = useMutation({
    mutationFn: (a: { lote: LoteResumo; bloquear: boolean; motivo: string }) => alterarBloqueioLote(a.lote.id, a.bloquear, a.motivo),
    onSuccess: (_d, a) => {
      toast.success(a.bloquear ? 'Lote bloqueado para saídas e reservas.' : 'Lote desbloqueado.')
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setBloqueando(null)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <>
      <PageHeader
        titulo="Lotes e Tonalidades"
        descricao="Controle de revestimentos por lote, tonalidade e calibre."
        acoes={
          pode('lotes', 'criar') && (
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo lote
            </Button>
          )
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 p-3 text-sm text-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Lotes diferentes nunca são misturados automaticamente: reservas e saídas são sempre feitas em um único lote.
          Bloqueie um lote para impedir novas reservas e saídas (ex.: divergência de tonalidade, reclamação de qualidade).
        </p>
      </div>

      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              placeholder="Lote, tonalidade, produto ou SKU"
              className="pl-9"
              aria-label="Pesquisar lotes"
            />
          </div>
          <NativeSelect
            value={situacao}
            onChange={(e) => {
              setSituacao(e.target.value as typeof situacao)
              setPagina(1)
            }}
            aria-label="Situação"
          >
            <option value="com_saldo">Com saldo</option>
            <option value="bloqueados">Bloqueados</option>
            <option value="">Todos</option>
          </NativeSelect>
        </div>
        {q.isLoading ? (
          <Carregando />
        ) : q.error ? (
          <ErroCarregamento mensagem={mensagemErro(q.error)} />
        ) : !q.data?.linhas.length ? (
          <Vazio titulo="Nenhum lote encontrado" descricao="Os lotes são criados no cadastro ou na própria entrada de mercadoria." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Tonalidade</TableHead>
                  <TableHead>Calibre</TableHead>
                  <TableHead>Fabricação</TableHead>
                  <TableHead className="text-right">Físico</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="font-medium">{l.produto_descricao}</p>
                      <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                    </TableCell>
                    <TableCell className="font-mono font-semibold">{l.codigo}</TableCell>
                    <TableCell>{l.tonalidade ?? '—'}</TableCell>
                    <TableCell>{l.calibre ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.data_fabricacao ? formatarData(`${l.data_fabricacao}T12:00:00`) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Qtd valor={l.fisico} unidade={l.unidade} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Qtd valor={l.reservado} unidade={l.unidade} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <Qtd valor={l.disponivel} unidade={l.unidade} m2PorCaixa={l.m2_por_caixa} />
                    </TableCell>
                    <TableCell>
                      {l.bloqueado ? (
                        <Badge variant="danger" title={l.motivo_bloqueio ?? ''}>
                          Bloqueado
                        </Badge>
                      ) : (
                        <Badge variant="success">Liberado</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {pode('lotes', 'editar') &&
                        (l.bloqueado ? (
                          <Button variant="ghost" size="sm" onClick={() => bloqueio.mutate({ lote: l, bloquear: false, motivo: '' })}>
                            <Unlock /> Liberar
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setBloqueando(l)}>
                            <Lock /> Bloquear
                          </Button>
                        ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagina={pagina} porPagina={POR_PAGINA} total={q.data.total} onChange={setPagina} />
          </>
        )}
      </Card>

      <NovoLoteDialog aberto={novo} onFechar={() => setNovo(false)} />
      <MotivoDialog
        aberto={!!bloqueando}
        titulo={`Bloquear lote ${bloqueando?.codigo ?? ''}`}
        descricao="Lotes bloqueados não podem receber novas reservas nem saídas avulsas."
        rotuloConfirmar="Bloquear lote"
        destrutivo
        carregando={bloqueio.isPending}
        onConfirmar={(motivo) => bloqueio.mutate({ lote: bloqueando!, bloquear: true, motivo })}
        onFechar={() => setBloqueando(null)}
      />
    </>
  )
}

function NovoLoteDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const [produto, setProduto] = useState<ProdutoLista | null>(null)
  const [dados, setDados] = useState({ codigo: '', tonalidade: '', calibre: '', data_fabricacao: '', observacoes: '' })

  useEffect(() => {
    if (aberto) {
      setProduto(null)
      setDados({ codigo: '', tonalidade: '', calibre: '', data_fabricacao: '', observacoes: '' })
    }
  }, [aberto])

  const salvar = useMutation({
    mutationFn: () => criarLote({ produto_id: produto!.id, ...dados }),
    onSuccess: () => {
      toast.success('Lote cadastrado.')
      qc.invalidateQueries({ queryKey: ['estoque'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const set = (k: keyof typeof dados) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDados({ ...dados, [k]: e.target.value })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lote</DialogTitle>
          <DialogDescription>A combinação produto + lote + tonalidade + calibre é única.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Produto" obrigatorio>
            <ProdutoBusca valor={produto} onSelecionar={setProduto} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Lote" obrigatorio>
              <Input value={dados.codigo} onChange={set('codigo')} className="uppercase" />
            </Field>
            <Field label="Tonalidade">
              <Input value={dados.tonalidade} onChange={set('tonalidade')} className="uppercase" />
            </Field>
            <Field label="Calibre">
              <Input value={dados.calibre} onChange={set('calibre')} className="uppercase" />
            </Field>
          </div>
          <Field label="Data de fabricação">
            <Input type="date" value={dados.data_fabricacao} onChange={set('data_fabricacao')} />
          </Field>
          <Field label="Observações">
            <Textarea rows={2} value={dados.observacoes} onChange={set('observacoes')} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!produto || !dados.codigo.trim() || salvar.isPending}>
            {salvar.isPending && <Loader2 className="animate-spin" />}
            Salvar lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
