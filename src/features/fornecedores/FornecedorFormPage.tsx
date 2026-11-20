import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building, History, Loader2, Package, Plus, Save, ShoppingBag, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/common/Field'
import { HistoricoAlteracoes } from '@/components/common/HistoricoAlteracoes'
import { Carregando, ErroCarregamento, StatusBadge, Vazio } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { buscarCep } from '@/features/clientes/api'
import { listarPedidosCompra } from '@/features/compras/api'
import { STATUS_PEDIDO_COMPRA } from '@/features/compras/tipos'
import { ProdutoBusca } from '@/features/estoque/componentes'
import type { ProdutoLista } from '@/features/produtos/api'
import { formatarData, formatarMoeda, formatarNumero, mascararCEP, mascararDocumento, mascararTelefone } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { UFS } from '@/lib/validators/documento'
import { desvincularProduto, listarProdutosDoFornecedor, obterFornecedor, salvarFornecedor, vincularProduto, type FornecedorDB } from './api'
import { contatoVazio, fornecedorParaPayload, fornecedorSchema, fornecedorVazio, type FornecedorForm } from './schema'

function dbParaForm(f: FornecedorDB): FornecedorForm {
  return {
    razao_social: f.razao_social,
    nome_fantasia: f.nome_fantasia ?? '',
    cnpj: f.cnpj ? mascararDocumento(f.cnpj, 'PJ') : '',
    inscricao_estadual: f.inscricao_estadual ?? '',
    telefone: mascararTelefone(f.telefone ?? ''),
    whatsapp: mascararTelefone(f.whatsapp ?? ''),
    email: f.email ?? '',
    cep: mascararCEP(f.cep ?? ''),
    logradouro: f.logradouro ?? '',
    numero: f.numero ?? '',
    complemento: f.complemento ?? '',
    bairro: f.bairro ?? '',
    cidade: f.cidade ?? '',
    uf: f.uf ?? '',
    condicoes_pagamento: f.condicoes_pagamento ?? '',
    prazo_entrega_dias: f.prazo_entrega_dias !== null ? String(f.prazo_entrega_dias) : '',
    observacoes: f.observacoes ?? '',
    status: f.status as FornecedorForm['status'],
    contatos: [...f.fornecedor_contatos]
      .sort((a, b) => Number(b.principal) - Number(a.principal))
      .map((c) => ({
        nome: c.nome,
        cargo: c.cargo ?? '',
        telefone: mascararTelefone(c.telefone ?? ''),
        whatsapp: mascararTelefone(c.whatsapp ?? ''),
        email: c.email ?? '',
        principal: c.principal,
      })),
  }
}

export function FornecedorFormPage() {
  const { id } = useParams()
  const novo = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode } = useAuth()
  const podeSalvar = novo ? pode('fornecedores', 'criar') : pode('fornecedores', 'editar')

  const forn = useQuery({ queryKey: ['fornecedores', id], queryFn: () => obterFornecedor(id!), enabled: !novo })
  const form = useForm<FornecedorForm>({ resolver: zodResolver(fornecedorSchema), defaultValues: fornecedorVazio })
  const { register, control, reset, handleSubmit, formState, setValue, getValues, watch } = form
  const contatos = useFieldArray({ control, name: 'contatos' })
  const erros = formState.errors
  const [buscandoCep, setBuscandoCep] = useState(false)

  useEffect(() => {
    if (forn.data) reset(dbParaForm(forn.data))
  }, [forn.data, reset])

  const salvar = useMutation({
    mutationFn: (v: FornecedorForm) => salvarFornecedor(fornecedorParaPayload(v, id)),
    onSuccess: (novoId) => {
      toast.success(novo ? 'Fornecedor cadastrado.' : 'Alterações salvas.')
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      qc.invalidateQueries({ queryKey: ['auditoria'] })
      if (novo) navigate(`/fornecedores/${novoId}`, { replace: true })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const consultarCep = async () => {
    setBuscandoCep(true)
    const r = await buscarCep(getValues('cep'))
    setBuscandoCep(false)
    if (!r) return toast.warning('CEP não encontrado.')
    const o = { shouldDirty: true, shouldValidate: true }
    if (r.logradouro) setValue('logradouro', r.logradouro, o)
    if (r.bairro) setValue('bairro', r.bairro, o)
    setValue('cidade', r.cidade, o)
    setValue('uf', r.uf, o)
  }

  if (!novo && forn.isLoading) return <Carregando />
  if (!novo && forn.error) return <ErroCarregamento mensagem={mensagemErro(forn.error)} />
  const f = forn.data

  const tel = (nome: `contatos.${number}.telefone` | `contatos.${number}.whatsapp` | 'telefone' | 'whatsapp') => (
    <Controller
      control={control}
      name={nome}
      render={({ field }) => <Input inputMode="tel" {...field} onChange={(e) => field.onChange(mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" />}
    />
  )

  return (
    <form onSubmit={handleSubmit((v) => salvar.mutate(v))} noValidate>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" asChild>
            <Link to="/fornecedores" aria-label="Voltar">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {novo ? 'Novo fornecedor' : f?.nome_fantasia || f?.razao_social}
              {f && <StatusBadge status={f.status} />}
            </h1>
            {f && <p className="text-sm text-muted-foreground">Código {f.codigo} · atualizado em {formatarData(f.updated_at, true)}</p>}
          </div>
        </div>
        {podeSalvar && (
          <Button type="submit" disabled={salvar.isPending || (!novo && !formState.isDirty)}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        )}
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados"><Building /> Dados</TabsTrigger>
          <TabsTrigger value="produtos" disabled={novo}><Package /> Produtos fornecidos</TabsTrigger>
          <TabsTrigger value="compras" disabled={novo}><ShoppingBag /> Histórico de compras</TabsTrigger>
          <TabsTrigger value="alteracoes" disabled={novo}><History /> Alterações</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <fieldset disabled={!podeSalvar} className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Card>
                <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="Razão social" obrigatorio erro={erros.razao_social?.message} className="sm:col-span-2">
                    <Input {...register('razao_social')} aria-invalid={!!erros.razao_social} />
                  </Field>
                  <Field label="Nome fantasia">
                    <Input {...register('nome_fantasia')} />
                  </Field>
                  <Field label="CNPJ" erro={erros.cnpj?.message} ajuda="Numérico ou alfanumérico">
                    <Controller
                      control={control}
                      name="cnpj"
                      render={({ field }) => <Input {...field} onChange={(e) => field.onChange(mascararDocumento(e.target.value, 'PJ'))} aria-invalid={!!erros.cnpj} />}
                    />
                  </Field>
                  <Field label="Inscrição estadual">
                    <Input {...register('inscricao_estadual')} />
                  </Field>
                  <Field label="E-mail" erro={erros.email?.message}>
                    <Input type="email" {...register('email')} />
                  </Field>
                  <Field label="Telefone" erro={erros.telefone?.message}>{tel('telefone')}</Field>
                  <Field label="WhatsApp" erro={erros.whatsapp?.message}>{tel('whatsapp')}</Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Contatos</CardTitle>
                    <CardDescription>Vendedores, representantes e financeiro do fornecedor.</CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => contatos.append(contatoVazio(contatos.fields.length === 0))}>
                    <Plus /> Contato
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {erros.contatos?.message && <p className="text-sm text-destructive">{erros.contatos.message}</p>}
                  {!contatos.fields.length && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum contato.</p>}
                  {contatos.fields.map((c, i) => {
                    const principal = watch(`contatos.${i}.principal`)
                    return (
                      <div key={c.id} className="rounded-xl border bg-background/50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            Contato {i + 1} {principal && <Badge>Principal</Badge>}
                          </span>
                          <div className="flex gap-1">
                            {!principal && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => contatos.fields.forEach((_, j) => setValue(`contatos.${j}.principal`, j === i, { shouldDirty: true }))}>
                                <Star /> Principal
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => contatos.remove(i)}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-5">
                          <Field label="Nome" obrigatorio erro={erros.contatos?.[i]?.nome?.message} className="sm:col-span-2">
                            <Input {...register(`contatos.${i}.nome`)} />
                          </Field>
                          <Field label="Cargo" className="sm:col-span-1"><Input {...register(`contatos.${i}.cargo`)} /></Field>
                          <Field label="WhatsApp" erro={erros.contatos?.[i]?.whatsapp?.message} className="sm:col-span-2">{tel(`contatos.${i}.whatsapp`)}</Field>
                          <Field label="Telefone" erro={erros.contatos?.[i]?.telefone?.message} className="sm:col-span-2">{tel(`contatos.${i}.telefone`)}</Field>
                          <Field label="E-mail" erro={erros.contatos?.[i]?.email?.message} className="sm:col-span-3"><Input type="email" {...register(`contatos.${i}.email`)} /></Field>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Endereço</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-6">
                  <Field label="CEP" erro={erros.cep?.message} className="sm:col-span-2">
                    <Controller
                      control={control}
                      name="cep"
                      render={({ field }) => (
                        <div className="flex gap-2">
                          <Input {...field} inputMode="numeric" onChange={(e) => field.onChange(mascararCEP(e.target.value))} />
                          <Button type="button" variant="outline" onClick={() => void consultarCep()} disabled={buscandoCep}>
                            {buscandoCep ? <Loader2 className="animate-spin" /> : 'Buscar'}
                          </Button>
                        </div>
                      )}
                    />
                  </Field>
                  <Field label="Logradouro" className="sm:col-span-4"><Input {...register('logradouro')} /></Field>
                  <Field label="Número" className="sm:col-span-1"><Input {...register('numero')} /></Field>
                  <Field label="Complemento" className="sm:col-span-2"><Input {...register('complemento')} /></Field>
                  <Field label="Bairro" className="sm:col-span-3"><Input {...register('bairro')} /></Field>
                  <Field label="Cidade" className="sm:col-span-4"><Input {...register('cidade')} /></Field>
                  <Field label="UF" erro={erros.uf?.message} className="sm:col-span-2">
                    <NativeSelect {...register('uf')}>
                      <option value="">—</option>
                      {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </NativeSelect>
                  </Field>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Condições comerciais</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Status">
                    <NativeSelect {...register('status')}>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Condições de pagamento" ajuda="Ex.: 30/60/90 dias, boleto">
                    <Textarea rows={2} {...register('condicoes_pagamento')} />
                  </Field>
                  <Field label="Prazo médio de entrega (dias)" erro={erros.prazo_entrega_dias?.message}>
                    <Input inputMode="numeric" {...register('prazo_entrega_dias')} />
                  </Field>
                  <Field label="Observações">
                    <Textarea rows={4} {...register('observacoes')} />
                  </Field>
                </CardContent>
              </Card>
            </div>
          </fieldset>
        </TabsContent>

        <TabsContent value="produtos">{f && <ProdutosFornecidos fornecedorId={f.id} />}</TabsContent>
        <TabsContent value="compras">{f && <ComprasDoFornecedor fornecedorId={f.id} />}</TabsContent>
        <TabsContent value="alteracoes">
          <Card className="p-6">{f && <HistoricoAlteracoes tabelas={['fornecedores']} registroIds={[f.id]} />}</Card>
        </TabsContent>
      </Tabs>
    </form>
  )
}

function ProdutosFornecidos({ fornecedorId }: { fornecedorId: string }) {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const [produto, setProduto] = useState<ProdutoLista | null>(null)
  const [codigo, setCodigo] = useState('')
  const [prazo, setPrazo] = useState('')
  const q = useQuery({ queryKey: ['fornecedores', fornecedorId, 'produtos'], queryFn: () => listarProdutosDoFornecedor(fornecedorId) })
  const atualizar = () => qc.invalidateQueries({ queryKey: ['fornecedores', fornecedorId, 'produtos'] })
  const vincular = useMutation({
    mutationFn: () => vincularProduto(fornecedorId, produto!.id, codigo, prazo),
    onSuccess: () => {
      toast.success('Produto vinculado.')
      setProduto(null)
      setCodigo('')
      setPrazo('')
      atualizar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const desvincular = useMutation({
    mutationFn: (produtoId: string) => desvincularProduto(fornecedorId, produtoId),
    onSuccess: atualizar,
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const podeEditar = pode('fornecedores', 'editar')

  return (
    <Card>
      {podeEditar && (
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_180px_140px_auto] lg:items-end">
          <Field label="Produto"><ProdutoBusca valor={produto} onSelecionar={setProduto} /></Field>
          <Field label="Código no fornecedor"><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Field>
          <Field label="Prazo (dias)"><Input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
          <Button type="button" onClick={() => vincular.mutate()} disabled={!produto || vincular.isPending}>
            <Plus /> Vincular
          </Button>
        </div>
      )}
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <ErroCarregamento mensagem={mensagemErro(q.error)} />
      ) : !q.data?.length ? (
        <Vazio titulo="Nenhum produto vinculado" descricao="Os produtos também são vinculados automaticamente ao receber compras deste fornecedor." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Cód. fornecedor</TableHead>
              <TableHead className="text-right">Último custo</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Última compra</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((p) => (
              <TableRow key={p.produto_id}>
                <TableCell>
                  <p className="font-medium">{p.produto?.descricao}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.produto?.sku}</p>
                </TableCell>
                <TableCell>{p.codigo_fornecedor ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.ultimo_custo !== null ? `R$ ${formatarNumero(p.ultimo_custo, 4)}` : '—'}
                  <span className="text-xs text-muted-foreground"> /{p.produto?.unidade}</span>
                </TableCell>
                <TableCell>{p.prazo_entrega_dias !== null ? `${p.prazo_entrega_dias} dias` : '—'}</TableCell>
                <TableCell>{p.ultima_compra_em ? formatarData(p.ultima_compra_em) : '—'}</TableCell>
                <TableCell>
                  {podeEditar && (
                    <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => desvincular.mutate(p.produto_id)} aria-label="Desvincular">
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

function ComprasDoFornecedor({ fornecedorId }: { fornecedorId: string }) {
  const { pode } = useAuth()
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['compras', 'pedidos', 'fornecedor', fornecedorId],
    queryFn: () => listarPedidosCompra({ busca: '', status: '', pagina: 1, porPagina: 50, fornecedorId }),
    enabled: pode('compras'),
  })
  if (!pode('compras')) return <Card><Vazio titulo="Seu perfil não tem acesso ao módulo de compras." /></Card>
  return (
    <Card>
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <ErroCarregamento mensagem={mensagemErro(q.error)} />
      ) : !q.data?.linhas.length ? (
        <Vazio titulo="Nenhuma compra registrada" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.linhas.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/compras/pedidos/${p.id}`)}>
                <TableCell className="font-medium">#{p.numero}</TableCell>
                <TableCell>{formatarData(p.created_at)}</TableCell>
                <TableCell>{p.previsao_entrega ? formatarData(`${p.previsao_entrega}T12:00:00`) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(p.total)}</TableCell>
                <TableCell><Badge variant={STATUS_PEDIDO_COMPRA[p.status].variant}>{STATUS_PEDIDO_COMPRA[p.status].label}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
