import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, Loader2, MapPin, Plus, Save, ShoppingCart, Star, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { HistoricoAlteracoes } from '@/components/common/HistoricoAlteracoes'
import { Carregando, ErroCarregamento, StatusBadge } from '@/components/common/Estados'
import { HistoricoCompras } from './HistoricoCompras'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { paraCanonico } from '@/lib/decimal'
import { dataLocalISO, formatarData, mascararCEP, mascararDocumento, mascararTelefone } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { UFS } from '@/lib/validators/documento'
import { buscarCep, listarVendedores, obterCliente, salvarCliente, type ClienteDB } from './api'
import { clienteParaPayload, clienteSchema, clienteVazio, enderecoVazio, idade, type ClienteForm } from './schema'

const hoje = dataLocalISO()
const idadeTexto = (nasc: string) => {
  const i = idade(nasc)
  return i !== null && i >= 0 ? `${i} ano${i === 1 ? '' : 's'}` : undefined
}

function dbParaForm(c: ClienteDB): ClienteForm {
  const enderecos = [...c.cliente_enderecos].sort((a, b) => Number(b.principal) - Number(a.principal))
  return {
    tipo_pessoa: c.tipo_pessoa,
    nome: c.nome,
    razao_social: c.razao_social ?? '',
    documento: c.documento ? mascararDocumento(c.documento, c.tipo_pessoa) : '',
    inscricao_estadual: c.inscricao_estadual ?? '',
    telefone: mascararTelefone(c.telefone ?? ''),
    whatsapp: mascararTelefone(c.whatsapp ?? ''),
    email: c.email ?? '',
    vendedor_id: c.vendedor_id ?? '',
    limite_credito: paraCanonico(c.limite_credito, 2),
    status: c.status as ClienteForm['status'],
    observacoes: c.observacoes ?? '',
    data_nascimento: c.data_nascimento ?? '',
    contato_nome: c.contato_nome ?? '',
    contato_nascimento: c.contato_nascimento ?? '',
    enderecos: enderecos.map((e) => ({
      id: e.id,
      descricao: e.descricao ?? '',
      cep: mascararCEP(e.cep),
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento ?? '',
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
      referencia: e.referencia ?? '',
      principal: e.principal,
    })),
  }
}

export function ClienteFormPage() {
  const { id } = useParams()
  const novo = !id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pode } = useAuth()
  const podeSalvar = novo ? pode('clientes', 'criar') : pode('clientes', 'editar')

  const cliente = useQuery({ queryKey: ['clientes', id], queryFn: () => obterCliente(id!), enabled: !novo })
  const vendedores = useQuery({ queryKey: ['vendedores'], queryFn: listarVendedores, staleTime: 5 * 60_000 })

  const form = useForm<ClienteForm>({ resolver: zodResolver(clienteSchema), defaultValues: clienteVazio })
  const { register, control, watch, setValue, formState, reset, handleSubmit } = form
  const enderecos = useFieldArray({ control, name: 'enderecos' })
  const tipo = watch('tipo_pessoa')
  const [buscandoCep, setBuscandoCep] = useState<number | null>(null)

  useEffect(() => {
    if (cliente.data) reset(dbParaForm(cliente.data))
  }, [cliente.data, reset])

  const salvar = useMutation({
    mutationFn: (v: ClienteForm) => salvarCliente(clienteParaPayload(v, id)),
    onSuccess: (novoId) => {
      toast.success(novo ? 'Cliente cadastrado.' : 'Alterações salvas.')
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['auditoria'] })
      if (novo) navigate(`/clientes/${novoId}`, { replace: true })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const consultarCep = async (indice: number) => {
    const cep = form.getValues(`enderecos.${indice}.cep`)
    setBuscandoCep(indice)
    const r = await buscarCep(cep)
    setBuscandoCep(null)
    if (!r) {
      toast.warning('CEP não encontrado. Preencha o endereço manualmente.')
      return
    }
    const opts = { shouldValidate: true, shouldDirty: true }
    if (r.logradouro) setValue(`enderecos.${indice}.logradouro`, r.logradouro, opts)
    if (r.bairro) setValue(`enderecos.${indice}.bairro`, r.bairro, opts)
    setValue(`enderecos.${indice}.cidade`, r.cidade, opts)
    setValue(`enderecos.${indice}.uf`, r.uf, opts)
  }

  const definirPrincipal = (indice: number) => {
    enderecos.fields.forEach((_, i) => setValue(`enderecos.${i}.principal`, i === indice, { shouldDirty: true }))
  }

  const removerEndereco = (indice: number) => {
    const eraPrincipal = form.getValues(`enderecos.${indice}.principal`)
    enderecos.remove(indice)
    if (eraPrincipal && form.getValues('enderecos').length > 0) setValue('enderecos.0.principal', true)
  }

  if (!novo && cliente.isLoading) return <Carregando />
  if (!novo && cliente.error) return <ErroCarregamento mensagem={mensagemErro(cliente.error)} />

  const erros = formState.errors
  const titulo = novo ? 'Novo cliente' : cliente.data?.nome

  return (
    <form onSubmit={handleSubmit((v) => salvar.mutate(v))} noValidate>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" asChild>
            <Link to="/clientes" aria-label="Voltar para clientes">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {titulo} {cliente.data && <StatusBadge status={cliente.data.status} />}
            </h1>
            {cliente.data && (
              <p className="text-sm text-muted-foreground">
                Código {cliente.data.codigo} · cadastrado em {formatarData(cliente.data.created_at)} · atualizado em{' '}
                {formatarData(cliente.data.updated_at, true)}
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
            <UserRound /> Dados
          </TabsTrigger>
          <TabsTrigger value="compras" disabled={novo}>
            <ShoppingCart /> Histórico de compras
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
                  <Field label="Tipo de pessoa" obrigatorio>
                    <div className="flex gap-2">
                      {(['PF', 'PJ'] as const).map((t) => (
                        <Button
                          key={t}
                          type="button"
                          variant={tipo === t ? 'dark' : 'outline'}
                          className="flex-1"
                          onClick={() => {
                            setValue('tipo_pessoa', t, { shouldDirty: true })
                            setValue('documento', '', { shouldDirty: true })
                          }}
                        >
                          {t === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label={tipo === 'PF' ? 'CPF' : 'CNPJ'}
                    htmlFor="documento"
                    obrigatorio={tipo === 'PJ'}
                    erro={erros.documento?.message}
                    ajuda={tipo === 'PJ' ? 'Aceita CNPJ numérico ou alfanumérico.' : 'Opcional para cadastro de balcão.'}
                  >
                    <Controller
                      control={control}
                      name="documento"
                      render={({ field }) => (
                        <Input
                          id="documento"
                          {...field}
                          onChange={(e) => field.onChange(mascararDocumento(e.target.value, tipo))}
                          aria-invalid={!!erros.documento}
                          placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        />
                      )}
                    />
                  </Field>
                  <Field
                    label={tipo === 'PF' ? 'Nome completo' : 'Nome fantasia'}
                    htmlFor="nome"
                    obrigatorio
                    erro={erros.nome?.message}
                    className="sm:col-span-2"
                  >
                    <Input id="nome" {...register('nome')} aria-invalid={!!erros.nome} />
                  </Field>
                  {tipo === 'PJ' && (
                    <>
                      <Field label="Razão social" htmlFor="razao" obrigatorio erro={erros.razao_social?.message}>
                        <Input id="razao" {...register('razao_social')} aria-invalid={!!erros.razao_social} />
                      </Field>
                      <Field label="Inscrição estadual" htmlFor="ie" erro={erros.inscricao_estadual?.message}>
                        <Input id="ie" {...register('inscricao_estadual')} placeholder="ou ISENTO" />
                      </Field>
                      <Field label="Nome do contato" htmlFor="contato" erro={erros.contato_nome?.message} ajuda="Pessoa responsável pelas compras">
                        <Input id="contato" {...register('contato_nome')} />
                      </Field>
                      <Field
                        label="Nascimento do contato"
                        htmlFor="contato_nasc"
                        erro={erros.contato_nascimento?.message}
                        ajuda={idadeTexto(watch('contato_nascimento'))}
                      >
                        <Input id="contato_nasc" type="date" min="1900-01-01" max={hoje} {...register('contato_nascimento')} aria-invalid={!!erros.contato_nascimento} />
                      </Field>
                    </>
                  )}
                  {tipo === 'PF' && (
                    <Field label="Data de nascimento" htmlFor="nasc" erro={erros.data_nascimento?.message} ajuda={idadeTexto(watch('data_nascimento'))}>
                      <Input id="nasc" type="date" min="1900-01-01" max={hoje} {...register('data_nascimento')} aria-invalid={!!erros.data_nascimento} />
                    </Field>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contato</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  {(['telefone', 'whatsapp'] as const).map((campo) => (
                    <Field
                      key={campo}
                      label={campo === 'telefone' ? 'Telefone' : 'WhatsApp'}
                      htmlFor={campo}
                      erro={erros[campo]?.message}
                    >
                      <Controller
                        control={control}
                        name={campo}
                        render={({ field }) => (
                          <Input
                            id={campo}
                            inputMode="tel"
                            {...field}
                            onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
                            placeholder="(00) 00000-0000"
                            aria-invalid={!!erros[campo]}
                          />
                        )}
                      />
                    </Field>
                  ))}
                  <Field label="E-mail" htmlFor="email" erro={erros.email?.message}>
                    <Input id="email" type="email" {...register('email')} aria-invalid={!!erros.email} />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle>Endereços</CardTitle>
                    <CardDescription>Cadastre o endereço principal e outros locais de entrega (obras).</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => enderecos.append(enderecoVazio(enderecos.fields.length === 0))}
                  >
                    <Plus /> Endereço
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {erros.enderecos?.message && <p className="text-sm text-destructive">{erros.enderecos.message}</p>}
                  {enderecos.fields.length === 0 && (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Nenhum endereço cadastrado.
                    </p>
                  )}
                  {enderecos.fields.map((f, i) => {
                    const e = erros.enderecos?.[i]
                    const principal = watch(`enderecos.${i}.principal`)
                    return (
                      <div key={f.id} className="rounded-xl border bg-background/50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <MapPin className="h-4 w-4 text-primary" />
                            Endereço {i + 1}
                            {principal && (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-[#7a5c0f]">Principal</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {!principal && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => definirPrincipal(i)}>
                                <Star /> Tornar principal
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removerEndereco(i)}
                            >
                              <Trash2 /> Remover
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-6">
                          <Field label="CEP" obrigatorio erro={e?.cep?.message} className="sm:col-span-2">
                            <Controller
                              control={control}
                              name={`enderecos.${i}.cep`}
                              render={({ field }) => (
                                <div className="flex gap-2">
                                  <Input
                                    {...field}
                                    inputMode="numeric"
                                    onChange={(ev) => field.onChange(mascararCEP(ev.target.value))}
                                    onBlur={() => {
                                      field.onBlur()
                                      if (field.value.replace(/\D/g, '').length === 8 && !form.getValues(`enderecos.${i}.logradouro`))
                                        void consultarCep(i)
                                    }}
                                    placeholder="00000-000"
                                    aria-invalid={!!e?.cep}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void consultarCep(i)}
                                    disabled={buscandoCep === i}
                                  >
                                    {buscandoCep === i ? <Loader2 className="animate-spin" /> : 'Buscar'}
                                  </Button>
                                </div>
                              )}
                            />
                          </Field>
                          <Field label="Identificação" className="sm:col-span-4" erro={e?.descricao?.message}>
                            <Input {...register(`enderecos.${i}.descricao`)} placeholder="Ex.: Residência, Obra Centro" />
                          </Field>
                          <Field label="Logradouro" obrigatorio erro={e?.logradouro?.message} className="sm:col-span-4">
                            <Input {...register(`enderecos.${i}.logradouro`)} aria-invalid={!!e?.logradouro} />
                          </Field>
                          <Field label="Número" obrigatorio erro={e?.numero?.message} className="sm:col-span-2">
                            <Input {...register(`enderecos.${i}.numero`)} aria-invalid={!!e?.numero} />
                          </Field>
                          <Field label="Complemento" className="sm:col-span-2">
                            <Input {...register(`enderecos.${i}.complemento`)} />
                          </Field>
                          <Field label="Bairro" obrigatorio erro={e?.bairro?.message} className="sm:col-span-2">
                            <Input {...register(`enderecos.${i}.bairro`)} aria-invalid={!!e?.bairro} />
                          </Field>
                          <Field label="Cidade" obrigatorio erro={e?.cidade?.message} className="sm:col-span-1">
                            <Input {...register(`enderecos.${i}.cidade`)} aria-invalid={!!e?.cidade} />
                          </Field>
                          <Field label="UF" obrigatorio erro={e?.uf?.message} className="sm:col-span-1">
                            <NativeSelect {...register(`enderecos.${i}.uf`)} aria-invalid={!!e?.uf}>
                              <option value="">—</option>
                              {UFS.map((uf) => (
                                <option key={uf} value={uf}>
                                  {uf}
                                </option>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field label="Ponto de referência" className="sm:col-span-6">
                            <Input {...register(`enderecos.${i}.referencia`)} />
                          </Field>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Comercial</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Status" obrigatorio>
                    <NativeSelect {...register('status')}>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                      <option value="bloqueado">Bloqueado</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Vendedor responsável">
                    <NativeSelect {...register('vendedor_id')}>
                      <option value="">Nenhum</option>
                      {vendedores.data
                        ?.filter((v) => v.ativo || v.id === cliente.data?.vendedor_id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nome}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Limite de crédito" erro={erros.limite_credito?.message}>
                    <Controller
                      control={control}
                      name="limite_credito"
                      render={({ field }) => (
                        <DecimalInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} prefixo="R$" />
                      )}
                    />
                  </Field>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea rows={6} {...register('observacoes')} placeholder="Informações internas sobre o cliente" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Não registre dados sensíveis (saúde, religião etc.) — LGPD.
                  </p>
                </CardContent>
              </Card>
            </div>
          </fieldset>
        </TabsContent>

        <TabsContent value="compras">
          <Card>{cliente.data && <HistoricoCompras clienteId={cliente.data.id} />}</Card>
        </TabsContent>

        <TabsContent value="alteracoes">
          <Card className="p-6">
            {cliente.data && (
              <HistoricoAlteracoes
                tabelas={['clientes', 'cliente_enderecos']}
                registroIds={[cliente.data.id, ...cliente.data.cliente_enderecos.map((e) => e.id)]}
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </form>
  )
}
