import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ITENS_EM_BREVE } from '@/components/layout/nav'
import { RequireAuth, RequirePermission } from '@/features/auth/Guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { ClienteFormPage } from '@/features/clientes/ClienteFormPage'
import { ClientesPage } from '@/features/clientes/ClientesPage'
import { ProdutoFormPage } from '@/features/produtos/ProdutoFormPage'
import { ProdutosPage } from '@/features/produtos/ProdutosPage'
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import { EstoquePage } from '@/features/estoque/EstoquePage'
import { LotesPage } from '@/features/estoque/LotesPage'
import { MovimentacoesPage } from '@/features/estoque/MovimentacoesPage'
import { InventarioPage } from '@/features/inventario/InventarioPage'
import { InventariosPage } from '@/features/inventario/InventariosPage'
import { DocumentoImpressao } from '@/features/comercial/DocumentoImpressao'
import { OrcamentoFormPage } from '@/features/orcamentos/OrcamentoFormPage'
import { OrcamentosPage } from '@/features/orcamentos/OrcamentosPage'
import { VendaFormPage } from '@/features/vendas/VendaFormPage'
import { VendasPage } from '@/features/vendas/VendasPage'
import { ComprasPage } from '@/features/compras/ComprasPage'
import { CaixaPage } from '@/features/financeiro/CaixaPage'
import { useAuth } from '@/features/auth/AuthProvider'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { RelatoriosPage } from '@/features/relatorios/RelatoriosPage'
import { EntregaPage } from '@/features/logistica/EntregaPage'
import { EntregasPage } from '@/features/logistica/EntregasPage'
import { RomaneioPage } from '@/features/logistica/RomaneioPage'
import { SeparacaoDetalhePage } from '@/features/logistica/SeparacaoDetalhePage'
import { SeparacaoPage } from '@/features/logistica/SeparacaoPage'
import { ContasPage } from '@/features/financeiro/ContasPage'
import { FinanceiroPage } from '@/features/financeiro/FinanceiroPage'
import { CotacaoPage } from '@/features/compras/CotacaoPage'
import { PedidoCompraPage } from '@/features/compras/PedidoCompraPage'
import { RecebimentoPage } from '@/features/compras/RecebimentoPage'
import { FornecedorFormPage } from '@/features/fornecedores/FornecedorFormPage'
import { FornecedoresPage } from '@/features/fornecedores/FornecedoresPage'
import { BuscaPage } from '@/pages/BuscaPage'
import { EmBrevePage, NaoEncontradoPage } from '@/pages/EmBrevePage'
import { InicioPage } from '@/pages/InicioPage'

/** Página inicial: Dashboard para quem tem acesso; senão, atalhos do Início. */
function PaginaInicial() {
  const { pode } = useAuth()
  return pode('dashboard') ? <DashboardPage /> : <InicioPage />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          {/* Impressão / PDF (sem menu lateral) */}
          <Route path="orcamentos/:id/imprimir" element={<RequirePermission modulo="orcamentos"><DocumentoImpressao tipo="orcamento" /></RequirePermission>} />
          <Route path="vendas/:id/imprimir" element={<RequirePermission modulo="vendas"><DocumentoImpressao tipo="venda" /></RequirePermission>} />
          <Route path="entregas/romaneio" element={<RequirePermission modulo="entregas"><RomaneioPage /></RequirePermission>} />

          <Route element={<AppLayout />}>
            <Route path="orcamentos" element={<RequirePermission modulo="orcamentos"><OrcamentosPage /></RequirePermission>} />
            <Route path="orcamentos/novo" element={<RequirePermission modulo="orcamentos" acao="criar"><OrcamentoFormPage /></RequirePermission>} />
            <Route path="orcamentos/:id" element={<RequirePermission modulo="orcamentos"><OrcamentoFormPage /></RequirePermission>} />
            <Route path="separacao" element={<RequirePermission modulo="separacao"><SeparacaoPage /></RequirePermission>} />
            <Route path="separacao/:id" element={<RequirePermission modulo="separacao"><SeparacaoDetalhePage /></RequirePermission>} />
            <Route path="entregas" element={<RequirePermission modulo="entregas"><EntregasPage /></RequirePermission>} />
            <Route path="entregas/:id" element={<RequirePermission modulo="entregas"><EntregaPage /></RequirePermission>} />
            <Route path="financeiro" element={<RequirePermission modulo="financeiro"><FinanceiroPage /></RequirePermission>} />
            <Route path="contas" element={<RequirePermission modulo="contas"><ContasPage /></RequirePermission>} />
            <Route path="caixa" element={<RequirePermission modulo="caixa"><CaixaPage /></RequirePermission>} />
            <Route path="fornecedores" element={<RequirePermission modulo="fornecedores"><FornecedoresPage /></RequirePermission>} />
            <Route path="fornecedores/novo" element={<RequirePermission modulo="fornecedores" acao="criar"><FornecedorFormPage /></RequirePermission>} />
            <Route path="fornecedores/:id" element={<RequirePermission modulo="fornecedores"><FornecedorFormPage /></RequirePermission>} />
            <Route path="compras" element={<RequirePermission modulo="compras"><ComprasPage /></RequirePermission>} />
            <Route path="compras/pedidos/novo" element={<RequirePermission modulo="compras" acao="criar"><PedidoCompraPage /></RequirePermission>} />
            <Route path="compras/pedidos/:id" element={<RequirePermission modulo="compras"><PedidoCompraPage /></RequirePermission>} />
            <Route path="compras/cotacoes/nova" element={<RequirePermission modulo="compras" acao="criar"><CotacaoPage /></RequirePermission>} />
            <Route path="compras/cotacoes/:id" element={<RequirePermission modulo="compras"><CotacaoPage /></RequirePermission>} />
            <Route path="compras/recebimentos/novo" element={<RequirePermission modulo="compras"><RecebimentoPage /></RequirePermission>} />
            <Route path="compras/recebimentos/:id" element={<RequirePermission modulo="compras"><RecebimentoPage /></RequirePermission>} />
            <Route path="vendas" element={<RequirePermission modulo="vendas"><VendasPage /></RequirePermission>} />
            <Route path="vendas/nova" element={<RequirePermission modulo="vendas" acao="criar"><VendaFormPage /></RequirePermission>} />
            <Route path="vendas/:id" element={<RequirePermission modulo="vendas"><VendaFormPage /></RequirePermission>} />

            <Route index element={<PaginaInicial />} />
            <Route path="dashboard" element={<RequirePermission modulo="dashboard"><DashboardPage /></RequirePermission>} />
            <Route path="relatorios" element={<RelatoriosPage />} />
            <Route path="busca" element={<BuscaPage />} />

            <Route path="clientes" element={<RequirePermission modulo="clientes"><ClientesPage /></RequirePermission>} />
            <Route path="clientes/novo" element={<RequirePermission modulo="clientes" acao="criar"><ClienteFormPage /></RequirePermission>} />
            <Route path="clientes/:id" element={<RequirePermission modulo="clientes"><ClienteFormPage /></RequirePermission>} />

            <Route path="produtos" element={<RequirePermission modulo="produtos"><ProdutosPage /></RequirePermission>} />
            <Route path="produtos/novo" element={<RequirePermission modulo="produtos" acao="criar"><ProdutoFormPage /></RequirePermission>} />
            <Route path="produtos/:id" element={<RequirePermission modulo="produtos"><ProdutoFormPage /></RequirePermission>} />

            <Route path="usuarios" element={<RequirePermission modulo="usuarios"><UsuariosPage /></RequirePermission>} />

            <Route path="estoque" element={<RequirePermission modulo="estoque"><EstoquePage /></RequirePermission>} />
            <Route path="movimentacoes" element={<RequirePermission modulo="movimentacoes"><MovimentacoesPage /></RequirePermission>} />
            <Route path="lotes" element={<RequirePermission modulo="lotes"><LotesPage /></RequirePermission>} />
            <Route path="inventario" element={<RequirePermission modulo="inventario"><InventariosPage /></RequirePermission>} />
            <Route path="inventario/:id" element={<RequirePermission modulo="inventario"><InventarioPage /></RequirePermission>} />

            {ITENS_EM_BREVE.map((item) => (
              <Route key={item.rota} path={item.rota.slice(1)} element={<EmBrevePage item={item} />} />
            ))}
            <Route path="*" element={<NaoEncontradoPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
