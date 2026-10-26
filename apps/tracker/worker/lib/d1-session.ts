import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../env'

/**
 * D1 read replication. Every API request runs its queries on one D1 session
 * per database, so a read may be answered by a nearby replica while the
 * request still sees its own writes:
 * - a write (any method but GET/HEAD) starts at the primary, so what it
 *   reads before writing is current;
 * - a read starts at the newest bookmark the browser holds, so it never sees
 *   the account older than what this browser already wrote or was told about,
 *   else anywhere ("first-unconstrained").
 * The browser holds the bookmark in a cookie (navigations and every tab get
 * it) and, from the app, in the `x-gdt-bookmark` header, which also carries the
 * bookmark of a live event (another device's write); the newer one wins.
 * Without replication turned on, sessions behave like the plain binding.
 * The Durable Object, cron and maintenance use the bindings as they are,
 * which always go to the primary.
 */

/** A D1 bookmark: fixed-width hex parts, so newer sorts later as text. */
const BOOKMARK = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/

/** Per database: its binding, cookie and header. */
const DATABASES = [
  { binding: 'DB', cookie: 'gdt_d1', header: 'x-gdt-bookmark' },
  { binding: 'LIVE_DB', cookie: 'gdt_d1l', header: 'x-gdt-bookmark-live' },
] as const

/** A bookmark as sent, or null when it isn't one. */
export function readBookmark(value: string | undefined | null): string | null {
  return value && BOOKMARK.test(value) ? value : null
}

/** The newer of two bookmarks (either may be missing). */
export function newerBookmark(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return b > a ? b : a
}

/** What a request's session starts from: its method and the bookmark it carries. */
export function sessionStart(method: string, bookmark: string | null): string {
  if (method !== 'GET' && method !== 'HEAD') return 'first-primary'
  return bookmark ?? 'first-unconstrained'
}

/**
 * `d1` as a session: queries and batches go through `session`; `exec` and
 * `withSession` stay on the binding (a schema change or a new session of
 * its own).
 */
function asDatabase(d1: D1Database, session: D1DatabaseSession): D1Database {
  return {
    prepare: (sql: string) => session.prepare(sql),
    batch: <T = unknown>(statements: D1PreparedStatement[]) => session.batch<T>(statements),
    exec: (sql: string) => d1.exec(sql),
    withSession: (start?: string) => d1.withSession(start),
    dump: () => d1.dump(),
  } as unknown as D1Database
}

/** The request's sessions, to read their bookmarks (live events, responses). */
type Sessions = Partial<Record<(typeof DATABASES)[number]['binding'], D1DatabaseSession>>
const SESSIONS = new WeakMap<Context<AppEnv>, Sessions>()

/** The bookmarks of this request's sessions so far: `{d1, d1l}`, each when known. */
export function requestBookmarks(c: Context<AppEnv>): { d1?: string; d1l?: string } {
  const sessions = SESSIONS.get(c)
  const main = readBookmark(sessions?.DB?.getBookmark())
  const live = readBookmark(sessions?.LIVE_DB?.getBookmark())
  return { ...(main ? { d1: main } : {}), ...(live ? { d1l: live } : {}) }
}

export const d1Sessions: MiddlewareHandler<AppEnv> = async (c, next) => {
  const env = { ...c.env }
  const sessions: Sessions = {}
  const sent: Partial<Record<string, string | null>> = {}
  for (const db of DATABASES) {
    const binding = c.env[db.binding] as D1Database | undefined
    if (!binding?.withSession) continue
    const bookmark = newerBookmark(
      readBookmark(getCookie(c, db.cookie)),
      readBookmark(c.req.header(db.header)),
    )
    sent[db.binding] = bookmark
    const session = binding.withSession(sessionStart(c.req.method, bookmark))
    sessions[db.binding] = session
    ;(env as Record<string, unknown>)[db.binding] = asDatabase(binding, session)
  }
  SESSIONS.set(c, sessions)
  c.env = env
  await next()
  if (c.res.status === 101) return
  // Only a write, or a sign-in (it sets cookies: an OAuth callback is a GET),
  // moves the cookie: a read's bookmark is only the replica it met, and a
  // cookie would make its response uncacheable.
  const keep =
    c.res.status < 400 &&
    ((c.req.method !== 'GET' && c.req.method !== 'HEAD') || c.res.headers.has('set-cookie'))
  for (const db of DATABASES) {
    const now = readBookmark(sessions[db.binding]?.getBookmark())
    if (!now) continue
    // (After the handler, Hono copies a response whose headers are read-only.)
    c.header(db.header, now)
    // The cookie only moves forward from what this request was sent.
    if (!keep || now === sent[db.binding] || newerBookmark(sent[db.binding] ?? null, now) !== now) {
      continue
    }
    setCookie(c, db.cookie, now, {
      path: '/api',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 60 * 60,
    })
  }
}
