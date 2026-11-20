import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Carregando } from '@/components/common/Estados'
import { AppLayout } from '@/components/layout/AppLayout'
import { ITENS_EM_BREVE } from '@/components/layout/nav'
import { useAuth } from '@/features/auth/AuthProvider'
import { RequireAuth, RequirePermission } from '@/features/auth/Guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { EmBrevePage, NaoEncontradoPage } from '@/pages/EmBrevePage'

// Cada tela é carregada sob demanda (code splitting): o login abre sem baixar o sistema inteiro.
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const InicioPage = lazy(() => import('@/pages/InicioPage').then((m) => ({ default: m.InicioPage })))
const BuscaPage = lazy(() => import('@/pages/BuscaPage').then((m) => ({ default: m.BuscaPage })))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const RelatoriosPage = lazy(() => import('@/features/relatorios/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })))
const ConfiguracoesPage = lazy(() => import('@/features/configuracoes/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })))
const ClientesPage = lazy(() => import('@/features/clientes/ClientesPage').then((m) => ({ default: m.ClientesPage })))
const ClienteFormPage = lazy(() => import('@/features/clientes/ClienteFormPage').then((m) => ({ default: m.ClienteFormPage })))
const ProdutosPage = lazy(() => import('@/features/produtos/ProdutosPage').then((m) => ({ default: m.ProdutosPage })))
const ProdutoFormPage = lazy(() => import('@/features/produtos/ProdutoFormPage').then((m) => ({ default: m.ProdutoFormPage })))
const UsuariosPage = lazy(() => import('@/features/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })))
const EstoquePage = lazy(() => import('@/features/estoque/EstoquePage').then((m) => ({ default: m.EstoquePage })))
const MovimentacoesPage = lazy(() => import('@/features/estoque/MovimentacoesPage').then((m) => ({ default: m.MovimentacoesPage })))
const LotesPage = lazy(() => import('@/features/estoque/LotesPage').then((m) => ({ default: m.LotesPage })))
const InventariosPage = lazy(() => import('@/features/inventario/InventariosPage').then((m) => ({ default: m.InventariosPage })))
const InventarioPage = lazy(() => import('@/features/inventario/InventarioPage').then((m) => ({ default: m.InventarioPage })))
const OrcamentosPage = lazy(() => import('@/features/orcamentos/OrcamentosPage').then((m) => ({ default: m.OrcamentosPage })))
const OrcamentoFormPage = lazy(() => import('@/features/orcamentos/OrcamentoFormPage').then((m) => ({ default: m.OrcamentoFormPage })))
const VendasPage = lazy(() => import('@/features/vendas/VendasPage').then((m) => ({ default: m.VendasPage })))
const VendaFormPage = lazy(() => import('@/features/vendas/VendaFormPage').then((m) => ({ default: m.VendaFormPage })))
const DocumentoImpressao = lazy(() => import('@/features/comercial/DocumentoImpressao').then((m) => ({ default: m.DocumentoImpressao })))
const FornecedoresPage = lazy(() => import('@/features/fornecedores/FornecedoresPage').then((m) => ({ default: m.FornecedoresPage })))
const FornecedorFormPage = lazy(() => import('@/features/fornecedores/FornecedorFormPage').then((m) => ({ default: m.FornecedorFormPage })))
const ComprasPage = lazy(() => import('@/features/compras/ComprasPage').then((m) => ({ default: m.ComprasPage })))
const PedidoCompraPage = lazy(() => import('@/features/compras/PedidoCompraPage').then((m) => ({ default: m.PedidoCompraPage })))
const CotacaoPage = lazy(() => import('@/features/compras/CotacaoPage').then((m) => ({ default: m.CotacaoPage })))
const RecebimentoPage = lazy(() => import('@/features/compras/RecebimentoPage').then((m) => ({ default: m.RecebimentoPage })))
const FinanceiroPage = lazy(() => import('@/features/financeiro/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })))
const ContasPage = lazy(() => import('@/features/financeiro/ContasPage').then((m) => ({ default: m.ContasPage })))
const CaixaPage = lazy(() => import('@/features/financeiro/CaixaPage').then((m) => ({ default: m.CaixaPage })))
const SeparacaoPage = lazy(() => import('@/features/logistica/SeparacaoPage').then((m) => ({ default: m.SeparacaoPage })))
const SeparacaoDetalhePage = lazy(() => import('@/features/logistica/SeparacaoDetalhePage').then((m) => ({ default: m.SeparacaoDetalhePage })))
const EntregasPage = lazy(() => import('@/features/logistica/EntregasPage').then((m) => ({ default: m.EntregasPage })))
const EntregaPage = lazy(() => import('@/features/logistica/EntregaPage').then((m) => ({ default: m.EntregaPage })))
const RomaneioPage = lazy(() => import('@/features/logistica/RomaneioPage').then((m) => ({ default: m.RomaneioPage })))

/** Página inicial: Dashboard para quem tem acesso; senão, atalhos do Início. */
function PaginaInicial() {
  const { pode } = useAuth()
  return pode('dashboard') ? <DashboardPage /> : <InicioPage />
}

const P = RequirePermission

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

          <Route element={<RequireAuth />}>
            {/* Impressão / PDF (sem menu lateral) */}
            <Route path="orcamentos/:id/imprimir" element={<P modulo="orcamentos"><DocumentoImpressao tipo="orcamento" /></P>} />
            <Route path="vendas/:id/imprimir" element={<P modulo="vendas"><DocumentoImpressao tipo="venda" /></P>} />
            <Route path="entregas/romaneio" element={<P modulo="entregas"><RomaneioPage /></P>} />

            <Route element={<AppLayout />}>
              <Route index element={<PaginaInicial />} />
              <Route path="dashboard" element={<P modulo="dashboard"><DashboardPage /></P>} />
              <Route path="relatorios" element={<RelatoriosPage />} />
              <Route path="busca" element={<BuscaPage />} />
              <Route path="configuracoes" element={<P modulo="configuracoes"><ConfiguracoesPage /></P>} />

              <Route path="clientes" element={<P modulo="clientes"><ClientesPage /></P>} />
              <Route path="clientes/novo" element={<P modulo="clientes" acao="criar"><ClienteFormPage /></P>} />
              <Route path="clientes/:id" element={<P modulo="clientes"><ClienteFormPage /></P>} />
              <Route path="produtos" element={<P modulo="produtos"><ProdutosPage /></P>} />
              <Route path="produtos/novo" element={<P modulo="produtos" acao="criar"><ProdutoFormPage /></P>} />
              <Route path="produtos/:id" element={<P modulo="produtos"><ProdutoFormPage /></P>} />
              <Route path="usuarios" element={<P modulo="usuarios"><UsuariosPage /></P>} />

              <Route path="estoque" element={<P modulo="estoque"><EstoquePage /></P>} />
              <Route path="movimentacoes" element={<P modulo="movimentacoes"><MovimentacoesPage /></P>} />
              <Route path="lotes" element={<P modulo="lotes"><LotesPage /></P>} />
              <Route path="inventario" element={<P modulo="inventario"><InventariosPage /></P>} />
              <Route path="inventario/:id" element={<P modulo="inventario"><InventarioPage /></P>} />

              <Route path="orcamentos" element={<P modulo="orcamentos"><OrcamentosPage /></P>} />
              <Route path="orcamentos/novo" element={<P modulo="orcamentos" acao="criar"><OrcamentoFormPage /></P>} />
              <Route path="orcamentos/:id" element={<P modulo="orcamentos"><OrcamentoFormPage /></P>} />
              <Route path="vendas" element={<P modulo="vendas"><VendasPage /></P>} />
              <Route path="vendas/nova" element={<P modulo="vendas" acao="criar"><VendaFormPage /></P>} />
              <Route path="vendas/:id" element={<P modulo="vendas"><VendaFormPage /></P>} />

              <Route path="fornecedores" element={<P modulo="fornecedores"><FornecedoresPage /></P>} />
              <Route path="fornecedores/novo" element={<P modulo="fornecedores" acao="criar"><FornecedorFormPage /></P>} />
              <Route path="fornecedores/:id" element={<P modulo="fornecedores"><FornecedorFormPage /></P>} />
              <Route path="compras" element={<P modulo="compras"><ComprasPage /></P>} />
              <Route path="compras/pedidos/novo" element={<P modulo="compras" acao="criar"><PedidoCompraPage /></P>} />
              <Route path="compras/pedidos/:id" element={<P modulo="compras"><PedidoCompraPage /></P>} />
              <Route path="compras/cotacoes/nova" element={<P modulo="compras" acao="criar"><CotacaoPage /></P>} />
              <Route path="compras/cotacoes/:id" element={<P modulo="compras"><CotacaoPage /></P>} />
              <Route path="compras/recebimentos/novo" element={<P modulo="compras"><RecebimentoPage /></P>} />
              <Route path="compras/recebimentos/:id" element={<P modulo="compras"><RecebimentoPage /></P>} />

              <Route path="financeiro" element={<P modulo="financeiro"><FinanceiroPage /></P>} />
              <Route path="contas" element={<P modulo="contas"><ContasPage /></P>} />
              <Route path="caixa" element={<P modulo="caixa"><CaixaPage /></P>} />

              <Route path="separacao" element={<P modulo="separacao"><SeparacaoPage /></P>} />
              <Route path="separacao/:id" element={<P modulo="separacao"><SeparacaoDetalhePage /></P>} />
              <Route path="entregas" element={<P modulo="entregas"><EntregasPage /></P>} />
              <Route path="entregas/:id" element={<P modulo="entregas"><EntregaPage /></P>} />

              {ITENS_EM_BREVE.map((item) => (
                <Route key={item.rota} path={item.rota.slice(1)} element={<EmBrevePage item={item} />} />
              ))}
              <Route path="*" element={<NaoEncontradoPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
