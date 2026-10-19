// Service worker PRUDENTE de la PWA (Fase 4): su único trabajo es
// habilitar la instalación y acelerar los assets estáticos versionados
// de /_nuxt/ (cache-first, son inmutables por hash). TODO lo demás va
// siempre a la red: jamás se cachean respuestas de /api/, ni HTML, ni
// contenido autenticado.
const CACHE = 'comunidad-static-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  const isVersionedAsset = url.origin === self.location.origin
    && (url.pathname.startsWith('/_nuxt/') || url.pathname.startsWith('/icons/'))
  if (!isVersionedAsset) return // red directa, sin interceptar
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(event.request)
    if (hit) return hit
    const res = await fetch(event.request)
    if (res.ok) cache.put(event.request, res.clone())
    return res
  })())
})
