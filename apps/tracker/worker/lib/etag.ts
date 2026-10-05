import type { Context } from 'hono'

/**
 * Account-scoped responses are derived from data that only changes when the
 * account's `data_version` moves, so that version is the ETag. Revalidating a
 * cached view costs the browser one round trip and the Worker one indexed read.
 */
export function accountEtag(account: { id: number; dataVersion: number }, variant = ''): string {
  return `W/"a${account.id}.v${account.dataVersion}${variant ? `.${variant}` : ''}"`
}

/** 304 when the client already holds `etag`; otherwise null (and headers set for the 200). */
export function checkEtag(c: Context, etag: string): Response | null {
  c.header('ETag', etag)
  c.header('Cache-Control', 'private, no-cache')
  const match = c.req.header('if-none-match')
  if (match && match.split(/\s*,\s*/).includes(etag)) return c.body(null, 304)
  return null
}

/**
 * An ETag over a response body itself, for responses that depend on more than
 * one account's data version (the account list: names, versions, latest
 * summaries). 96 bits of SHA-256 under a short kind prefix.
 */
export async function bodyEtag(kind: string, body: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)),
  )
  const hex = [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `W/"${kind}.${hex}"`
}
