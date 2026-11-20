import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Package, Ruler, Trash2 } from 'lucide-react'
import { DecimalInput, Field } from '@/components/common/Field'
import { Badge } from '@/components/ui/badge'
import { Input, NativeSelect } from '@/components/ui/input'
import { listarSaldosDoProduto } from '@/features/estoque/api'
import { ProdutoBusca, QuantidadeInput } from '@/features/estoque/componentes'
import type { ProdutoLista } from '@/features/produtos/api'
import { escalar } from '@/features/produtos/regras'
import { formatarCanonico, paraCanonico } from '@/lib/decimal'
import { formatarMoeda, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'
import { calcularValoresItem, deCentavos, quantidadeEfetiva } from './calculos'
import { itemParaCalculo, type ItemForm } from './tipos'

export function novoItem(p: ProdutoLista, sobraPadrao: string): ItemForm {
  return {
    produto_id: p.id,
    sku: p.sku,
    descricao: p.descricao,
    unidade: p.unidade,
    eh_revestimento: p.eh_revestimento,
    m2_por_caixa: p.eh_revestimento ? paraCanonico(p.m2_por_caixa, 4) : '',
    modo: p.eh_revestimento && p.m2_por_caixa ? 'area' : 'quantidade',
    area_m2: '',
    perc_sobra: sobraPadrao,
    quantidade: '',
    preco_unitario: paraCanonico(p.preco_venda, 2),
    desconto_perc: '',
    saldo_id: '',
    lote_id: '',
    deposito_id: '',
    localizacao_id: '',
    observacao: '',
  }
}

/** Valida itens antes de salvar; retorna mensagem de erro ou null. */
export function validarItens(itens: ItemForm[], comEstoque: boolean): string | null {
  if (!itens.length) return 'Inclua ao menos um item.'
  for (const [n, i] of itens.entries()) {
    const q = quantidadeEfetiva(itemParaCalculo(i)).quantidade
    if (!q || escalar(q, 4) <= 0n) return `Item ${n + 1} (${i.descricao}): informe a ${i.modo === 'area' ? 'área' : 'quantidade'}.`
    if (!i.preco_unitario) return `Item ${n + 1} (${i.descricao}): informe o preço.`
    if (i.desconto_perc && escalar(i.desconto_perc, 2) > 10000n) return `Item ${n + 1}: desconto acima de 100%.`
    if (comEstoque && i.eh_revestimento && !i.lote_id) return `Item ${n + 1} (${i.descricao}): selecione o lote.`
  }
  return null
}

interface Props {
  itens: ItemForm[]
  onChange: (itens: ItemForm[]) => void
  comEstoque?: boolean
  editavel?: boolean
  sobraPadrao: string
  descontoLimite: number
}

export function ItensEditor({ itens, onChange, comEstoque = false, editavel = true, sobraPadrao, descontoLimite }: Props) {
  const atualizar = (idx: number, parcial: Partial<ItemForm>) => onChange(itens.map((it, i) => (i === idx ? { ...it, ...parcial } : it)))
  const remover = (idx: number) => onChange(itens.filter((_, i) => i !== idx))

  return (
    <div className="space-y-3">
      {itens.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Package className="h-6 w-6 text-primary" />
          Nenhum item. Busque um produto abaixo para adicionar.
        </div>
      )}
      {itens.map((item, idx) => (
        <ItemCard
          key={`${item.produto_id}-${idx}`}
          indice={idx}
          item={item}
          onChange={(p) => atualizar(idx, p)}
          onRemover={() => remover(idx)}
          comEstoque={comEstoque}
          editavel={editavel}
          descontoLimite={descontoLimite}
        />
      ))}
      {editavel && (
        <div className="rounded-xl border bg-background/50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Adicionar produto</p>
          <ProdutoBusca valor={null} onSelecionar={(p) => p && onChange([...itens, novoItem(p, sobraPadrao)])} />
        </div>
      )}
    </div>
  )
}

function ItemCard({
  indice,
  item,
  onChange,
  onRemover,
  comEstoque,
  editavel,
  descontoLimite,
}: {
  indice: number
  item: ItemForm
  onChange: (p: Partial<ItemForm>) => void
  onRemover: () => void
  comEstoque: boolean
  editavel: boolean
  descontoLimite: number
}) {
  const ef = quantidadeEfetiva(itemParaCalculo(item))
  const valores = calcularValoresItem(ef.quantidade, item.preco_unitario, item.desconto_perc)
  const precisaAprovacao = item.desconto_perc && Number(item.desconto_perc) > descontoLimite
  const m2 = item.eh_revestimento && item.m2_por_caixa ? item.m2_por_caixa : ''

  const saldos = useQuery({
    queryKey: ['estoque', 'saldos-produto', item.produto_id],
    queryFn: () => listarSaldosDoProduto(item.produto_id),
    enabled: comEstoque,
  })
  const opcoes = (saldos.data ?? []).filter((s) => !s.lote_bloqueado && (s.quantidade_disponivel > 0 || s.id === item.saldo_id))
  const saldoSel =
    opcoes.find((s) => s.id === item.saldo_id) ??
    opcoes.find(
      (s) =>
        item.deposito_id &&
        s.deposito_id === item.deposito_id &&
        (s.lote_id ?? '') === item.lote_id &&
        (s.localizacao_id ?? '') === item.localizacao_id,
    )
  const qtdEsc = ef.quantidade ? escalar(ef.quantidade, 4) : 0n
  const atende = saldoSel ? escalar(paraCanonico(saldoSel.quantidade_disponivel, 4), 4) >= qtdEsc : null

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            <span className="mr-2 text-muted-foreground">{indice + 1}.</span>
            {item.descricao}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {item.sku} · {item.unidade}
            {m2 && ` · ${formatarCanonico(m2, 4)} m²/cx`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">{formatarMoeda(deCentavos(valores.total))}</p>
            {valores.desconto > 0n && (
              <p className="text-xs text-muted-foreground line-through">{formatarMoeda(deCentavos(valores.bruto))}</p>
            )}
          </div>
          {editavel && (
            <button type="button" onClick={onRemover} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remover item">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <fieldset disabled={!editavel} className="space-y-3">
        {m2 && (
          <div className="inline-flex rounded-lg bg-secondary p-1 text-xs">
            {(['area', 'quantidade'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ modo: m })}
                className={cn('flex items-center gap-1 rounded-md px-3 py-1.5 font-medium', item.modo === m ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                {m === 'area' ? <><Ruler className="h-3.5 w-3.5" /> Calcular pela área</> : <><Package className="h-3.5 w-3.5" /> Informar quantidade</>}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {m2 && item.modo === 'area' ? (
            <>
              <Field label="Área do cliente (m²)">
                <DecimalInput value={item.area_m2} onChange={(v) => onChange({ area_m2: v })} casas={2} />
              </Field>
              <Field label="Sobra p/ recortes (%)">
                <DecimalInput value={item.perc_sobra} onChange={(v) => onChange({ perc_sobra: v })} casas={2} />
              </Field>
            </>
          ) : (
            <Field label="Quantidade" className="sm:col-span-2">
              <QuantidadeInput
                valor={item.quantidade}
                onChange={(v) => onChange({ quantidade: v })}
                unidade={item.unidade}
                m2PorCaixa={m2 ? Number(m2) : null}
              />
            </Field>
          )}
          <Field label={`Preço por ${item.unidade}`}>
            <DecimalInput value={item.preco_unitario} onChange={(v) => onChange({ preco_unitario: v })} casas={2} prefixo="R$" />
          </Field>
          <Field label="Desconto (%)">
            <DecimalInput value={item.desconto_perc} onChange={(v) => onChange({ desconto_perc: v })} casas={2} />
          </Field>
        </div>

        {m2 && item.modo === 'area' && ef.calc && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-sidebar px-4 py-2.5 text-sm text-zinc-300">
            <span>
              <strong className="text-lg text-primary">{ef.calc.caixas}</strong> caixas
            </span>
            <span>
              <strong className="text-white">{formatarCanonico(ef.calc.m2Coberto, 2)} m²</strong> cobertos
            </span>
            <span>Área + sobra: {formatarCanonico(ef.calc.areaComSobra, 2)} m²</span>
            <span>Excedente: {formatarCanonico(ef.calc.excedente, 2)} m²</span>
          </div>
        )}
        {(!m2 || item.modo === 'quantidade') && ef.quantidade && (
          <p className="text-xs text-muted-foreground">
            {formatarNumero(ef.quantidade, 4)} {item.unidade}
            {ef.caixas !== null && ` ≈ ${ef.caixas} caixa(s)`} × {formatarMoeda(item.preco_unitario || 0)}
          </p>
        )}

        {comEstoque && (
          <Field label={item.eh_revestimento ? 'Lote / tonalidade / local (obrigatório)' : 'Local de estoque'}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <NativeSelect
                value={saldoSel?.id ?? ''}
                onChange={(e) => {
                  const s = opcoes.find((o) => o.id === e.target.value)
                  onChange({ saldo_id: s?.id ?? '', lote_id: s?.lote_id ?? '', deposito_id: s?.deposito_id ?? '', localizacao_id: s?.localizacao_id ?? '' })
                }}
              >
                <option value="">{saldos.isLoading ? 'Carregando estoque…' : opcoes.length ? 'Selecione' : 'Sem estoque disponível'}</option>
                {opcoes.map((s) => {
                  const suficiente = escalar(paraCanonico(s.quantidade_disponivel, 4), 4) >= qtdEsc
                  return (
                    <option key={s.id} value={s.id}>
                      {suficiente && qtdEsc > 0n ? '✓ ' : ''}
                      {[s.lote_codigo && `Lote ${s.lote_codigo}`, s.tonalidade && `Ton. ${s.tonalidade}`, s.calibre && `Cal. ${s.calibre}`, s.deposito_nome, s.localizacao_codigo, `Disp. ${formatarNumero(s.quantidade_disponivel, 4)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </option>
                  )
                })}
              </NativeSelect>
              {atende === true && (
                <Badge variant="success" className="gap-1 self-start sm:self-auto">
                  <CheckCircle2 className="h-3 w-3" /> Lote atende
                </Badge>
              )}
              {atende === false && (
                <Badge variant="danger" className="gap-1 self-start sm:self-auto">
                  <AlertTriangle className="h-3 w-3" /> Insuficiente
                </Badge>
              )}
            </div>
          </Field>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={item.observacao} onChange={(e) => onChange({ observacao: e.target.value })} placeholder="Observação do item (opcional)" className="h-9" />
          {precisaAprovacao && (
            <Badge variant="default" className="shrink-0">
              Desconto acima de {descontoLimite}% — requer aprovação
            </Badge>
          )}
        </div>
      </fieldset>
    </div>
  )
}
