import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Crown, Loader2, Plus, Save, Send, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { deCentavos } from '@/features/comercial/calculos'
import { ProdutoBusca, QuantidadeInput } from '@/features/estoque/componentes'
import { listarFornecedoresAtivos } from '@/features/fornecedores/api'
import { escalar } from '@/features/produtos/regras'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarMoeda } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { cancelarCotacao, finalizarCotacao, obterCotacao, salvarCotacao, type Solicitacao } from './api'
import { valoresItemCompra } from './calculos'
import { STATUS_COTACAO } from './tipos'

interface ItemCot {
  key: string
  produto_id: string
  sku: string
  descricao: string
  unidade: string
  eh_revestimento: boolean
  m2_por_caixa: number | null
  quantidade: string
  solicitacao_id: string
  vencedor: string
}
interface FornCot {
  fornecedor_id: string
  nome: string
  prazo: string
  frete: string
  condicao: string
  precos: Record<string, string>
}

const chave = () => crypto.randomUUID()

export function CotacaoPage() {
  const { id } = useParams()
  const nova = !id
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { pode } = useAuth()

  const cot = useQuery({ queryKey: ['compras', 'cotacao', id], queryFn: () => obterCotacao(id!), enabled: !nova })
  const fornecedoresAtivos = useQuery({ queryKey: ['fornecedores', 'ativos'], queryFn: listarFornecedoresAtivos })

  const [descricao, setDescricao] = useState(`Cotação ${new Date().toLocaleDateString('pt-BR')}`)
  const [prazoResposta, setPrazoResposta] = useState(dataLocalISO(new Date(), 3))
  const [itens, setItens] = useState<ItemCot[]>([])
  const [forns, setForns] = useState<FornCot[]>([])
  const [novoForn, setNovoForn] = useState('')
  const criada = useRef<string | null>(null)

  useEffect(() => {
    const sol = (location.state as { solicitacoes?: Solicitacao[] } | null)?.solicitacoes
    if (nova && sol?.length)
      setItens(sol.map((s) => ({ key: chave(), produto_id: s.produto_id, sku: s.sku, descricao: s.produto_descricao, unidade: s.unidade, eh_revestimento: s.eh_revestimento, m2_por_caixa: s.m2_por_caixa, quantidade: paraCanonico(s.quantidade, 4), solicitacao_id: s.id, vencedor: '' })))
  }, [nova, location.state])

  useEffect(() => {
    const c = cot.data
    if (!c) return
    setDescricao(c.descricao)
    setPrazoResposta(c.prazo_resposta ?? '')
    const mapa = new Map<string, string>()
    const its = c.compras_cotacao_itens.map((i) => {
      const k = chave()
      mapa.set(i.id, k)
      return { key: k, produto_id: i.produto_id, sku: i.produto?.sku ?? '', descricao: i.produto?.descricao ?? '', unidade: i.produto?.unidade ?? '', eh_revestimento: i.produto?.eh_revestimento ?? false, m2_por_caixa: i.produto?.m2_por_caixa ?? null, quantidade: paraCanonico(i.quantidade, 4), solicitacao_id: i.solicitacao_id ?? '', vencedor: i.fornecedor_vencedor_id ?? '' }
    })
    setItens(its)
    setForns(
      c.compras_cotacao_fornecedores.map((f) => ({
        fornecedor_id: f.fornecedor_id,
        nome: f.fornecedor?.nome_fantasia || f.fornecedor?.razao_social || '',
        prazo: f.prazo_entrega_dias !== null ? String(f.prazo_entrega_dias) : '',
        frete: Number(f.frete) ? paraCanonico(f.frete, 2) : '',
        condicao: f.condicao_pagamento ?? '',
        precos: Object.fromEntries(f.compras_cotacao_precos.map((p) => [mapa.get(p.cotacao_item_id) ?? '', paraCanonico(p.custo_unitario, 4)])),
      })),
    )
  }, [cot.data])

  const status = cot.data?.status ?? 'aberta'
  const editavel = (nova ? pode('compras', 'criar') : pode('compras', 'editar')) && status === 'aberta'

  const menorPreco = useMemo(() => {
    const m: Record<string, string> = {}
    for (const it of itens) {
      let melhor: { f: string; v: bigint } | null = null
      for (const f of forns) {
        const p = f.precos[it.key]
        if (!p) continue
        const v = escalar(p, 4)
        if (!melhor || v < melhor.v) melhor = { f: f.fornecedor_id, v }
      }
      if (melhor) m[it.key] = melhor.f
    }
    return m
  }, [itens, forns])

  const totalForn = (f: FornCot) => {
    let total = 0n
    let cotados = 0
    for (const it of itens) {
      const p = f.precos[it.key]
      if (!p) continue
      cotados++
      total += valoresItemCompra(it.quantidade, p, '0').total
    }
    return { total: total + escalar(f.frete || '0', 2), cotados }
  }

  const payload = () => {
    const ordem = new Map(itens.map((it, i) => [it.key, i + 1]))
    return [
      { id: id ?? '', descricao, prazo_resposta: prazoResposta },
      itens.map((it) => ({ produto_id: it.produto_id, quantidade: it.quantidade, solicitacao_id: it.solicitacao_id, fornecedor_vencedor_id: it.vencedor })),
      forns.map((f) => ({
        fornecedor_id: f.fornecedor_id,
        prazo_entrega_dias: f.prazo,
        frete: f.frete || '0',
        condicao_pagamento: f.condicao,
        precos: Object.fromEntries(Object.entries(f.precos).filter(([k, v]) => v && ordem.has(k)).map(([k, v]) => [String(ordem.get(k)), v])),
      })),
    ] as const
  }

  const validar = () => {
    if (descricao.trim().length < 3) return 'Informe a descrição.'
    if (!itens.length) return 'Inclua ao menos um item.'
    if (itens.some((i) => !i.quantidade || escalar(i.quantidade, 4) <= 0n)) return 'Informe a quantidade de todos os itens.'
    return null
  }

  const salvar = useMutation({
    mutationFn: () => salvarCotacao(...payload()),
    onSuccess: (cid) => {
      toast.success('Cotação salva.')
      qc.invalidateQueries({ queryKey: ['compras'] })
      if (nova) navigate(`/compras/cotacoes/${cid}`, { replace: true })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const finalizar = useMutation({
    mutationFn: async () => {
      const cid = await salvarCotacao(...payload())
      criada.current = cid
      return finalizarCotacao(cid)
    },
    onSuccess: (n) => {
      toast.success(`${n} pedido(s) de compra gerado(s) em rascunho.`)
      qc.invalidateQueries({ queryKey: ['compras'] })
      navigate('/compras?aba=pedidos')
    },
    onError: (e) => {
      toast.error(mensagemErro(e))
      // cotação já gravada: evita duplicar numa nova tentativa
      if (nova && criada.current) navigate(`/compras/cotacoes/${criada.current}`, { replace: true })
    },
  })
  const cancelar = useMutation({
    mutationFn: () => cancelarCotacao(id!),
    onSuccess: () => { toast.success('Cotação cancelada.'); qc.invalidateQueries({ queryKey: ['compras'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  if (!nova && cot.isLoading) return <Carregando />
  if (!nova && cot.error) return <ErroCarregamento mensagem={mensagemErro(cot.error)} />

  const disponiveis = (fornecedoresAtivos.data ?? []).filter((f) => !forns.some((x) => x.fornecedor_id === f.id))
  const atualizarForn = (fid: string, p: Partial<FornCot>) => setForns((l) => l.map((f) => (f.fornecedor_id === fid ? { ...f, ...p } : f)))

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild><Link to="/compras?aba=cotacoes" aria-label="Voltar"><ArrowLeft /></Link></Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {nova ? 'Nova cotação' : `Cotação #${cot.data?.numero}`}
              {cot.data && <Badge variant={STATUS_COTACAO[status].variant}>{STATUS_COTACAO[status].label}</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">Compare preços e escolha o vencedor de cada item. Ao finalizar, um pedido é gerado por fornecedor vencedor.</p>
          </div>
        </div>
        {editavel && (
          <div className="flex flex-wrap gap-2">
            {!nova && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => cancelar.mutate()}><Ban /> Cancelar</Button>}
            <Button variant="outline" onClick={() => { const e = validar(); if (e) return toast.error(e); salvar.mutate() }} disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
            <Button
              onClick={() => {
                const e = validar()
                if (e) return toast.error(e)
                if (itens.some((i) => !i.vencedor)) return toast.error('Defina o fornecedor vencedor de todos os itens.')
                finalizar.mutate()
              }}
              disabled={finalizar.isPending}
            >
              {finalizar.isPending ? <Loader2 className="animate-spin" /> : <Send />} Finalizar e gerar pedidos
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-[1fr_200px]">
            <Field label="Descrição" obrigatorio><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!editavel} /></Field>
            <Field label="Prazo de resposta"><Input type="date" value={prazoResposta} onChange={(e) => setPrazoResposta(e.target.value)} disabled={!editavel} /></Field>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Itens a cotar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {itens.map((it, n) => (
                <div key={it.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_220px_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-medium">{n + 1}. {it.descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">{it.sku}</p>
                  </div>
                  <fieldset disabled={!editavel}>
                    <QuantidadeInput valor={it.quantidade} onChange={(q) => setItens((l) => l.map((x) => (x.key === it.key ? { ...x, quantidade: q } : x)))} unidade={it.unidade} m2PorCaixa={it.eh_revestimento ? it.m2_por_caixa : null} />
                  </fieldset>
                  {editavel && (
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setItens((l) => l.filter((x) => x.key !== it.key))} aria-label="Remover item"><Trash2 /></Button>
                  )}
                </div>
              ))}
              {editavel && (
                <ProdutoBusca valor={null} onSelecionar={(p) => p && setItens((l) => [...l, { key: chave(), produto_id: p.id, sku: p.sku, descricao: p.descricao, unidade: p.unidade, eh_revestimento: p.eh_revestimento, m2_por_caixa: p.m2_por_caixa, quantidade: '', solicitacao_id: '', vencedor: '' }])} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Fornecedores consultados</CardTitle><CardDescription>Prazo, frete e condição informados por cada fornecedor.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {forns.map((f) => {
                const t = totalForn(f)
                return (
                  <div key={f.fornecedor_id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">{f.nome}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums">{formatarMoeda(deCentavos(t.total))} <span className="text-xs text-muted-foreground">({t.cotados}/{itens.length} itens)</span></span>
                        {editavel && <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setForns((l) => l.filter((x) => x.fornecedor_id !== f.fornecedor_id))} aria-label="Remover fornecedor"><Trash2 /></Button>}
                      </div>
                    </div>
                    <fieldset disabled={!editavel} className="grid gap-2 sm:grid-cols-3">
                      <Input placeholder="Prazo (dias)" inputMode="numeric" value={f.prazo} onChange={(e) => atualizarForn(f.fornecedor_id, { prazo: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                      <DecimalInput value={f.frete} onChange={(v) => atualizarForn(f.fornecedor_id, { frete: v })} casas={2} prefixo="R$" aria-label="Frete" />
                      <Input placeholder="Condição de pagamento" value={f.condicao} onChange={(e) => atualizarForn(f.fornecedor_id, { condicao: e.target.value })} />
                    </fieldset>
                  </div>
                )
              })}
              {editavel && (
                <div className="flex gap-2">
                  <NativeSelect value={novoForn} onChange={(e) => setNovoForn(e.target.value)}>
                    <option value="">{disponiveis.length ? 'Adicionar fornecedor…' : 'Nenhum outro fornecedor ativo'}</option>
                    {disponiveis.map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>)}
                  </NativeSelect>
                  <Button
                    variant="outline"
                    disabled={!novoForn}
                    onClick={() => {
                      const f = disponiveis.find((x) => x.id === novoForn)
                      if (f) setForns((l) => [...l, { fornecedor_id: f.id, nome: f.nome_fantasia || f.razao_social, prazo: f.prazo_entrega_dias !== null ? String(f.prazo_entrega_dias) : '', frete: '', condicao: f.condicoes_pagamento ?? '', precos: {} }])
                      setNovoForn('')
                    }}
                  >
                    <Plus /> Adicionar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Mapa de preços</CardTitle>
              <CardDescription>Custo unitário por fornecedor. <Crown className="inline h-3.5 w-3.5 text-primary" /> indica o menor preço.</CardDescription>
            </div>
            {editavel && forns.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setItens((l) => l.map((i) => ({ ...i, vencedor: menorPreco[i.key] ?? i.vencedor })))}>
                <Trophy /> Escolher menores preços
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!itens.length || !forns.length ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Inclua itens e fornecedores para preencher o mapa.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Item</th>
                      {forns.map((f) => <th key={f.fornecedor_id} className="px-2 py-2 text-center">{f.nome}</th>)}
                      <th className="px-2 py-2">Vencedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it) => (
                      <tr key={it.key} className="border-b">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{it.descricao}</p>
                          <p className="text-xs text-muted-foreground">{it.quantidade ? `${it.quantidade.replace('.', ',')} ${it.unidade}` : '—'}</p>
                        </td>
                        {forns.map((f) => {
                          const melhor = menorPreco[it.key] === f.fornecedor_id
                          const venc = it.vencedor === f.fornecedor_id
                          return (
                            <td key={f.fornecedor_id} className={cn('px-2 py-2', venc && 'bg-success/10')}>
                              <div className="flex items-center gap-1">
                                <DecimalInput
                                  value={f.precos[it.key] ?? ''}
                                  onChange={(v) => atualizarForn(f.fornecedor_id, { precos: { ...f.precos, [it.key]: v } })}
                                  casas={4}
                                  disabled={!editavel}
                                  className="h-9 min-w-[110px]"
                                />
                                {melhor && <Crown className="h-4 w-4 shrink-0 text-primary" />}
                              </div>
                            </td>
                          )
                        })}
                        <td className="px-2 py-2">
                          <NativeSelect value={it.vencedor} onChange={(e) => setItens((l) => l.map((x) => (x.key === it.key ? { ...x, vencedor: e.target.value } : x)))} disabled={!editavel} className="h-9 min-w-[150px]">
                            <option value="">—</option>
                            {forns.filter((f) => f.precos[it.key]).map((f) => <option key={f.fornecedor_id} value={f.fornecedor_id}>{f.nome}</option>)}
                          </NativeSelect>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
