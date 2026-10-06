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
 *   the cache once. Kept per URL for the next export.
 * - Outfit: Google Fonts' stylesheet is cross-origin, so its rules can't be
 *   read from the page; its CSS is fetched (CORS), cut to the latin subsets
 *   and one face per font file, with the woff2 files inlined.
 *
 * Canvas pixels never touch another origin, so the canvas isn't tainted
 * and toBlob works.
 */

import { KEEP_SUBSETS, fontFaceRules, parseGoogleFontCss } from './font-embed'

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Data URLs by image URL; splash art is ~0.8 MB of text, so only the latest few are kept. */
const images = new Map<string, Promise<string | null>>()
const MAX_IMAGES = 48

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
  let pending = images.get(url)
  if (!pending) {
    pending = fetchImage(url, 'default')
      .catch(() => fetchImage(url, 'reload'))
      .catch(() => {
        images.delete(url) // the next export asks again
        return null
      })
    images.set(url, pending)
    if (images.size > MAX_IMAGES) images.delete(images.keys().next().value!)
  }
  return pending
}

let fontCss: Promise<string | null> | null = null

/** The page's Google Fonts (Outfit) as inlined @font-face rules; null when unavailable. */
function pageFontCss(): Promise<string | null> {
  fontCss ??= (async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="stylesheet"][href*="fonts.googleapis.com"]',
    )
    if (!link) return null
    const css = await (await fetch(link.href, { mode: 'cors', credentials: 'omit' })).text()
    const faces = parseGoogleFontCss(css).filter((f) => KEEP_SUBSETS.has(f.subset))
    const dataUrls = new Map<string, string>()
    await Promise.all(
      [...new Set(faces.map((f) => f.url))].map(async (url) => {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
        if (response.ok) dataUrls.set(url, await blobToDataUrl(await response.blob()))
      }),
    )
    return fontFaceRules(faces, dataUrls) || null
  })().catch(() => {
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
  const [{ domToBlob }, cssText] = await Promise.all([import('modern-screenshot'), pageFontCss()])
  let missing = 0
  const blob = await domToBlob(node, {
    width,
    height,
    scale,
    type: 'image/png',
    font: cssText ? { cssText } : false,
    fetchFn: async (url) => {
      if (url.startsWith('data:')) return url
      const data = await imageDataUrl(url)
      if (data) return data
      missing++
      return TRANSPARENT_PIXEL
    },
  })
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
