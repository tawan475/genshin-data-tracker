/**
 * Byte ranges for the static assets that need them: the landing page's demo
 * videos (`/landing/*.mp4`). Workers static assets answer every request whole
 * (200, no Accept-Ranges), and Safari plays an MP4 only from a server that
 * answers `Range` with 206, so these come through the Worker (wrangler.jsonc
 * `run_worker_first`), which slices the asset itself.
 */

/** The site's pictures' caching (public/_headers `/landing/*`). */
export const LANDING_CACHE = 'public, max-age=15552000, stale-while-revalidate=31536000'

/** One `bytes=` range of a body of `size` bytes: inclusive bounds, or 'invalid' (416); null = whole. */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  // Several ranges, or another unit: answer whole (allowed by RFC 9110).
  if (!match) return header.includes(',') || !header.startsWith('bytes=') ? null : 'invalid'
  const [, from, to] = match
  if (!from && !to) return 'invalid'
  let start: number
  let end: number
  if (!from) {
    // The last N bytes.
    const suffix = Number(to)
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(from)
    end = to ? Math.min(Number(to), size - 1) : size - 1
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/** The asset's answer, sliced to the request's range (206), with Accept-Ranges either way. */
export async function withRange(request: Request, asset: Response): Promise<Response> {
  if (asset.status !== 200 || !asset.body) return asset
  const headers = new Headers(asset.headers)
  headers.set('Accept-Ranges', 'bytes')
  // public/_headers' rule for /landing/*, in case the binding's answer lacks it.
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', LANDING_CACHE)
  const range = request.method === 'GET' ? request.headers.get('Range') : null
  if (!range) return new Response(asset.body, { status: 200, headers })
  const body = await asset.arrayBuffer()
  const parsed = parseRange(range, body.byteLength)
  if (parsed === null) return new Response(body, { status: 200, headers })
  if (parsed === 'invalid') {
    headers.set('Content-Range', `bytes */${body.byteLength}`)
    headers.delete('Content-Length')
    return new Response(null, { status: 416, headers })
  }
  headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${body.byteLength}`)
  headers.set('Content-Length', String(parsed.end - parsed.start + 1))
  return new Response(body.slice(parsed.start, parsed.end + 1), { status: 206, headers })
}
