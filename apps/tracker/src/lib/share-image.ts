/**
 * PNG export of a laid-out DOM node (the character share card), with
 * modern-screenshot: it clones the node with its computed styles into an
 * SVG <foreignObject> and draws that on a canvas. An SVG drawn as an image
 * can load nothing by itself, so everything it shows is inlined first:
 *
 * - Images, through `fetchFn`, as data URLs: a CORS fetch, which both game
 *   image hosts answer (static.nanoka.cc any origin; gi-cdn.475.dev this
 *   site's origin, which a CORS request sends) and which the service worker
 *   serves from its CORS-fetched cache. A copy the HTTP cache kept from a
 *   plain <img> load may lack the CORS header, so a failure retries past
 *   the cache once. Kept per URL for the next export (a bounded LRU).
 * - Outfit: Google Fonts' stylesheet is cross-origin, so its rules can't be
 *   read from the page; its CSS is fetched (CORS), cut to the latin subsets
 *   and one face per font file, with the woff2 files inlined.
 *
 * Canvas pixels never touch another origin, so the canvas isn't tainted
 * and toBlob works.
 */

import { KEEP_SUBSETS, fontFaceRules, parseGoogleFontCss } from './font-embed'
import { Lru } from './lru'

/** How many times the SVG picture is drawn again (150 ms apart) before the last draw is kept. */
const REDRAWS = 2

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * Inlined images by URL, kept in memory across exports (a second export of
 * the same or a neighbouring character fetches only what is new): a pending
 * fetch weighs 0, a data URL its length; the oldest go past ~24 MB of text
 * (splash art is ~0.8 MB each, the rest a few KB), so a dozen characters.
 */
const inlined = new Lru<string, { data: Promise<string | null>; size: number }>(
  600,
  24_000_000,
  (entry) => entry.size,
)
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

async function fetchImage(url: string, cache: RequestCache): Promise<string> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return blobToDataUrl(await response.blob())
}

/** An image as a data URL via a CORS fetch; null when it can't be had (not remembered). */
export function imageDataUrl(url: string): Promise<string | null> {
  const cached = inlined.get(url)
  if (cached) return cached.data
  const data = fetchImage(url, 'default')
    .catch(() => fetchImage(url, 'reload'))
    .then(
      (dataUrl) => {
        // Weigh it now that its size is known (only if it is still the entry).
        if (inlined.get(url)?.data === data) inlined.set(url, { data, size: dataUrl.length })
        return dataUrl
      },
      () => {
        inlined.delete(url) // the next export asks again
        return null
      },
    )
  inlined.set(url, { data, size: 0 })
  return data
}

let fontCss: Promise<string | null> | null = null

/** A CORS fetch, once more past the HTTP cache if the first one fails. */
async function fetchOk(url: string): Promise<Response> {
  for (const cache of ['default', 'reload'] as const) {
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache })
      if (response.ok) return response
    } catch {
      // try again past the cache
    }
  }
  throw new Error(`fetch failed: ${url}`)
}

/**
 * The page's Google Fonts (Outfit) as inlined @font-face rules; null when
 * unavailable. Only a complete answer is kept: a failure is asked again on
 * the next export (a PNG in a fallback font is laid out differently).
 */
function pageFontCss(): Promise<string | null> {
  fontCss ??= (async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="stylesheet"][href*="fonts.googleapis.com"]',
    )
    if (!link) return null
    const css = await (await fetchOk(link.href)).text()
    const faces = parseGoogleFontCss(css).filter((f) => KEEP_SUBSETS.has(f.subset))
    const dataUrls = new Map<string, string>()
    await Promise.all(
      [...new Set(faces.map((f) => f.url))].map(async (url) => {
        dataUrls.set(url, await blobToDataUrl(await (await fetchOk(url)).blob()))
      }),
    )
    const rules = fontFaceRules(faces, dataUrls)
    if (!rules) throw new Error('no font faces')
    return rules
  })().catch((error: unknown) => {
    console.warn('Share card: fonts not embedded', error)
    fontCss = null
    return null
  })
  return fontCss
}

export interface RenderedImage {
  blob: Blob
  /** Images that couldn't be fetched (drawn empty). */
  missing: number
}

/**
 * Draws `node` (laid out at `width` × `height` CSS pixels, untransformed
 * itself) into a PNG `scale` times that size.
 */
export async function renderPng(
  node: HTMLElement,
  { width, height, scale }: { width: number; height: number; scale: number },
): Promise<RenderedImage> {
  const [{ createContext, domToBlob }, cssText] = await Promise.all([
    import('modern-screenshot'),
    pageFontCss(),
  ])
  let missing = 0
  const context = await createContext(node, {
    autoDestruct: true, // its sandbox goes after the draw, as domToBlob(node) does
    width,
    height,
    scale,
    type: 'image/png',
    font: cssText ? { cssText } : false,
    // The SVG picture can come up before its inlined fonts are ready (Chrome
    // then draws it in a fallback font): it is drawn again after a pause, and
    // the last draw is the PNG (modern-screenshot does this on Safari and Firefox).
    drawImageInterval: 150,
    fetchFn: async (url) => {
      if (url.startsWith('data:')) return url
      const data = await imageDataUrl(url)
      if (data) return data
      missing++
      return TRANSPARENT_PIXEL
    },
  })
  context.drawImageCount = Math.max(context.drawImageCount, REDRAWS)
  const blob = await domToBlob(context)
  return { blob, missing }
}

/** Whether this browser can put a PNG on the clipboard. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'
}

/**
 * Copies a PNG. Takes the promise, not the blob: Safari only allows the
 * write while the click is current, so the item must be made in the click.
 */
export function copyPng(blob: Promise<Blob>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Whether the system share sheet takes files (phones, some desktops). */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export function sharePng(blob: Blob, filename: string, title: string): Promise<void> {
  return navigator.share({ files: [new File([blob], filename, { type: 'image/png' })], title })
}
