import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Carregando, ErroCarregamento, Vazio } from '@/components/common/Estados'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatarData } from '@/lib/format'
import { mensagemErro, supabase } from '@/lib/supabase'

interface Registro {
  id: number
  tabela: string
  operacao: 'INSERT' | 'UPDATE' | 'DELETE'
  dados_antigos: Record<string, unknown> | null
  dados_novos: Record<string, unknown> | null
  alterado_por: string | null
  alterado_em: string
}

const IGNORAR = new Set(['updated_at', 'updated_by', 'created_at', 'created_by'])
const OPERACAO = { INSERT: 'Criação', UPDATE: 'Alteração', DELETE: 'Exclusão' } as const

function camposAlterados(r: Registro) {
  if (r.operacao !== 'UPDATE' || !r.dados_antigos || !r.dados_novos) return []
  return Object.keys(r.dados_novos).filter(
    (k) => !IGNORAR.has(k) && JSON.stringify(r.dados_antigos![k]) !== JSON.stringify(r.dados_novos![k]),
  )
}

const valor = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

/** Histórico de alterações (auditoria). Visível somente para administradores (RLS). */
export function HistoricoAlteracoes({ tabelas, registroIds }: { tabelas: string[]; registroIds: string[] }) {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfis.includes('administrador') ?? false

  const q = useQuery({
    queryKey: ['auditoria', tabelas, registroIds],
    enabled: ehAdmin && registroIds.length > 0,
    queryFn: async () => {
      const [aud, usuarios] = await Promise.all([
        supabase
          .from('auditoria')
          .select('*')
          .in('tabela', tabelas)
          .in('registro_id', registroIds)
          .order('alterado_em', { ascending: false })
          .limit(200),
        supabase.from('usuarios').select('id,nome'),
      ])
      if (aud.error) throw aud.error
      const nomes = new Map((usuarios.data ?? []).map((u) => [u.id as string, u.nome as string]))
      return (aud.data as Registro[]).map((r) => ({ ...r, autor: r.alterado_por ? nomes.get(r.alterado_por) : null }))
    },
  })

  if (!ehAdmin)
    return (
      <Vazio
        titulo="Histórico restrito"
        descricao="O histórico de alterações é visível apenas para administradores."
      />
    )
  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroCarregamento mensagem={mensagemErro(q.error)} />
  if (!q.data?.length) return <Vazio titulo="Sem registros de alteração" />

  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {q.data.map((r) => {
        const campos = camposAlterados(r)
        return (
          <li key={r.id} className="relative">
            <span className="absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-sidebar text-primary">
              <History className="h-3 w-3" />
            </span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={r.operacao === 'DELETE' ? 'danger' : r.operacao === 'INSERT' ? 'success' : 'info'}>
                {OPERACAO[r.operacao]}
              </Badge>
              <span className="text-muted-foreground">{r.tabela === 'cliente_enderecos' ? 'Endereço' : ''}</span>
              <span className="font-medium">{r.autor ?? 'Sistema'}</span>
              <span className="text-muted-foreground">{formatarData(r.alterado_em, true)}</span>
            </div>
            {campos.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {campos.map((c) => (
                  <li key={c} className="break-words">
                    <span className="font-medium">{c}</span>:{' '}
                    <span className="text-muted-foreground line-through">{valor(r.dados_antigos![c])}</span> →{' '}
                    <span>{valor(r.dados_novos![c])}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}
