import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

/**
 * Endereços ocultos: o sistema navega em memória (MemoryRouter) e a barra do navegador
 * mostra sempre a raiz do site. Para não prejudicar o uso:
 *  - o histórico de telas da aba é guardado (sessionStorage) e restaurado ao atualizar (F5);
 *  - o botão Voltar do navegador volta para a tela anterior dentro do sistema;
 *  - links diretos (recuperação de senha, "abrir em nova aba") abrem a tela correta e depois
 *    o endereço é limpo.
 * Observação: isto é apenas apresentação. A segurança é garantida no servidor (RLS e permissões).
 */
const CHAVE = 'sheik.historico'
const LIMITE = 50

interface Historico {
  entradas: string[]
  indice: number
}

function ler(): Historico | null {
  try {
    const h = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null') as Historico | null
    return h && Array.isArray(h.entradas) && h.entradas.length && h.indice >= 0 && h.indice < h.entradas.length ? h : null
  } catch {
    return null
  }
}
function gravar(h: Historico) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(h))
  } catch {
    /* navegação continua funcionando sem a restauração */
  }
}

/** Histórico inicial: link direto > histórico salvo da aba (F5) > início. Limpa o endereço da barra. */
export function historicoInicial(): Historico {
  const { pathname, search, hash } = window.location
  // mantém o #hash (ex.: tokens de recuperação de senha, lidos pelo Supabase)
  if (pathname !== '/' || search) window.history.replaceState(window.history.state, '', `/${hash}`)
  const h: Historico = pathname !== '/' ? { entradas: [pathname + search], indice: 0 } : ler() ?? { entradas: ['/'], indice: 0 }
  gravar(h)
  return h
}

/** Mantém o histórico salvo em dia e liga o botão Voltar do navegador ao histórico interno. */
export function SincronizarNavegacao() {
  const location = useLocation()
  const navigate = useNavigate()
  const tipo = useNavigationType()
  const primeira = useRef(true)

  useEffect(() => {
    const atual = location.pathname + location.search
    if (primeira.current) {
      primeira.current = false
      return
    }
    const h = ler() ?? { entradas: [atual], indice: 0 }
    if (tipo === 'PUSH') {
      h.entradas = [...h.entradas.slice(0, h.indice + 1), atual].slice(-LIMITE)
      h.indice = h.entradas.length - 1
      window.history.pushState({ erp: true }, '', '/')
    } else if (tipo === 'REPLACE') {
      h.entradas[h.indice] = atual
    } else {
      h.indice = Math.max(0, h.indice - 1)
    }
    gravar(h)
  }, [location, tipo])

  useEffect(() => {
    const voltar = () => {
      if ((ler()?.indice ?? 0) > 0) navigate(-1)
    }
    window.addEventListener('popstate', voltar)
    return () => window.removeEventListener('popstate', voltar)
  }, [navigate])

  return null
}
