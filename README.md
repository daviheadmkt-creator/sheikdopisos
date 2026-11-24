# ERP SHEIK DOS PISOS

React + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Hook Form/Zod, com Supabase (PostgreSQL, Auth, Storage) e funções de servidor na Vercel.

## Estrutura

```
assets/                      arquivos estáticos (logotipo ORIGINAL: assets/logo-sheik.png)
src/components/ui/           componentes base (padrão shadcn/ui)
src/components/layout/       menu lateral, cabeçalho, mapa de módulos/fases (nav.ts)
src/components/common/       campos, paginação, estados, histórico de alterações
src/features/<módulo>/       api.ts (dados) · schema.ts (validação) · regras.ts (negócio) · telas
src/lib/                     supabase, formatação, decimais, validadores de documentos
supabase/migrations/         migrações SQL versionadas
api/                         funções de servidor da Vercel (operações que exigem service_role)
supabase/tests/              testes SQL de regras e segurança
```

## Implantação

**Ambiente atual (produção):** https://sheik-dos-pisos-erp.vercel.app
- Banco: Supabase `sheik-dos-pisos-db` (plano Free, região São Paulo), criado pela integração
  Supabase da Vercel Marketplace. As variáveis (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`…) ficam no projeto da Vercel; localmente,
  `npx vercel env pull .env.local` (arquivo ignorado pelo Git — contém segredos).
- Painel do Supabase: `npx vercel integration open supabase`.

### Migrações e testes do banco
As migrações em `supabase/migrations/` são aplicadas em ordem e registradas em
`supabase_migrations.schema_migrations` (mesma tabela do Supabase CLI). Alternativas:
- Supabase CLI: `npx supabase link --project-ref <ref>` e `npx supabase db push`;
- SQL Editor: executar os arquivos em ordem.

Os testes em `supabase/tests/` rodam em transação com ROLLBACK (não gravam nada) e devem exibir
`FASE n: TODOS OS TESTES PASSARAM`. As fases 2 a 7 precisam de um administrador existente.

### Testes automatizados
- Unitários: `npm test` (82 testes).
- Banco: `supabase/tests/fase1…fase8` — a fase 8 percorre o fluxo completo (compra → venda → caixa → entrega) e testa a segurança com os papéis reais (vendedor e visitante).
- Homologação manual: `docs/HOMOLOGACAO.md`.

### Configuração de autenticação (painel do Supabase)
- *Authentication › Sign In / Providers*: desative **Allow new users to sign up**.
- *Authentication › URL Configuration*: Site URL `https://sheik-dos-pisos-erp.vercel.app` e Redirect URL
  `https://sheik-dos-pisos-erp.vercel.app/redefinir-senha`.
- O **primeiro** usuário criado recebe automaticamente o perfil Administrador.

### Desenvolvimento local
```
npx vercel env pull .env.local   # traz as variáveis do banco
npm install
npm run dev                      # http://localhost:5173 (sem /api)
npx vercel dev                   # alternativa com as funções /api (criação de usuários)
```

### Publicar
Envio ao GitHub (se o repositório estiver conectado na Vercel) ou `npx vercel --prod`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm test` | testes unitários (validações, cálculos, permissões) |

## Segurança

- Autorização real no banco: **RLS** em todas as tabelas + função `tem_permissao(modulo, acao)`.
  A interface só esconde botões; quem decide é o servidor.
- `service_role` usada apenas na função de servidor `api/admin-usuarios.ts` (Vercel), que valida a permissão do chamador.
- Auditoria automática (`public.auditoria`) de inserções, alterações e exclusões; leitura só por administradores.
- Clientes não são excluídos (LGPD/histórico): são inativados ou bloqueados.
- Sessão encerrada após 30 min de inatividade; usuário desativado tem login bloqueado no Auth.
- Valores monetários e quantidades em `NUMERIC`; no frontend trafegam como texto decimal, sem `float`.

## Integração com a loja virtual (WooCommerce)

O plugin **Sheik ERP Conector** (pasta `plugin/sheik-erp-conector` do projeto da loja) envia
clientes e pedidos para `api/loja-webhook.ts`, que confere a assinatura HMAC
(`LOJA_WEBHOOK_SECRET`, igual nos dois lados, mensagem válida por 5 min) e chama
`loja_receber_cliente` / `loja_receber_pedido` (só `service_role`).

- Cliente: localizado por ID da loja → CPF/CNPJ → e-mail único; o ERP é o cadastro mestre.
- Pedido pago/aguardando → **venda em rascunho** (`origem = 'loja'`) com os preços do site;
  o vendedor escolhe lote e confirma. Pisos: caixas do site viram m² no ERP.
- SKU do site = SKU do ERP. Sem correspondência → "Pendente" na tela **Pedidos da Loja**
  (`/loja`), com botão Reprocessar.
- Cancelado/reembolsado no site cancela a venda em rascunho; confirmada fica "Atenção".
- Testes: `supabase/tests/fase11_integracao_loja.sql` e `src/lib/lojaAssinatura.test.ts`.

**Produtos ERP → site** (migração `20261124001400_loja_produtos_site.sql`):
- `produtos.vender_no_site` (padrão ligado): com estoque, o plugin cria o produto no site
  (busca a cada 10 min via evento `produtos_sincronizar`, cursor `alterado_em|id`).
- Botão "Adicionar no site" (cartão Loja virtual do produto) → `api/loja-produtos.ts`, que
  envia na hora para `LOJA_SITE_URL/wp-json/sheik-erp/v1/produtos` (mesma assinatura HMAC).
- `categorias.site_categoria` = slug da categoria do site (escolhida em Produtos → Categorias).
- Resultado de cada produto fica em `produto_site` (situação, link, estoque enviado).
- Estoque no site = disponível − vendas do site em rascunho; pisos em caixas do maior lote.
- Teste: `supabase/tests/fase12_produtos_site.sql`.

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
