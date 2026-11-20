import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CalendarClock, ExternalLink, Image, Link2, Loader2, Plus, Ruler, Save, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { DecimalInput, Field } from '@/components/common/Field'
import { Logo } from '@/components/common/Logo'
import { PageHeader } from '@/components/common/PageHeader'
import { Carregando, ErroCarregamento } from '@/components/common/Estados'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/checkbox'
import { Input, NativeSelect } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { buscarCep } from '@/features/clientes/api'
import { obterParametros, PARAMETROS_PADRAO } from '@/features/comercial/api'
import { paraCanonico } from '@/lib/decimal'
import { formatarData, mascararCEP, mascararDocumento, mascararTelefone } from '@/lib/format'
import { mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { normalizarCNPJ, somenteDigitos, UFS, validarCNPJ } from '@/lib/validators/documento'
import {
  alterarCondicaoAtiva,
  alterarUnidadeAtiva,
  criarCondicao,
  criarUnidade,
  descreverCondicao,
  listarCondicoes,
  listarTodasUnidades,
  obterEmpresaConfig,
  salvarEmpresa,
  salvarParametrosComerciais,
  type CondicaoPagamento,
} from './api'

export function ConfiguracoesPage() {
  return (
    <>
      <PageHeader titulo="Configurações" descricao="Dados da empresa, parâmetros comerciais e de estoque, condições de pagamento, unidades e identidade visual." />
      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa"><Building2 /> Empresa</TabsTrigger>
          <TabsTrigger value="parametros"><SlidersHorizontal /> Comercial e estoque</TabsTrigger>
          <TabsTrigger value="condicoes"><CalendarClock /> Condições de pagamento</TabsTrigger>
          <TabsTrigger value="unidades"><Ruler /> Unidades</TabsTrigger>
          <TabsTrigger value="visual"><Image /> Identidade visual</TabsTrigger>
          <TabsTrigger value="outros"><Link2 /> Outros cadastros</TabsTrigger>
        </TabsList>
        <TabsContent value="empresa"><EmpresaTab /></TabsContent>
        <TabsContent value="parametros"><ParametrosTab /></TabsContent>
        <TabsContent value="condicoes"><CondicoesTab /></TabsContent>
        <TabsContent value="unidades"><UnidadesTab /></TabsContent>
        <TabsContent value="visual"><VisualTab /></TabsContent>
        <TabsContent value="outros"><OutrosTab /></TabsContent>
      </Tabs>
    </>
  )
}

const tel = z.string().refine((v) => [0, 10, 11].includes(somenteDigitos(v).length), 'Telefone inválido')
const empresaSchema = z.object({
  razao_social: z.string().trim().min(2, 'Informe a razão social'),
  nome_fantasia: z.string().trim(),
  cnpj: z.string().refine((v) => !v || validarCNPJ(v), 'CNPJ inválido'),
  inscricao_estadual: z.string().trim(),
  telefone: tel,
  whatsapp: tel,
  email: z.string().trim().refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido'),
  cep: z.string().refine((v) => !v || somenteDigitos(v).length === 8, 'CEP inválido'),
  logradouro: z.string().trim(),
  numero: z.string().trim(),
  complemento: z.string().trim(),
  bairro: z.string().trim(),
  cidade: z.string().trim(),
  uf: z.string(),
})
type EmpresaForm = z.infer<typeof empresaSchema>

function EmpresaTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['configuracoes', 'empresa'], queryFn: obterEmpresaConfig })
  const form = useForm<EmpresaForm>({
    resolver: zodResolver(empresaSchema),
    defaultValues: { razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', telefone: '', whatsapp: '', email: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' },
  })
  const { register, control, reset, handleSubmit, setValue, getValues, formState } = form
  const e = formState.errors
  const podeEditar = pode('configuracoes', 'editar')

  useEffect(() => {
    const d = q.data
    if (!d) return
    reset({
      razao_social: d.razao_social, nome_fantasia: d.nome_fantasia ?? '', cnpj: d.cnpj ? mascararDocumento(d.cnpj, 'PJ') : '',
      inscricao_estadual: d.inscricao_estadual ?? '', telefone: mascararTelefone(d.telefone ?? ''), whatsapp: mascararTelefone(d.whatsapp ?? ''),
      email: d.email ?? '', cep: mascararCEP(d.cep ?? ''), logradouro: d.logradouro ?? '', numero: d.numero ?? '', complemento: d.complemento ?? '',
      bairro: d.bairro ?? '', cidade: d.cidade ?? '', uf: d.uf ?? '',
    })
  }, [q.data, reset])

  const salvar = useMutation({
    mutationFn: (v: EmpresaForm) =>
      salvarEmpresa(q.data!.id, {
        razao_social: v.razao_social, nome_fantasia: v.nome_fantasia || null, cnpj: v.cnpj ? normalizarCNPJ(v.cnpj) : null,
        inscricao_estadual: v.inscricao_estadual || null, telefone: somenteDigitos(v.telefone) || null, whatsapp: somenteDigitos(v.whatsapp) || null,
        email: v.email.toLowerCase() || null, cep: somenteDigitos(v.cep) || null, logradouro: v.logradouro || null, numero: v.numero || null,
        complemento: v.complemento || null, bairro: v.bairro || null, cidade: v.cidade || null, uf: v.uf || null,
      }),
    onSuccess: () => { toast.success('Dados da empresa salvos. Eles aparecem nos orçamentos e pedidos impressos.'); qc.invalidateQueries({ queryKey: ['configuracoes'] }); qc.invalidateQueries({ queryKey: ['empresa'] }) },
    onError: (err) => toast.error(mensagemErro(err)),
  })

  const cep = async () => {
    const r = await buscarCep(getValues('cep'))
    if (!r) return toast.warning('CEP não encontrado.')
    const o = { shouldDirty: true }
    if (r.logradouro) setValue('logradouro', r.logradouro, o)
    if (r.bairro) setValue('bairro', r.bairro, o)
    setValue('cidade', r.cidade, o)
    setValue('uf', r.uf, o)
  }

  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroCarregamento mensagem={mensagemErro(q.error)} />
  if (!q.data) return <ErroCarregamento mensagem="Registro da empresa não encontrado." />

  return (
    <form onSubmit={handleSubmit((v) => salvar.mutate(v))} noValidate>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Dados da empresa</CardTitle>
            <CardDescription>Usados no cabeçalho de orçamentos, pedidos e relatórios. Atualizado em {formatarData(q.data.updated_at, true)}.</CardDescription>
          </div>
          {podeEditar && <Button type="submit" disabled={salvar.isPending || !formState.isDirty}>{salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>}
        </CardHeader>
        <CardContent>
          <fieldset disabled={!podeEditar} className="grid gap-4 sm:grid-cols-6">
            <Field label="Razão social" obrigatorio erro={e.razao_social?.message} className="sm:col-span-4"><Input {...register('razao_social')} /></Field>
            <Field label="Nome fantasia" className="sm:col-span-2"><Input {...register('nome_fantasia')} /></Field>
            <Field label="CNPJ" erro={e.cnpj?.message} className="sm:col-span-2">
              <Controller control={control} name="cnpj" render={({ field }) => <Input {...field} onChange={(x) => field.onChange(mascararDocumento(x.target.value, 'PJ'))} />} />
            </Field>
            <Field label="Inscrição estadual" className="sm:col-span-2"><Input {...register('inscricao_estadual')} /></Field>
            <Field label="E-mail" erro={e.email?.message} className="sm:col-span-2"><Input type="email" {...register('email')} /></Field>
            {(['telefone', 'whatsapp'] as const).map((k) => (
              <Field key={k} label={k === 'telefone' ? 'Telefone' : 'WhatsApp'} erro={e[k]?.message} className="sm:col-span-3">
                <Controller control={control} name={k} render={({ field }) => <Input inputMode="tel" {...field} onChange={(x) => field.onChange(mascararTelefone(x.target.value))} />} />
              </Field>
            ))}
            <Field label="CEP" erro={e.cep?.message} className="sm:col-span-2">
              <Controller control={control} name="cep" render={({ field }) => (
                <div className="flex gap-2"><Input {...field} inputMode="numeric" onChange={(x) => field.onChange(mascararCEP(x.target.value))} /><Button type="button" variant="outline" onClick={() => void cep()}>Buscar</Button></div>
              )} />
            </Field>
            <Field label="Logradouro" className="sm:col-span-4"><Input {...register('logradouro')} /></Field>
            <Field label="Número" className="sm:col-span-1"><Input {...register('numero')} /></Field>
            <Field label="Complemento" className="sm:col-span-2"><Input {...register('complemento')} /></Field>
            <Field label="Bairro" className="sm:col-span-3"><Input {...register('bairro')} /></Field>
            <Field label="Cidade" className="sm:col-span-4"><Input {...register('cidade')} /></Field>
            <Field label="UF" className="sm:col-span-2">
              <NativeSelect {...register('uf')}><option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</NativeSelect>
            </Field>
          </fieldset>
        </CardContent>
      </Card>
    </form>
  )
}

function ParametrosTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['parametros-comerciais'], queryFn: obterParametros })
  const [p, setP] = useState({ reservar: true, validadeOrc: '10', validadeRes: '7', sobra: '', desconto: '' })
  useEffect(() => {
    const x = q.data ?? PARAMETROS_PADRAO
    setP({ reservar: x.reservar_ao_confirmar, validadeOrc: String(x.validade_orcamento_dias), validadeRes: String(x.validade_reserva_dias), sobra: paraCanonico(x.perc_sobra_padrao, 2), desconto: paraCanonico(x.desconto_max_sem_aprovacao, 2) })
  }, [q.data])
  const salvar = useMutation({
    mutationFn: () => salvarParametrosComerciais({
      reservar_ao_confirmar: p.reservar, validade_orcamento_dias: Number(p.validadeOrc), validade_reserva_dias: Number(p.validadeRes),
      perc_sobra_padrao: Number(p.sobra || 0), desconto_max_sem_aprovacao: Number(p.desconto || 0),
    }),
    onSuccess: () => { toast.success('Parâmetros salvos.'); qc.invalidateQueries({ queryKey: ['parametros-comerciais'] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const podeEditar = pode('configuracoes', 'editar')
  const num = (v: string, max: number) => v.replace(/\D/g, '').slice(0, String(max).length)

  if (q.isLoading) return <Carregando />
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Vendas e orçamentos</CardTitle><CardDescription>Aplicados em novos orçamentos e vendas.</CardDescription></CardHeader>
        <CardContent>
          <fieldset disabled={!podeEditar} className="grid gap-4 sm:grid-cols-2">
            <Field label="Validade do orçamento (dias)" ajuda="1 a 180"><Input inputMode="numeric" value={p.validadeOrc} onChange={(e) => setP({ ...p, validadeOrc: num(e.target.value, 180) })} /></Field>
            <Field label="Sobra padrão para recortes (%)" ajuda="Sugerida no cálculo de caixas"><DecimalInput value={p.sobra} onChange={(v) => setP({ ...p, sobra: v })} casas={2} /></Field>
            <Field label="Desconto máximo sem aprovação (%)" ajuda="Acima disso, só usuários com permissão de aprovar" className="sm:col-span-2"><DecimalInput value={p.desconto} onChange={(v) => setP({ ...p, desconto: v })} casas={2} /></Field>
          </fieldset>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Estoque e reservas</CardTitle><CardDescription>Política de reserva ao confirmar pedidos.</CardDescription></CardHeader>
        <CardContent>
          <fieldset disabled={!podeEditar} className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <span className="text-sm"><strong>Reservar estoque ao confirmar a venda</strong><span className="block text-xs text-muted-foreground">Desligado: a venda apenas verifica a disponibilidade, sem reservar.</span></span>
              <Switch checked={p.reservar} onCheckedChange={(v) => setP({ ...p, reservar: v })} />
            </div>
            <Field label="Validade da reserva (dias)" ajuda="1 a 90 — reservas vencidas aparecem destacadas no Estoque"><Input inputMode="numeric" value={p.validadeRes} onChange={(e) => setP({ ...p, validadeRes: num(e.target.value, 90) })} /></Field>
            <p className="text-xs text-muted-foreground">Estoque mínimo e unidades são definidos por produto; os encargos por atraso ficam em Financeiro › Cadastros.</p>
          </fieldset>
        </CardContent>
      </Card>
      {podeEditar && (
        <div className="lg:col-span-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !Number(p.validadeOrc) || !Number(p.validadeRes)}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar parâmetros
          </Button>
        </div>
      )}
    </div>
  )
}

function CondicoesTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['condicoes-pagamento'], queryFn: listarCondicoes })
  const vazio = { nome: '', parcelas: '1', primeiro: '30', intervalo: '30', uso: 'ambos' as CondicaoPagamento['uso'] }
  const [n, setN] = useState(vazio)
  const inv = () => qc.invalidateQueries({ queryKey: ['condicoes-pagamento'] })
  const criar = useMutation({
    mutationFn: () => criarCondicao({ nome: n.nome, parcelas: Number(n.parcelas), primeiro_vencimento_dias: Number(n.primeiro), intervalo_dias: Number(n.intervalo), uso: n.uso }),
    onSuccess: () => { toast.success('Condição criada.'); setN(vazio); inv() },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const ativo = useMutation({ mutationFn: (a: { id: string; ativo: boolean }) => alterarCondicaoAtiva(a.id, a.ativo), onSuccess: inv, onError: (e) => toast.error(mensagemErro(e)) })
  const dig = (v: string, t: number) => v.replace(/\D/g, '').slice(0, t)
  const podeEditar = pode('configuracoes', 'editar')
  return (
    <Card>
      <CardHeader><CardTitle>Condições de pagamento</CardTitle><CardDescription>Atalhos usados nos pedidos de compra e nas condições de orçamentos.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {podeEditar && (
          <div className="grid gap-2 rounded-lg border bg-background/50 p-3 sm:grid-cols-[1fr_90px_110px_110px_130px_auto] sm:items-end">
            <Field label="Nome"><Input value={n.nome} onChange={(e) => setN({ ...n, nome: e.target.value })} placeholder="Ex.: 30/60/90/120" /></Field>
            <Field label="Parcelas"><Input inputMode="numeric" value={n.parcelas} onChange={(e) => setN({ ...n, parcelas: dig(e.target.value, 2) })} /></Field>
            <Field label="1º venc. (dias)"><Input inputMode="numeric" value={n.primeiro} onChange={(e) => setN({ ...n, primeiro: dig(e.target.value, 3) })} /></Field>
            <Field label="Intervalo"><Input inputMode="numeric" value={n.intervalo} onChange={(e) => setN({ ...n, intervalo: dig(e.target.value, 3) })} /></Field>
            <Field label="Uso">
              <NativeSelect value={n.uso} onChange={(e) => setN({ ...n, uso: e.target.value as CondicaoPagamento['uso'] })}>
                <option value="ambos">Vendas e compras</option><option value="vendas">Vendas</option><option value="compras">Compras</option>
              </NativeSelect>
            </Field>
            <Button onClick={() => criar.mutate()} disabled={n.nome.trim().length < 2 || !Number(n.parcelas) || !Number(n.intervalo) || criar.isPending}><Plus /> Incluir</Button>
          </div>
        )}
        {q.isLoading ? <Carregando /> : (
          <ul className="divide-y rounded-lg border">
            {q.data?.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className={cn(!c.ativo && 'text-muted-foreground line-through')}><strong>{c.nome}</strong><span className="ml-2 text-muted-foreground">{descreverCondicao(c)}</span></span>
                <span className="flex items-center gap-2">
                  <Badge variant="neutral">{c.uso === 'ambos' ? 'Vendas e compras' : c.uso === 'vendas' ? 'Vendas' : 'Compras'}</Badge>
                  <Switch checked={c.ativo} disabled={!podeEditar} onCheckedChange={(v) => ativo.mutate({ id: c.id, ativo: v })} aria-label="Ativa" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function UnidadesTab() {
  const { pode } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['unidades', 'todas'], queryFn: listarTodasUnidades })
  const [u, setU] = useState({ codigo: '', descricao: '', casas: '0' })
  const inv = () => { qc.invalidateQueries({ queryKey: ['unidades'] }) }
  const criar = useMutation({
    mutationFn: () => criarUnidade({ codigo: u.codigo, descricao: u.descricao, casas_decimais: Number(u.casas) }),
    onSuccess: () => { toast.success('Unidade criada.'); setU({ codigo: '', descricao: '', casas: '0' }); inv() },
    onError: (e) => toast.error(mensagemErro(e)),
  })
  const ativo = useMutation({ mutationFn: (a: { codigo: string; ativo: boolean }) => alterarUnidadeAtiva(a.codigo, a.ativo), onSuccess: inv, onError: (e) => toast.error(mensagemErro(e)) })
  const podeEditar = pode('configuracoes', 'editar')
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Unidades de medida</CardTitle><CardDescription>As casas decimais controlam frações aceitas em vendas e no estoque (ex.: SC = 0, M2 = 4).</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {podeEditar && (
          <div className="grid gap-2 rounded-lg border bg-background/50 p-3 sm:grid-cols-[110px_1fr_120px_auto] sm:items-end">
            <Field label="Código"><Input value={u.codigo} onChange={(e) => setU({ ...u, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })} /></Field>
            <Field label="Descrição"><Input value={u.descricao} onChange={(e) => setU({ ...u, descricao: e.target.value })} /></Field>
            <Field label="Casas decimais"><NativeSelect value={u.casas} onChange={(e) => setU({ ...u, casas: e.target.value })}>{[0, 1, 2, 3, 4].map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect></Field>
            <Button onClick={() => criar.mutate()} disabled={!u.codigo || u.descricao.trim().length < 2 || criar.isPending}><Plus /> Incluir</Button>
          </div>
        )}
        {q.isLoading ? <Carregando /> : (
          <ul className="divide-y rounded-lg border">
            {q.data?.map((x) => (
              <li key={x.codigo} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className={cn(!x.ativo && 'text-muted-foreground line-through')}><strong className="font-mono">{x.codigo}</strong> — {x.descricao}<span className="ml-2 text-xs text-muted-foreground">{x.casas_decimais} casa(s)</span></span>
                <Switch checked={x.ativo} disabled={!podeEditar} onCheckedChange={(v) => ativo.mutate({ codigo: x.codigo, ativo: v })} aria-label="Ativa" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function VisualTab() {
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Identidade visual</CardTitle><CardDescription>Logotipo oficial e paleta aprovada.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="rounded-2xl bg-sidebar p-4"><Logo className="h-auto w-full" /></div>
        <div className="space-y-3 text-sm">
          <p>O logotipo é um arquivo protegido do sistema (<code>assets/logo-sheik.png</code>, original em alta resolução) e não pode ser alterado pela tela, para preservar a identidade oficial. Para trocá-lo, substitua o arquivo e gere as cópias reduzidas, conforme <code>assets/LEIA-ME.txt</code>.</p>
          <div className="flex flex-wrap gap-2">
            {[['Preto', '#080808'], ['Dourado', '#D4A52C'], ['Dourado claro', '#E9BC4A'], ['Creme', '#F7F5EF'], ['Safira', '#006FB9'], ['Sucesso', '#218653'], ['Alerta', '#C43C35']].map(([n, c]) => (
              <span key={c} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"><span className="h-4 w-4 rounded border" style={{ background: c }} />{n} <code>{c}</code></span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OutrosTab() {
  const { pode } = useAuth()
  const links = [
    { rota: '/produtos', label: 'Categorias e marcas de produtos', modulo: 'produtos' },
    { rota: '/estoque?aba=depositos', label: 'Depósitos e localizações', modulo: 'estoque' },
    { rota: '/financeiro', label: 'Plano de contas, centros de custo e encargos', modulo: 'financeiro' },
    { rota: '/entregas', label: 'Motoristas, veículos e transportadoras', modulo: 'entregas' },
    { rota: '/usuarios', label: 'Usuários, perfis e permissões', modulo: 'usuarios' },
  ].filter((l) => pode(l.modulo))
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Outros cadastros</CardTitle><CardDescription>Configurações que ficam junto do módulo correspondente.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {links.map((l) => (
          <Link key={l.rota} to={l.rota} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-accent">{l.label}<ExternalLink className="h-4 w-4 text-muted-foreground" /></Link>
        ))}
      </CardContent>
    </Card>
  )
}
