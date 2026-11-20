import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm, type Path } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Calculator, History, Info, Loader2, Package, Save } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { HistoricoAlteracoes } from '@/components/common/HistoricoAlteracoes'
import { Carregando, ErroCarregamento, StatusBadge } from '@/components/common/Estados'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/checkbox'
import { Input, NativeSelect } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatarCanonico } from '@/lib/decimal'
import { formatarData } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import {
  listarCategorias,
  listarFornecedoresResumo,
  listarMarcas,
  listarUnidades,
  obterProduto,
  salvarProduto,
} from './api'
import { ImagensProduto } from './ImagensProduto'
import { EstoqueProdutoCard } from '@/features/estoque/EstoqueProdutoCard'
import { m2PorCaixaPorDimensoes, margemPercentual, markupPercentual } from './regras'
import { ACABAMENTOS, produtoDbParaForm, produtoParaPayload, produtoSchema, produtoVazio, type ProdutoForm } from './schema'

const ORIGENS = [
  '0 - Nacional',
  '1 - Estrangeira (importação direta)',
  '2 - Estrangeira (mercado interno)',
  '3 - Nacional, conteúdo de importação > 40% e ≤ 70%',
  '4 - Nacional, processos produtivos básicos',
  '5 - Nacional, conteúdo de importação ≤ 40%',
  '6 - Estrangeira (importação direta), sem similar nacional',
  '7 - Estrangeira (mercado interno), sem similar nacional',
  '8 - Nacional, conteúdo de importação > 70%',
]

export function ProdutoFormPage() {
  const { id } = useParams()
  const novo = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode } = useAuth()
  const podeSalvar = novo ? pode('produtos', 'criar') : pode('produtos', 'editar')

  const produto = useQuery({ queryKey: ['produtos', id], queryFn: () => obterProduto(id!), enabled: !novo })
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias })
  const marcas = useQuery({ queryKey: ['marcas'], queryFn: listarMarcas })
  const unidades = useQuery({ queryKey: ['unidades'], queryFn: listarUnidades })
  const fornecedores = useQuery({ queryKey: ['fornecedores', 'resumo'], queryFn: listarFornecedoresResumo })

  const form = useForm<ProdutoForm>({ resolver: zodResolver(produtoSchema), defaultValues: produtoVazio })
  const { register, control, watch, setValue, reset, handleSubmit, formState } = form
  const erros = formState.errors

  useEffect(() => {
    if (produto.data) reset(produtoDbParaForm(produto.data))
  }, [produto.data, reset])

  const categoriaId = watch('categoria_id')
  const ehRevestimento = watch('eh_revestimento')
  const [custo, preco, largura, comprimento, pecas, m2] = watch([
    'custo',
    'preco_venda',
    'largura_cm',
    'comprimento_cm',
    'pecas_por_caixa',
    'm2_por_caixa',
  ])

  // Ao escolher uma categoria de revestimento, liga os campos específicos automaticamente
  useEffect(() => {
    const cat = categorias.data?.find((c) => c.id === categoriaId)
    if (cat && formState.dirtyFields.categoria_id) setValue('eh_revestimento', cat.revestimento, { shouldDirty: true })
  }, [categoriaId, categorias.data, formState.dirtyFields.categoria_id, setValue])

  const m2Calculado = m2PorCaixaPorDimensoes(largura, comprimento, pecas)
  const margem = margemPercentual(custo, preco)
  const markup = markupPercentual(custo, preco)

  const salvar = useMutation({
    mutationFn: (v: ProdutoForm) => salvarProduto(produtoParaPayload(v), id),
    onSuccess: (novoId) => {
      toast.success(novo ? 'Produto cadastrado. Agora você pode adicionar imagens.' : 'Alterações salvas.')
      qc.invalidateQueries({ queryKey: ['produtos'] })
      qc.invalidateQueries({ queryKey: ['auditoria'] })
      if (novo) navigate(`/produtos/${novoId}`, { replace: true })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  if (!novo && produto.isLoading) return <Carregando />
  if (!novo && produto.error) return <ErroCarregamento mensagem={mensagemErro(produto.error)} />

  const decimal = (nome: Path<ProdutoForm>, casas: number, prefixo?: string) => (
    <Controller
      control={control}
      name={nome}
      render={({ field }) => (
        <DecimalInput
          value={field.value as string}
          onChange={field.onChange}
          onBlur={field.onBlur}
          casas={casas}
          prefixo={prefixo}
          aria-invalid={!!erros[nome as keyof ProdutoForm]}
        />
      )}
    />
  )

  return (
    <form onSubmit={handleSubmit((v) => salvar.mutate(v))} noValidate>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" asChild>
            <Link to="/produtos" aria-label="Voltar para produtos">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {novo ? 'Novo produto' : String(produto.data?.descricao ?? '')}
              {produto.data && <StatusBadge status={String(produto.data.status)} />}
            </h1>
            {produto.data && (
              <p className="text-sm text-muted-foreground">
                SKU {String(produto.data.sku)} · atualizado em {formatarData(produto.data.updated_at, true)}
              </p>
            )}
          </div>
        </div>
        {podeSalvar && (
          <Button type="submit" disabled={salvar.isPending || (!novo && !formState.isDirty)}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        )}
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">
            <Package /> Dados
          </TabsTrigger>
          <TabsTrigger value="alteracoes" disabled={novo}>
            <History /> Alterações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <fieldset disabled={!podeSalvar} className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Identificação</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="SKU" htmlFor="sku" obrigatorio erro={erros.sku?.message}>
                    <Input id="sku" {...register('sku')} className="font-mono uppercase" aria-invalid={!!erros.sku} />
                  </Field>
                  <Field label="Código de barras (GTIN/EAN)" htmlFor="ean" erro={erros.codigo_barras?.message}>
                    <Input id="ean" inputMode="numeric" {...register('codigo_barras')} aria-invalid={!!erros.codigo_barras} />
                  </Field>
                  <Field label="Descrição" htmlFor="descricao" obrigatorio erro={erros.descricao?.message} className="sm:col-span-2">
                    <Input
                      id="descricao"
                      {...register('descricao')}
                      placeholder="Ex.: Porcelanato Cinza Polido Retificado 60x60"
                      aria-invalid={!!erros.descricao}
                    />
                  </Field>
                  <Field label="Categoria" obrigatorio erro={erros.categoria_id?.message}>
                    <NativeSelect {...register('categoria_id')} aria-invalid={!!erros.categoria_id}>
                      <option value="">Selecione</option>
                      {categorias.data
                        ?.filter((c) => c.ativo || c.id === categoriaId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Marca" ajuda="Cadastre marcas na aba “Categorias e marcas”.">
                    <NativeSelect {...register('marca_id')}>
                      <option value="">Sem marca</option>
                      {marcas.data
                        ?.filter((m) => m.ativo || m.id === watch('marca_id'))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field
                    label="Fornecedor"
                    ajuda={!fornecedores.data?.length ? 'O cadastro de fornecedores será liberado na Fase 4.' : undefined}
                  >
                    <NativeSelect {...register('fornecedor_id')} disabled={!fornecedores.data?.length}>
                      <option value="">Não informado</option>
                      {fornecedores.data?.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome_fantasia || f.razao_social}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Status" obrigatorio>
                    <NativeSelect {...register('status')}>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </NativeSelect>
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Preço e estoque</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Unidade de venda" obrigatorio erro={erros.unidade?.message}>
                    <NativeSelect {...register('unidade')} aria-invalid={!!erros.unidade}>
                      <option value="">Selecione</option>
                      {unidades.data?.map((u) => (
                        <option key={u.codigo} value={u.codigo}>
                          {u.codigo} — {u.descricao}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Custo" erro={erros.custo?.message} ajuda="4 casas decimais">
                    {decimal('custo', 4, 'R$')}
                  </Field>
                  <Field label="Preço de venda" obrigatorio erro={erros.preco_venda?.message}>
                    {decimal('preco_venda', 2, 'R$')}
                  </Field>
                  <Field label="Estoque mínimo" erro={erros.estoque_minimo?.message}>
                    {decimal('estoque_minimo', 3)}
                  </Field>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-background/70 px-3 py-2 text-sm sm:col-span-2 lg:col-span-4">
                    <span>
                      Margem:{' '}
                      <strong className={margem?.startsWith('-') ? 'text-destructive' : ''}>
                        {margem ? `${formatarCanonico(margem.replace('-', ''), 2)}%` : '—'}
                      </strong>
                      {margem?.startsWith('-') && <span className="text-destructive"> (negativa)</span>}
                    </span>
                    <span>
                      Markup: <strong>{markup ? `${markup.startsWith('-') ? '-' : ''}${formatarCanonico(markup.replace('-', ''), 2)}%` : '—'}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>Revestimento</CardTitle>
                    <CardDescription>Porcelanatos, cerâmicas e revestimentos vendidos por caixa/m².</CardDescription>
                  </div>
                  <Controller
                    control={control}
                    name="eh_revestimento"
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Produto de revestimento" />
                    )}
                  />
                </CardHeader>
                {ehRevestimento && (
                  <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Peças por caixa" obrigatorio erro={erros.pecas_por_caixa?.message}>
                      <Input inputMode="numeric" {...register('pecas_por_caixa')} aria-invalid={!!erros.pecas_por_caixa} />
                    </Field>
                    <Field label="m² por caixa" obrigatorio erro={erros.m2_por_caixa?.message}>
                      {decimal('m2_por_caixa', 4)}
                    </Field>
                    <Field label="Acabamento">
                      <Input list="acabamentos" {...register('acabamento')} />
                      <datalist id="acabamentos">
                        {ACABAMENTOS.map((a) => (
                          <option key={a} value={a} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Tonalidade de referência" ajuda="O controle real é por lote (Fase 2).">
                      <Input {...register('tonalidade_referencia')} />
                    </Field>
                    <Field label="Calibre de referência">
                      <Input {...register('calibre_referencia')} />
                    </Field>
                    {m2Calculado && (
                      <div className="flex items-start gap-2 rounded-lg bg-info/5 p-3 text-sm text-info sm:col-span-2 lg:col-span-3">
                        <Calculator className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          Pelas dimensões ({formatarCanonico(largura, 2)} × {formatarCanonico(comprimento, 2)} cm × {pecas}{' '}
                          peças): <strong>{formatarCanonico(m2Calculado, 4)} m²/caixa</strong>.
                          {m2 && m2 !== m2Calculado && (
                            <>
                              {' '}
                              Difere do informado ({formatarCanonico(m2, 4)}).{' '}
                              <button
                                type="button"
                                className="font-medium underline"
                                onClick={() => setValue('m2_por_caixa', m2Calculado, { shouldDirty: true, shouldValidate: true })}
                              >
                                Usar valor calculado
                              </button>
                            </>
                          )}
                          {!m2 && (
                            <button
                              type="button"
                              className="ml-1 font-medium underline"
                              onClick={() => setValue('m2_por_caixa', m2Calculado, { shouldDirty: true, shouldValidate: true })}
                            >
                              Usar este valor
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dimensões e peso</CardTitle>
                  <CardDescription>Dimensões da peça (revestimentos) ou da embalagem (demais produtos).</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Largura (cm)" erro={erros.largura_cm?.message}>
                    {decimal('largura_cm', 2)}
                  </Field>
                  <Field label="Comprimento (cm)" erro={erros.comprimento_cm?.message}>
                    {decimal('comprimento_cm', 2)}
                  </Field>
                  <Field label="Espessura (mm)" erro={erros.espessura_mm?.message}>
                    {decimal('espessura_mm', 2)}
                  </Field>
                  <Field label="Peso (kg)" erro={erros.peso_kg?.message} ajuda={ehRevestimento ? 'Peso por caixa' : undefined}>
                    {decimal('peso_kg', 3)}
                  </Field>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {!novo && produto.data && pode('estoque') && (
                <EstoqueProdutoCard
                  produtoId={produto.data.id}
                  m2PorCaixa={produto.data.eh_revestimento ? (produto.data.m2_por_caixa as number | null) : null}
                />
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Imagens</CardTitle>
                </CardHeader>
                <CardContent>
                  {novo || !produto.data ? (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" /> Salve o produto para adicionar imagens.
                    </p>
                  ) : (
                    <ImagensProduto
                      produtoId={produto.data.id}
                      imagens={produto.data.produto_imagens}
                      podeEditar={pode('produtos', 'editar')}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dados fiscais</CardTitle>
                  <CardDescription>Preparação para NF-e/NFC-e (emissão em fase futura).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="NCM" erro={erros.ncm?.message}>
                    <Input inputMode="numeric" {...register('ncm')} placeholder="0000.00.00" aria-invalid={!!erros.ncm} />
                  </Field>
                  <Field label="CEST" erro={erros.cest?.message}>
                    <Input inputMode="numeric" {...register('cest')} aria-invalid={!!erros.cest} />
                  </Field>
                  <Field label="Origem da mercadoria">
                    <NativeSelect {...register('origem_mercadoria')}>
                      <option value="">Não informada</option>
                      {ORIGENS.map((o, i) => (
                        <option key={i} value={String(i)}>
                          {o}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </CardContent>
              </Card>
            </div>
          </fieldset>
        </TabsContent>

        <TabsContent value="alteracoes">
          <Card className="p-6">
            {produto.data && (
              <HistoricoAlteracoes
                tabelas={['produtos', 'produto_imagens']}
                registroIds={[produto.data.id, ...produto.data.produto_imagens.map((i) => i.id)]}
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </form>
  )
}
