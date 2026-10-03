/**
 * GET /api/health — modelled on aru.gg's.
 *
 * Public tier: status, build, D1 reachability, migration state. Anyone may
 * read it; it is what uptime checks and `pnpm health` look at.
 *
 * Private tier: only when the request carries `x-diag-key` equal to the
 * DIAG_KEY secret. Adds the raw database error, every secret *with its
 * value*, and which bindings exist. A session never opens it — a signed-in
 * owner looking at a screen is exactly how a secret leaks — and a wrong key
 * silently gets the public tier. DIAG_KEY is separate from the session
 * secrets because diagnostics matter most when auth is broken.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { safeEqual } from '../lib/crypto'

declare const __BUILD__:
  | { version: string; commit: string; dirty: boolean; builtAt: string }
  | undefined
declare const __MIGRATIONS__: string[] | undefined

/** Secrets the deployment needs; listed (with values) in the private tier. */
const SECRET_NAMES = ['JWT_SECRET', 'PASSWORD_PEPPER', 'DIAG_KEY'] as const

/** Constant-time; an unset or empty key never matches, not even an empty header. */
export function diagKeyOk(supplied: string | undefined, expected: string | undefined): boolean {
  return (
    typeof expected === 'string' &&
    expected.length > 0 &&
    typeof supplied === 'string' &&
    supplied.length > 0 &&
    safeEqual(supplied, expected)
  )
}

export const health = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  const env = c.env as unknown as Record<string, unknown>
  const privileged = diagKeyOk(c.req.header('x-diag-key'), c.env.DIAG_KEY)

  let db: 'ok' | 'error' = 'ok'
  let detail: string | undefined
  let applied: string[] = []
  try {
    const { results } = await c.env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{
      name: string
    }>()
    applied = results.map((row) => row.name)
  } catch (error) {
    db = 'error'
    detail = String(error)
  }

  const expected = typeof __MIGRATIONS__ === 'undefined' ? null : __MIGRATIONS__
  const pending = expected ? expected.filter((name) => !applied.includes(name)) : []
  const status = db === 'ok' && pending.length === 0 ? 'ok' : 'degraded'

  const body: Record<string, unknown> = {
    status,
    build: typeof __BUILD__ === 'undefined' ? null : __BUILD__,
    db,
    schema: { applied: applied.length, expected: expected?.length ?? null, pending },
    time: new Date().toISOString(),
  }

  if (privileged) {
    body.detail = detail ?? null
    body.diagnostics = {
      via: 'diag-key',
      config: Object.fromEntries(
        SECRET_NAMES.map((name) => {
          const value = env[name]
          return [name, typeof value === 'string' && value ? { set: true, value } : { set: false }]
        }),
      ),
      bindings: Object.fromEntries(
        ['DB', 'AUTH_LIMITER', 'IMPORT_LIMITER'].map((name) => [name, env[name] != null]),
      ),
      colo: (c.req.raw as { cf?: { colo?: string } }).cf?.colo ?? null,
    }
  }

  return c.json(body, db === 'ok' ? 200 : 503)
})
