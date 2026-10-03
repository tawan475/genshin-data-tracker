/* Service worker, emitted as /sw.js by the `service-worker` plugin in vite.config.ts,
 * which replaces the two placeholders below. Plain JS on purpose: it runs as-is.
 *
 * - One cache per build: install precaches the hashed build output, activate
 *   deletes every older build's cache. A new version waits until the page asks
 *   it to take over (the "update available" banner), so a tab never runs a mix.
 * - Navigations are network-first (a deploy always serves fresh HTML), falling
 *   back to the cached app shell offline.
 * - /api is never cached: account data on a shared device is readable by the
 *   next person who opens it.
 * - Game images from the Enka CDN never change for a given URL, so they are
 *   kept cache-first in their own bounded cache across builds.
 */

const BUILD = '__BUILD__'
const PRECACHE = __PRECACHE__
const CACHE = `gdt-${BUILD}`
const IMAGES = 'gdt-enka'
const MAX_IMAGES = 800

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith('gdt-') && key !== CACHE && key !== IMAGES).map((key) => caches.delete(key)),
      )
      await self.registration.navigationPreload?.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

async function trimImages() {
  const cache = await caches.open(IMAGES)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await cache.delete(keys[i])
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone())
    if (cacheName === IMAGES) trimImages()
  }
  return response
}

async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse
    if (preloaded) return preloaded
    return await fetch(event.request)
  } catch {
    const shell = await caches.match('/', { ignoreSearch: true })
    return shell ?? new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.hostname === 'enka.network' && url.pathname.startsWith('/ui/')) {
    event.respondWith(cacheFirst(request, IMAGES))
    return
  }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event))
    return
  }
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE))
  }
})
