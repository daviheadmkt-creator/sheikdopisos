/* Service worker do SHEIK DOS PISOS — ERP (PWA).
 *
 * Guarda em cache SOMENTE a "casca" do aplicativo (HTML, JS, CSS, ícones e fontes), para abrir rápido
 * e funcionar como app instalado. Dados do sistema (Supabase), login e /api NUNCA são guardados:
 * sempre vêm do servidor, protegendo informações de clientes (LGPD) e evitando números desatualizados.
 */
const VERSAO = 'v1'
const CACHE_CASCA = `sheik-casca-${VERSAO}`
const CACHE_ARQUIVOS = `sheik-arquivos-${VERSAO}`
const MAX_ARQUIVOS = 80
const CASCA = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/logo-sheik-512.jpg', '/favicon.png']
const FONTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_CASCA)
      .then((c) => c.addAll(CASCA))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('sheik-') && !n.endsWith(VERSAO)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

async function limitar(nomeCache) {
  const cache = await caches.open(nomeCache)
  const chaves = await cache.keys()
  for (const k of chaves.slice(0, Math.max(0, chaves.length - MAX_ARQUIVOS))) await cache.delete(k)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const mesmaOrigem = url.origin === self.location.origin

  // Dados, autenticação e funções de servidor: nunca interceptar
  if (mesmaOrigem && url.pathname.startsWith('/api/')) return
  if (!mesmaOrigem && !FONTES.includes(url.origin)) return

  // Telas (navegação): rede primeiro, para sempre receber a versão mais nova; sem rede, abre a casca
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone()
            caches.open(CACHE_CASCA).then((c) => c.put('/', copia))
          }
          return resp
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Arquivos estáticos com hash no nome (imutáveis), ícones e fontes: cache primeiro
  event.respondWith(
    caches.match(req).then(
      (emCache) =>
        emCache ||
        fetch(req).then((resp) => {
          if (resp.ok || resp.type === 'opaque') {
            const copia = resp.clone()
            caches
              .open(CACHE_ARQUIVOS)
              .then((c) => c.put(req, copia))
              .then(() => limitar(CACHE_ARQUIVOS))
          }
          return resp
        }),
    ),
  )
})
