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
 * - Game images come from static.nanoka.cc, or from our own /gi/ for names
 *   that host lacks (src/lib/assets.ts), and are kept cache-first in their own
 *   bounded cache across builds. They are fetched in CORS mode (the host
 *   allows any origin), so only real image responses are kept, never an error
 *   page, the SPA fallback page or an opaque response (which would also count
 *   megabytes against the storage quota). Bump IMAGES' version to drop them.
 */

const BUILD = '__BUILD__'
const PRECACHE = __PRECACHE__
const CACHE = `gdt-${BUILD}`
const IMAGE_HOST = 'static.nanoka.cc'
/** Our own copies of images the host lacks (public/gi/). */
const OWN_IMAGES = '/gi/'
const IMAGES = 'gdt-images-v2'
const MAX_IMAGES = 2500
const KEEP = [IMAGES]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('gdt-') && key !== CACHE && !KEEP.includes(key))
          .map((key) => caches.delete(key)),
      )
      await self.registration.navigationPreload?.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

/** Drops the oldest entries beyond `max` (keys come back in insertion order). */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

/** Game images: cache-first by URL, keeping only `image/*` answers, at most MAX_IMAGES. */
async function cacheImage(request) {
  const cache = await caches.open(IMAGES)
  const hit = await cache.match(request.url)
  if (hit) return hit
  let response
  try {
    response = await fetch(request.url, { mode: 'cors', credentials: 'omit' })
  } catch {
    // Offline, or the host stopped allowing CORS: pass the page's own request through.
    return fetch(request)
  }
  if (response.ok && (response.headers.get('content-type') ?? '').startsWith('image/')) {
    await cache.put(request.url, response.clone())
    trim(IMAGES, MAX_IMAGES)
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
    return (
      shell ?? new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
    )
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.hostname === IMAGE_HOST) {
    event.respondWith(cacheImage(request))
    return
  }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith(OWN_IMAGES)) {
    event.respondWith(cacheImage(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event))
    return
  }
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE))
  }
})
