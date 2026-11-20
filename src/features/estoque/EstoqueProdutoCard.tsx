import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Warehouse } from 'lucide-react'
import { Carregando } from '@/components/common/Estados'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listarSaldosDoProduto } from './api'
import { Qtd } from './componentes'

/** Resumo de saldo exibido no cadastro do produto. */
export function EstoqueProdutoCard({ produtoId, m2PorCaixa }: { produtoId: string; m2PorCaixa: number | null }) {
  const q = useQuery({ queryKey: ['estoque', 'saldos-produto', produtoId], queryFn: () => listarSaldosDoProduto(produtoId) })
  const linhas = q.data ?? []
  const soma = (k: 'quantidade_fisica' | 'quantidade_reservada' | 'quantidade_disponivel') =>
    linhas.reduce((s, l) => s + Number(l[k]), 0)
  const unidade = linhas[0]?.unidade ?? ''

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-primary" /> Estoque
        </CardTitle>
        <Link to="/estoque" className="text-xs text-info hover:underline">
          Ver estoque
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Carregando />
        ) : !linhas.length ? (
          <p className="text-sm text-muted-foreground">Sem saldo em estoque.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-background/70 p-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Físico</p>
                <Qtd valor={soma('quantidade_fisica')} unidade={unidade} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reservado</p>
                <Qtd valor={soma('quantidade_reservada')} unidade={unidade} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Disponível</p>
                <Qtd valor={soma('quantidade_disponivel')} unidade={unidade} m2PorCaixa={m2PorCaixa} className="font-semibold" />
              </div>
            </div>
            <ul className="divide-y">
              {linhas.map((l) => (
                <li key={l.id} className="flex justify-between gap-2 py-2">
                  <span className="text-muted-foreground">
                    {l.lote_codigo ? `Lote ${l.lote_codigo}${l.tonalidade ? ` / ${l.tonalidade}` : ''}` : 'Sem lote'}
                    <span className="block text-xs">
                      {l.deposito_nome}
                      {l.localizacao_codigo && ` · ${l.localizacao_codigo}`}
                    </span>
                  </span>
                  <Qtd valor={l.quantidade_disponivel} unidade={l.unidade} className="text-right" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
