import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FASE_ATUAL, TODOS_ITENS } from '@/components/layout/nav'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'

const FASES = [
  { n: 1, titulo: 'Identidade, acesso, clientes e produtos' },
  { n: 2, titulo: 'Estoque, lotes, movimentações e inventário' },
  { n: 3, titulo: 'Orçamentos, vendas e cálculo de m²' },
  { n: 4, titulo: 'Fornecedores, compras e recebimentos' },
  { n: 5, titulo: 'Financeiro, contas e caixa' },
  { n: 6, titulo: 'Separação, entregas e logística' },
  { n: 7, titulo: 'Dashboard, relatórios e indicadores' },
  { n: 8, titulo: 'Configurações, testes integrados e homologação' },
]

export function InicioPage() {
  const { usuario, pode } = useAuth()
  const disponiveis = TODOS_ITENS.filter((i) => i.fase <= FASE_ATUAL && i.rota !== '/' && (!i.modulo || pode(i.modulo)))
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <>
      <div className="mb-8 overflow-hidden rounded-2xl bg-sidebar p-6 text-white sm:p-8">
        <p className="text-sm text-primary">{saudacao},</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{usuario?.nome}</h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-400">
          Bem-vindo ao ERP SHEIK DOS PISOS. Os indicadores gerenciais serão exibidos no Dashboard a partir da Fase 7,
          calculados com os dados reais das vendas, estoque e financeiro.
        </p>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Acesso rápido</h2>
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {disponiveis.map((i) => (
          <Link key={i.rota} to={i.rota} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar text-primary">
                  <i.icon className="h-5 w-5" />
                </span>
                <span className="flex-1 font-medium">{i.label}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Implantação por fases</CardTitle>
          <CardDescription>Módulos liberados progressivamente após homologação.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-2">
            {FASES.map((f) => {
              const pronta = f.n <= FASE_ATUAL
              return (
                <li
                  key={f.n}
                  className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm', pronta && 'border-success/30 bg-success/5')}
                >
                  {pronta ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium">Fase {f.n}</span>
                  <span className="text-muted-foreground">{f.titulo}</span>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
    </>
  )
}
