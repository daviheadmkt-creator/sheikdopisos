import fs from 'node:fs'
import path from 'node:path'
import { ehDispositivoMovel, ehIOS } from './pwa'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
  tabletAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
}

describe('PWA — detecção de dispositivo', () => {
  it('reconhece iPhone e iPad (que se apresenta como Mac com toque)', () => {
    expect(ehIOS(UA.iphone, 5)).toBe(true)
    expect(ehIOS(UA.ipadOS, 5)).toBe(true)
    expect(ehIOS(UA.ipadOS, 0)).toBe(false) // Mac de verdade
  })

  it('mostra o convite em celular e tablet, não no computador', () => {
    expect(ehDispositivoMovel(UA.android, 5)).toBe(true)
    expect(ehDispositivoMovel(UA.tabletAndroid, 5)).toBe(true)
    expect(ehDispositivoMovel(UA.iphone, 5)).toBe(true)
    expect(ehDispositivoMovel(UA.windows, 0)).toBe(false)
  })
})

describe('PWA — manifesto', () => {
  const pasta = path.join(__dirname, '..', '..', 'assets')
  const m = JSON.parse(fs.readFileSync(path.join(pasta, 'manifest.webmanifest'), 'utf8'))

  it('é instalável: standalone, start_url e ícones 192/512 + maskable existentes', () => {
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    const tamanhos = m.icons.map((i: { sizes: string }) => i.sizes)
    expect(tamanhos).toContain('192x192')
    expect(tamanhos).toContain('512x512')
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)
    for (const i of m.icons) expect(fs.existsSync(path.join(pasta, i.src.replace(/^\//, '')))).toBe(true)
  })

  it('o service worker nunca guarda dados do sistema nem /api', () => {
    const sw = fs.readFileSync(path.join(pasta, 'sw.js'), 'utf8')
    expect(sw).toContain("url.pathname.startsWith('/api/')")
    expect(sw).toContain("req.method !== 'GET'")
    expect(sw).toMatch(/!mesmaOrigem && !FONTES\.includes/)
  })
})
