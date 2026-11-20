# Roteiro de homologação — ERP SHEIK DOS PISOS

Objetivo: validar o sistema com a operação real da loja antes de abandonar os controles atuais.
Ambiente: https://sheik-dos-pisos-erp.vercel.app · Banco: Supabase `sheik-dos-pisos-db`.

**Como usar:** execute os roteiros na ordem. Marque ✅ quando o resultado for o esperado; se não for,
anote em "Ocorrências" (tela, o que fez, o que aconteceu, print). Use produtos e clientes reais —
o sistema não deve conter dados fictícios em produção. Itens criados só para teste devem ser
inativados ao final (clientes e produtos não são excluídos, por histórico/LGPD).

Responsáveis sugeridos: **Administrador** (roteiros 0, 1, 10), **Gerente** (2–9), **Vendedor** (4, 5),
**Estoquista** (3, 7), **Financeiro** (6), **Logística** (7).

---

## 0. Preparação (Administrador)
- [ ] Entrar com o usuário administrador e **trocar a senha provisória** (menu do perfil › Alterar senha).
- [ ] Supabase › Authentication: **desativar cadastro público** e configurar Site URL / Redirect URL (README).
- [ ] Configurações › Empresa: preencher razão social, CNPJ, endereço e contatos.
- [ ] Configurações › Comercial e estoque: conferir validade de orçamento, sobra padrão, desconto máximo e reserva.
- [ ] Configurações › Condições de pagamento: ajustar às praticadas pela loja.
- [ ] Usuários e Permissões: criar um usuário para cada pessoa, com o perfil correto; revisar a matriz de permissões.
- [ ] Testar "Esqueci minha senha" com um usuário real (o e-mail deve chegar e o link abrir a tela de nova senha).

## 1. Acesso e segurança
- [ ] Login com senha errada mostra "E-mail ou senha incorretos".
- [ ] Vendedor **não** vê Financeiro, Contas, Caixa, Usuários (menu e acesso direto pela URL).
- [ ] Usuário desativado não consegue entrar.
- [ ] Sessão expira após 30 min sem uso.
- [ ] Administrador vê o "Histórico de alterações" de um cliente após editá-lo.

## 2. Cadastros
- [ ] Cliente PF sem CPF e PJ com CNPJ (inclusive alfanumérico); CPF/CNPJ inválido é recusado; duplicado é recusado.
- [ ] Cliente com 2 endereços (busca de CEP) e um principal.
- [ ] Produto porcelanato: peças/caixa, m²/caixa (conferir o cálculo pelas dimensões), NCM, imagem.
- [ ] Produto argamassa (unidade SC) sem campos de revestimento.
- [ ] Fornecedor com contatos e produtos fornecidos.

## 3. Estoque
- [ ] Depósitos e localizações da loja cadastrados.
- [ ] Entrada avulsa de porcelanato digitando **caixas** — m² calculado corretamente; lote/tonalidade/calibre obrigatórios.
- [ ] Tentativa de saída acima do disponível é bloqueada.
- [ ] Transferência entre localizações; avaria e baixa de avaria.
- [ ] Lote bloqueado não aparece para reserva/venda.
- [ ] Inventário: abrir (depósito fica bloqueado), contar com divergência, recontar, aprovar — ajustes aparecem em Movimentações.

## 4. Orçamento
- [ ] Item por área: 20 m² + 10% com caixa de 1,44 m² → **16 caixas / 23,04 m²**.
- [ ] Desconto acima do limite: vendedor não consegue aprovar; gerente consegue.
- [ ] Gerar PDF: logo, dados da empresa, itens, caixas e totais corretos.
- [ ] Aprovar e converter em venda.

## 5. Venda
- [ ] Selecionar lote com "✓ Lote atende"; pagamento misto (PIX + cartão 3x) fechando o total.
- [ ] Confirmar: estoque mostra **reservado**, físico inalterado.
- [ ] Contas a receber mostra as parcelas da venda; Entregas mostra a entrega "Aguardando separação".
- [ ] Pedido impresso traz "Documento sem valor fiscal".
- [ ] Cancelar uma venda confirmada (sem separação) libera a reserva e cancela o título.

## 6. Financeiro e caixa
- [ ] Abrir caixa contando a gaveta; receber a parcela PIX/dinheiro de uma venda.
- [ ] Sangria para o banco; suprimento.
- [ ] Despesa avulsa paga pelo caixa (ex.: material de limpeza).
- [ ] Receber parcela vencida: juros/multa sugeridos; baixa parcial.
- [ ] Estornar um recebimento (parcela volta a "Aberta").
- [ ] Fechar caixa com diferença proposital de R$ 1,00 → registrada como quebra.
- [ ] Financeiro › Visão geral: faturamento ≠ recebido ≠ saldo (conferir os três).
- [ ] DRE do mês coerente (receita, CMV, despesas).

## 7. Separação e entrega
- [ ] Separar parcialmente → saldo vira nova entrega.
- [ ] Estoque físico baixa somente após concluir a separação (e só uma vez).
- [ ] Agendar com motorista e veículo; romaneio do dia impresso.
- [ ] Saiu para entrega → confirmar com recebedor e foto do comprovante.
- [ ] Devolução parcial de 1 caixa → volta ao estoque.
- [ ] Venda fica "Concluída" quando tudo é entregue.

## 8. Compras
- [ ] Solicitação gerada pelo estoque crítico.
- [ ] Cotação com 2 fornecedores → vencedor pelo menor preço → pedido gerado.
- [ ] Gerente aprova o pedido; recebimento **parcial** com lote novo.
- [ ] Estoque só muda ao confirmar; custo médio atualizado; título a pagar gerado.
- [ ] Encerrar saldo do pedido parcialmente recebido.

## 9. Dashboard e relatórios
- [ ] Indicadores do dia batem com as vendas e recebimentos feitos no roteiro.
- [ ] Curva ABC, vendas por vendedor, estoque valorizado e aging.
- [ ] Exportar o mesmo relatório em CSV, Excel e PDF e abrir os três arquivos.

## 10. Encerramento
- [ ] Inativar clientes/produtos criados apenas para teste; cancelar vendas/pedidos de teste.
- [ ] Revisar a auditoria (Administrador) e a matriz de permissões final.
- [ ] Registrar o aceite: data, responsáveis e ocorrências pendentes.

---

## Ocorrências

| # | Data | Roteiro / item | O que foi feito | Resultado obtido | Prioridade | Situação |
|---|------|----------------|-----------------|------------------|-----------|----------|
| 1 |      |                |                 |                  |           |          |

## Aceite

| Responsável | Perfil | Data | Assinatura |
|-------------|--------|------|------------|
|             |        |      |            |
