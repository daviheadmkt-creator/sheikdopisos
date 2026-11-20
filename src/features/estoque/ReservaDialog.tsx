import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import type { ProdutoLista } from '@/features/produtos/api'
import { escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarNumero } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { listarSaldosDoProduto, reservarEstoque } from './api'
import { ProdutoBusca, QuantidadeInput } from './componentes'

const hojeMais = (dias: number) => dataLocalISO(new Date(), dias)

export function ReservaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const [produto, setProduto] = useState<ProdutoLista | null>(null)
  const [saldoId, setSaldoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [documento, setDocumento] = useState('')
  const [validade, setValidade] = useState(hojeMais(7))
  const [observacoes, setObservacoes] = useState('')
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (aberto) {
      setProduto(null)
      setSaldoId('')
      setQuantidade('')
      setDocumento('')
      setValidade(hojeMais(7))
      setObservacoes('')
      setErro('')
      setChave(crypto.randomUUID())
    }
  }, [aberto])

  const saldos = useQuery({
    queryKey: ['estoque', 'saldos-produto', produto?.id],
    queryFn: () => listarSaldosDoProduto(produto!.id),
    enabled: aberto && !!produto,
  })
  const opcoes = useMemo(
    () => (saldos.data ?? []).filter((s) => s.quantidade_disponivel > 0 && !s.lote_bloqueado),
    [saldos.data],
  )
  const saldo = opcoes.find((s) => s.id === saldoId)

  const salvar = useMutation({
    mutationFn: () =>
      reservarEstoque({
        produto_id: produto!.id,
        lote_id: saldo!.lote_id ?? '',
        deposito_id: saldo!.deposito_id,
        localizacao_id: saldo!.localizacao_id ?? '',
        quantidade,
        documento_id: documento,
        validade,
        observacoes,
        chave_idempotencia: chave,
      }),
    onSuccess: () => {
      toast.success('Reserva registrada. O físico não foi alterado; o disponível foi reduzido.')
      qc.invalidateQueries({ queryKey: ['estoque'] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const confirmar = () => {
    setErro('')
    if (!saldo) return setErro('Selecione o lote/local a reservar.')
    if (!quantidade) return setErro('Informe a quantidade.')
    if (escalar(quantidade, 4) > escalar(paraCanonico(saldo.quantidade_disponivel, 4), 4))
      return setErro(`Quantidade acima do disponível (${formatarNumero(saldo.quantidade_disponivel, 4)}).`)
    salvar.mutate()
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova reserva de estoque</DialogTitle>
          <DialogDescription>
            A reserva é feita em um único lote, sem misturar tonalidades. Ela não reduz o estoque físico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Produto" obrigatorio>
            <ProdutoBusca
              valor={produto}
              onSelecionar={(p) => {
                setProduto(p)
                setSaldoId('')
                setQuantidade('')
              }}
            />
          </Field>
          {produto && (
            <>
              <Field label="Lote e local" obrigatorio>
                <NativeSelect value={saldoId} onChange={(e) => setSaldoId(e.target.value)}>
                  <option value="">{saldos.isLoading ? 'Carregando…' : opcoes.length ? 'Selecione' : 'Sem saldo disponível'}</option>
                  {opcoes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {[
                        s.deposito_nome,
                        s.localizacao_codigo,
                        s.lote_codigo && `Lote ${s.lote_codigo}`,
                        s.tonalidade && `Ton. ${s.tonalidade}`,
                        `Disp. ${formatarNumero(s.quantidade_disponivel, 4)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Quantidade" obrigatorio>
                <QuantidadeInput
                  valor={quantidade}
                  onChange={setQuantidade}
                  unidade={produto.unidade}
                  m2PorCaixa={produto.eh_revestimento ? produto.m2_por_caixa : null}
                />
              </Field>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Referência" ajuda="Ex.: nome do cliente, nº do pedido">
              <Input value={documento} onChange={(e) => setDocumento(e.target.value)} />
            </Field>
            <Field label="Válida até">
              <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} min={hojeMais(0)} />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </Field>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A partir da Fase 3 as reservas serão criadas automaticamente pelos pedidos de venda.
          </p>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvar.isPending || !produto}>
            {salvar.isPending && <Loader2 className="animate-spin" />}
            Reservar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
