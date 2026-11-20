# Revisão de QA e Segurança — 20/11/2026

Escopo: banco (RLS, funções, privilégios, storage), função de servidor `/api/admin-usuarios`,
frontend (XSS, injeções, uploads, sessão), cabeçalhos HTTP e dependências.

## Vulnerabilidades corrigidas

| # | Gravidade | Problema | Correção |
|---|-----------|----------|----------|
| 1 | Alta | Quem podia editar vendas/orçamentos/pedidos de compra conseguia, pela API, mudar o status direto (ex.: rascunho → confirmada), pulando conferência de estoque, desconto e financeiro. Também era possível inserir a venda já "confirmada". | Políticas RLS fixam o status também no `WITH CHECK` (INSERT e UPDATE). Mudança de status só pelas funções oficiais. |
| 2 | Alta | Valores dos itens e totais vinham do navegador: dava para gravar 100 caixas por R$ 1 escrevendo direto na tabela de itens. | Gatilho recalcula bruto/desconto/total de cada item no banco; ao confirmar/aprovar, os totais do cabeçalho precisam bater com os itens. |
| 3 | Média | Limite de desconto burlável baixando o preço unitário (sem informar desconto). | Ao confirmar venda ou aprovar orçamento, preço abaixo da tabela conta como desconto; acima do limite exige perfil com "aprovar". |
| 4 | Média | Autoria forjável: `created_by`/`created_at` aceitavam valor enviado pelo navegador e podiam ser alterados depois. | Carimbo sempre usa o usuário logado e a hora do servidor; não muda em edições. |
| 5 | Média | Privilégios excessivos herdados do padrão: visitante (anon) com grants em todas as tabelas; `TRUNCATE` (que ignora RLS) liberado; views graváveis; tabela `usuarios` com e-mail/id editáveis. | Visitante sem acesso a nada (API devolve 401); `TRUNCATE`/`TRIGGER`/`REFERENCES` revogados; views só leitura; `usuarios` só permite editar nome, telefone e ativo. Padrão também aplicado a tabelas futuras. |
| 6 | Média | Injeção de fórmula em CSV: um nome como `=HYPERLINK(...)` virava fórmula ao abrir no Excel. | Textos iniciados por `= + - @` são neutralizados (números negativos preservados). O .xlsx já gravava texto como texto. |
| 7 | Baixa | `/api/admin-usuarios` devolvia mensagens internas do Auth/banco; ID sem validação; ao falhar o bloqueio, cadastro e acesso ficavam divergentes. | Mensagens genéricas (detalhe só no log), UUID validado, limites de tamanho, desfaz a marcação se o bloqueio falhar. |
| 8 | Baixa | Funções auxiliares de leitura expostas sem necessidade. | `categoria_sistema` e `deposito_em_inventario` revogadas do navegador. |
| 9 | Baixa | Cabeçalhos HTTP. | Adicionados `Cross-Origin-Opener-Policy: same-origin` e `X-Permitted-Cross-Domain-Policies: none`. |

## Qualidade (bugs corrigidos)

- Mensagens de regra de negócio com código 42501 (ex.: "Desconto acima de 5% exige aprovação de um gerente")
  eram trocadas por "Você não tem permissão". Agora a mensagem real aparece; erros técnicos seguem genéricos.
- Testes das fases 5 e 8 usavam o caixa real da loja e falhavam quando ele estava aberto; agora criam um caixa próprio.

## Verificado e aprovado (sem alteração)

RLS ativa em 100% das tabelas; funções `security definer` com `search_path` fixo e checagem de permissão;
uploads com tipo/tamanho validados e nome aleatório; bucket de comprovantes privado com URL assinada de 5 min;
sem `dangerouslySetInnerHTML`/`eval`; buscas sanitizadas antes dos filtros; sessão expira por inatividade (30 min)
e limpa o cache ao sair; usuário desativado perde acesso imediatamente; CSP restritiva; sem segredos no Git.

## Riscos aceitos / dependências

- `zod` 3 (alerta de consumo de memória com coleções enormes): usado só no navegador para validar formulários,
  sem impacto no servidor. Correção exige migrar para zod 4 (mudança grande) — planejar.
- `react-router-dom` 6 (redirecionamento aberto com barra invertida / SSR): o sistema usa MemoryRouter sem SSR e
  não navega para endereços externos. Correção exige a versão 7 — planejar.
- `vite`/`vitest`/`esbuild`: afetam só o servidor de desenvolvimento local, não o site publicado.

## Ações que dependem do administrador (painel do Supabase)

1. Authentication › Providers › Email: **desativar cadastro público** ("Allow new users to sign up").
2. Authentication › Policies/Passwords: **senha mínima de 10 caracteres** com letras e números
   (hoje a regra é aplicada só na tela; o servidor de login aceita 6).
3. URL Configuration: Site URL e Redirect `https://sheik-dos-pisos-erp.vercel.app/redefinir-senha`.
4. Vercel: remover a variável `VITE_MODO_VISUALIZACAO`.

## Testes

- 88 testes unitários (3 novos) e 10 conjuntos SQL (novo: `fase10_qa_seguranca.sql`, 11 ataques simulados
  com perfil vendedor e visitante) — todos passando em produção, dentro de transação desfeita.
