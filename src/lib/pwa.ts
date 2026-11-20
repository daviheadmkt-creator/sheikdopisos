/** PWA: registro do service worker e captura do convite de instalação (Android/Chrome/Edge). */

export interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let convite: EventoInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function iniciarPwa() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // mostramos nosso próprio aviso, no momento certo
    convite = e as EventoInstalacao
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    convite = null
    avisar()
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* sem service worker o sistema funciona normalmente, só não fica instalável */
      })
    })
  }
}

export const conviteDisponivel = () => convite !== null

export async function instalar(): Promise<boolean> {
  if (!convite) return false
  await convite.prompt()
  const { outcome } = await convite.userChoice
  convite = null
  avisar()
  return outcome === 'accepted'
}

export function observarConvite(f: () => void) {
  ouvintes.add(f)
  return () => {
    ouvintes.delete(f)
  }
}

/** Já está aberto como aplicativo instalado? */
export function emModoApp(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone/iPad no Safari: a instalação é manual (Compartilhar → Adicionar à Tela de Início). */
export function ehIOS(ua = navigator.userAgent, toque = navigator.maxTouchPoints): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && toque > 1) // iPadOS se identifica como Mac
}

/** Celular ou tablet (tela de toque). */
export function ehDispositivoMovel(ua = navigator.userAgent, toque = navigator.maxTouchPoints): boolean {
  return /android|iphone|ipad|ipod|mobile|tablet/i.test(ua) || ehIOS(ua, toque)
}
