import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  FileText,
  Globe,
  Home,
  Landmark,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackageCheck,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react'

export interface NavItem {
  rota: string
  label: string
  icon: LucideIcon
  /** módulo de permissão; ausente = sempre visível */
  modulo?: string
  /** fase em que o módulo é entregue */
  fase: number
}

export interface NavGrupo {
  titulo: string
  itens: NavItem[]
}

/** Fase já liberada no sistema. Itens com fase maior aparecem como "em breve". */
export const FASE_ATUAL = 8

export const NAV: NavGrupo[] = [
  {
    titulo: 'Principal',
    itens: [
      { rota: '/', label: 'Início', icon: Home, fase: 1 },
      { rota: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, modulo: 'dashboard', fase: 7 },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      { rota: '/clientes', label: 'Clientes', icon: Users, modulo: 'clientes', fase: 1 },
      { rota: '/orcamentos', label: 'Orçamentos', icon: FileText, modulo: 'orcamentos', fase: 3 },
      { rota: '/vendas', label: 'Vendas', icon: ShoppingCart, modulo: 'vendas', fase: 3 },
      { rota: '/loja', label: 'Pedidos da Loja', icon: Globe, modulo: 'vendas', fase: 8 },
    ],
  },
  {
    titulo: 'Produtos e Estoque',
    itens: [
      { rota: '/produtos', label: 'Produtos', icon: Package, modulo: 'produtos', fase: 1 },
      { rota: '/estoque', label: 'Estoque', icon: Warehouse, modulo: 'estoque', fase: 2 },
      { rota: '/movimentacoes', label: 'Movimentações', icon: ArrowLeftRight, modulo: 'movimentacoes', fase: 2 },
      { rota: '/lotes', label: 'Lotes e Tonalidades', icon: Layers, modulo: 'lotes', fase: 2 },
      { rota: '/inventario', label: 'Inventário', icon: ClipboardCheck, modulo: 'inventario', fase: 2 },
    ],
  },
  {
    titulo: 'Compras',
    itens: [
      { rota: '/fornecedores', label: 'Fornecedores', icon: Boxes, modulo: 'fornecedores', fase: 4 },
      { rota: '/compras', label: 'Compras', icon: ShoppingBag, modulo: 'compras', fase: 4 },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { rota: '/financeiro', label: 'Financeiro', icon: Landmark, modulo: 'financeiro', fase: 5 },
      { rota: '/contas', label: 'Contas a Pagar/Receber', icon: Receipt, modulo: 'contas', fase: 5 },
      { rota: '/caixa', label: 'Caixa', icon: Wallet, modulo: 'caixa', fase: 5 },
    ],
  },
  {
    titulo: 'Logística',
    itens: [
      { rota: '/separacao', label: 'Separação de Pedidos', icon: PackageCheck, modulo: 'separacao', fase: 6 },
      { rota: '/entregas', label: 'Entregas', icon: Truck, modulo: 'entregas', fase: 6 },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { rota: '/relatorios', label: 'Relatórios', icon: BarChart3, modulo: 'relatorios', fase: 7 },
      { rota: '/usuarios', label: 'Usuários e Permissões', icon: ShieldCheck, modulo: 'usuarios', fase: 1 },
      { rota: '/configuracoes', label: 'Configurações', icon: Settings, modulo: 'configuracoes', fase: 8 },
    ],
  },
]

export const TODOS_ITENS = NAV.flatMap((g) => g.itens)
export const ITENS_EM_BREVE = TODOS_ITENS.filter((i) => i.fase > FASE_ATUAL)
