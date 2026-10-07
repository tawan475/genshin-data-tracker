import { Lru } from './lru'

/**
 * Game images fetched and decoded ahead of time, so the next character's
 * art shows at once. Each preload is an `Image` (no CORS, like the page's
 * own <img>s, so they share the browser's cache entry; the service worker
 * keeps the bytes cache-first) held in a small LRU, which keeps its decoded
 * picture in memory; the oldest drop past `MAX_PRELOADS` (a few characters'
 * worth), so a phone on a data plan never fetches more than the neighbours.
 * `isDecoded` lets an <img> skip its fade-in when the picture is ready.
 */

const MAX_PRELOADS = 120
const MAX_DECODED = 600

/** What a preload needs of an `Image` (typed here: the helpers' tests build without the DOM). */
interface PreloadImage {
  src: string
  decoding: string
  decode(): Promise<void>
}
const ImageCtor = (globalThis as { Image?: new () => PreloadImage }).Image

const preloads = new Lru<string, PreloadImage>(MAX_PRELOADS)
const decoded = new Lru<string, true>(MAX_DECODED)

/**
 * Starts fetching and decoding `urls` ('' skipped); already preloaded ones
 * just move up. Resolves once every one has decoded or failed.
 */
export function preloadImages(urls: readonly string[]): Promise<void> {
  if (!ImageCtor) return Promise.resolve()
  const pending: Promise<unknown>[] = []
  for (const url of urls) {
    if (!url) continue
    const known = preloads.get(url)
    if (known) {
      if (!decoded.has(url)) pending.push(known.decode().catch(() => undefined))
      continue
    }
    const img = new ImageCtor()
    img.decoding = 'async'
    img.src = url
    preloads.set(url, img)
    pending.push(
      img.decode().then(
        () => markDecoded(url),
        () => preloads.delete(url), // not an image (yet): try again next time
      ),
    )
  }
  return Promise.all(pending).then(() => undefined)
}

/** Whether `url` has been loaded and decoded on this page. */
export function isDecoded(url: string): boolean {
  return !!url && decoded.has(url)
}

export function markDecoded(url: string): void {
  if (url) decoded.set(url, true)
}
