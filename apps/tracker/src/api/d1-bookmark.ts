import { readJson, writeJson } from '@/lib/storage'

/**
 * The newest D1 bookmarks this browser knows (worker/lib/d1-session.ts): from
 * every API answer (`x-gdt-bookmark` / `x-gdt-bookmark-live`) and every live event (another
 * device's write). Sent with every request, so a read replica never answers
 * with the account older than that. Kept in localStorage, so every tab sends
 * the newest one, whichever tab learnt it. (Positions in the database, not
 * account data: nothing to clear at sign-out.)
 */

const KEY = 'd1-bookmarks'
/** A D1 bookmark: fixed-width hex parts, so newer sorts later as text. */
const BOOKMARK = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/

export interface Bookmarks {
  d1?: string
  d1l?: string
}

const valid = (value: unknown): value is string => typeof value === 'string' && BOOKMARK.test(value)

let memory: Bookmarks = {}

export function currentBookmarks(): Bookmarks {
  const stored = readJson<Bookmarks | null>(KEY, null)
  return {
    ...pick('d1', memory.d1, stored?.d1),
    ...pick('d1l', memory.d1l, stored?.d1l),
  }
}

/** Keeps each bookmark when it is newer than the one held. */
export function noteBookmarks(seen: { d1?: unknown; d1l?: unknown }): void {
  const held = currentBookmarks()
  const next = { ...pick('d1', held.d1, seen.d1), ...pick('d1l', held.d1l, seen.d1l) }
  if (next.d1 === held.d1 && next.d1l === held.d1l) return
  memory = next
  writeJson(KEY, next)
}

/** Adds the bookmark headers to a request's. */
export function bookmarkHeaders(headers: Headers): void {
  const { d1, d1l } = currentBookmarks()
  if (d1) headers.set('x-gdt-bookmark', d1)
  if (d1l) headers.set('x-gdt-bookmark-live', d1l)
}

function pick(key: keyof Bookmarks, a: unknown, b: unknown): Bookmarks {
  const x = valid(a) ? a : undefined
  const y = valid(b) ? b : undefined
  const newer = x && y ? (y > x ? y : x) : (x ?? y)
  return newer ? { [key]: newer } : {}
}
