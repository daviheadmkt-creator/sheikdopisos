# ERP SHEIK DOS PISOS

React + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Hook Form/Zod, com Supabase (PostgreSQL, Auth, Storage, Edge Functions).

## Estrutura

```
assets/                      arquivos estáticos (logotipo ORIGINAL: assets/logo-sheik.png)
src/components/ui/           componentes base (padrão shadcn/ui)
src/components/layout/       menu lateral, cabeçalho, mapa de módulos/fases (nav.ts)
src/components/common/       campos, paginação, estados, histórico de alterações
src/features/<módulo>/       api.ts (dados) · schema.ts (validação) · regras.ts (negócio) · telas
src/lib/                     supabase, formatação, decimais, validadores de documentos
supabase/migrations/         migrações SQL versionadas
supabase/functions/          Edge Functions (operações que exigem service_role)
supabase/tests/              testes SQL de regras e segurança
```

## Implantação (primeira vez)

1. **Logotipo** — copie o arquivo original para `assets/logo-sheik.png`.
2. **Projeto Supabase** — crie um projeto em supabase.com.
3. **Banco** — no *SQL Editor*, execute em ordem:
   - `supabase/migrations/20261119000100_fase1_seguranca.sql`
   - `supabase/migrations/20261119000200_fase1_cadastros.sql`
   - `supabase/migrations/20261119000300_fase2_estoque.sql`
   - `supabase/migrations/20261119000400_fase3_comercial.sql`
   - `supabase/migrations/20261119000500_fase4_compras.sql`
   - `supabase/migrations/20261119000600_fase5_financeiro.sql`
   - `supabase/migrations/20261119000700_fase6_logistica.sql`
   - `supabase/migrations/20261119000800_fase7_relatorios.sql`

   (ou, com a CLI: `npx supabase link --project-ref <ref>` e `npx supabase db push`)
4. **Testes do banco** — execute `supabase/tests/fase1_regras.sql` e, **após criar o primeiro
   usuário (passo 6)**, `supabase/tests/fase2_estoque.sql`, `fase3_comercial.sql`, `fase4_compras.sql`, `fase5_financeiro.sql`, `fase6_logistica.sql` e `fase7_relatorios.sql`. Devem aparecer as mensagens
   `FASE n: TODOS OS TESTES PASSARAM` (rodam em transação com ROLLBACK, não gravam nada).
5. **Autenticação** (*Authentication > Sign In / Providers* e *URL Configuration*):
   - desative **Allow new users to sign up** (usuários são criados só pelo administrador);
   - *Site URL*: endereço do sistema; *Redirect URLs*: inclua `<endereço>/redefinir-senha`;
   - senha mínima: 10 caracteres.
6. **Primeiro administrador** — em *Authentication > Users > Add user* (marque *Auto Confirm*).
   O **primeiro** usuário criado recebe automaticamente o perfil Administrador.
7. **Edge Function** de usuários:
   ```
   npx supabase login
   npx supabase functions deploy admin-usuarios --project-ref <ref>
   ```
8. **Frontend** — copie `.env.example` para `.env`, preencha URL e chave *anon*, e rode:
   ```
   npm install
   npm run dev        # http://localhost:5173
   ```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm test` | testes unitários (validações, cálculos, permissões) |

## Segurança

- Autorização real no banco: **RLS** em todas as tabelas + função `tem_permissao(modulo, acao)`.
  A interface só esconde botões; quem decide é o servidor.
- `service_role` usada apenas na Edge Function `admin-usuarios`, que valida a permissão do chamador.
- Auditoria automática (`public.auditoria`) de inserções, alterações e exclusões; leitura só por administradores.
- Clientes não são excluídos (LGPD/histórico): são inativados ou bloqueados.
- Sessão encerrada após 30 min de inatividade; usuário desativado tem login bloqueado no Auth.
- Valores monetários e quantidades em `NUMERIC`; no frontend trafegam como texto decimal, sem `float`.

## Regras de estoque (Fase 2)

- Saldos só mudam por funções do servidor (`registrar_movimentacao`, `reservar_estoque`,
  `liberar_reserva`, funções de inventário); não há escrita direta nas tabelas de saldo.
- Movimentações são imutáveis; correções são feitas com novo lançamento (ajuste).
- Reserva reduz o **disponível**, não o físico. A saída vinculada à reserva consome a reserva e baixa o
  físico na mesma transação.
- Estoque nunca fica negativo (restrições `CHECK`); toda operação aceita chave de idempotência.
- Revestimentos exigem lote (tonalidade/calibre); reservas e saídas sempre em um único lote.
- Estoque de revestimentos é guardado em m² com 4 casas, digitado em caixas (conversão exata).
- Inventário aberto bloqueia o depósito; a aprovação gera os ajustes automaticamente.
