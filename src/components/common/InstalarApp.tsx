import { useEffect, useRef, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { conviteDisponivel, ehDispositivoMovel, ehIOS, emModoApp, instalar, observarConvite } from '@/lib/pwa'

const CHAVE = 'sheik.pwa.dispensado'
const DIAS_SILENCIO = 30

function dispensadoRecentemente() {
  try {
    const t = Number(localStorage.getItem(CHAVE) ?? 0)
    return Date.now() - t < DIAS_SILENCIO * 864e5
  } catch {
    return false
  }
}

/** Aviso para instalar o sistema como aplicativo (somente celular/tablet, fora do modo app). */
export function InstalarApp() {
  const [, atualizar] = useState(0)
  const [fechado, setFechado] = useState(dispensadoRecentemente)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => observarConvite(() => atualizar((n) => n + 1)), [])

  const ios = ehIOS()
  const visivel = !fechado && !emModoApp() && ehDispositivoMovel() && (ios || conviteDisponivel())

  // Reserva espaço no fim da página para o aviso não cobrir botões (ex.: "Entrar no sistema")
  useEffect(() => {
    const el = caixa.current
    if (!visivel || !el) return
    const ajustar = () => {
      document.body.style.paddingBottom = `${el.offsetHeight + 24}px`
    }
    ajustar()
    const obs = new ResizeObserver(ajustar)
    obs.observe(el)
    return () => {
      obs.disconnect()
      document.body.style.paddingBottom = ''
    }
  }, [visivel])

  if (!visivel) return null

  const dispensar = () => {
    try {
      localStorage.setItem(CHAVE, String(Date.now()))
    } catch {
      /* preferência apenas */
    }
    setFechado(true)
  }

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-label="Instalar aplicativo"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-primary/40 bg-sidebar p-4 text-white shadow-2xl print:hidden"
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-primary">Instale o Sheik ERP</p>
          {ios ? (
            <p className="mt-1 text-sm opacity-90">
              Toque em <Share className="inline h-4 w-4 align-text-bottom" aria-label="Compartilhar" /> e depois em{' '}
              <span className="whitespace-nowrap font-medium">
                <SquarePlus className="inline h-4 w-4 align-text-bottom" /> Adicionar à Tela de Início
              </span>
              .
            </p>
          ) : (
            <p className="mt-1 text-sm opacity-90">Abra o sistema direto da tela inicial, em tela cheia, como um aplicativo.</p>
          )}
        </div>
        <button type="button" onClick={dispensar} className="rounded p-1 opacity-70 hover:opacity-100" aria-label="Agora não">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!ios && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={dispensar}>
            Agora não
          </Button>
          <Button size="sm" onClick={() => void instalar()}>
            <Download className="h-4 w-4" /> Instalar
          </Button>
        </div>
      )}
    </div>
  )
}
