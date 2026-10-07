/**
 * Operator routes, only with `x-diag-key` equal to the DIAG_KEY secret (a
 * session never opens them; anything else is a 404, as if they did not
 * exist).
 *
 * GET  /api/admin/repack                 how much is left in storage format v1
 * POST /api/admin/repack?limit=N&after=I converts up to N v1 snapshot rows
 *      (ids above I, default 100) and 50 × N v1 catalog rows to v2, merges
 *      small catalog chunks, and answers what it did, the rows that did not
 *      convert, `next` (pass it as `after` to continue past those) and what
 *      is left.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { ApiError } from '../lib/http'
import { repack, repackStatus } from '../services/repack'
import { diagKeyOk } from './health'

/** Keeps one request well inside the Worker's CPU limit (a row takes a few ms). */
const MAX_REPACK_LIMIT = 500

function count(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    throw new ApiError(400, 'invalid_request', `Expected a whole number from 0 to ${max}`)
  }
  return n
}

export const admin = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (!diagKeyOk(c.req.header('x-diag-key'), c.env.DIAG_KEY)) {
      throw new ApiError(404, 'not_found', 'Not found')
    }
    await next()
  })

  .get('/repack', async (c) => c.json({ remaining: await repackStatus(c.env.DB) }))

  .post('/repack', async (c) => {
    const limit = count(c.req.query('limit'), 100, MAX_REPACK_LIMIT)
    const after = count(c.req.query('after'), 0, Number.MAX_SAFE_INTEGER)
    const result = await repack(c.env.DB, { limit, after })
    console.log('repack', JSON.stringify(result))
    return c.json(result)
  })
