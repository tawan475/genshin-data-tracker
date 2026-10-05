/**
 * GET /api/live — the WebSocket a signed-in tab keeps open to hear about
 * changes to the user's accounts (see services/live.ts).
 *
 * The browser sends the session cookies with the upgrade (same origin), so the
 * access cookie authorises it like any request; an expired one is a 401 and
 * the tab reconnects after its usual refresh. The `Origin` must be this site:
 * a page elsewhere cannot open a socket on a visitor's session.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { ApiError } from '../lib/http'
import { requireUser } from '../lib/session'
import { liveHub } from '../services/live'

export const live = new Hono<AppEnv>().get(
  '/',
  async (c, next) => {
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
      throw new ApiError(426, 'upgrade_required', 'Expected a WebSocket upgrade')
    }
    if (c.req.header('origin') !== new URL(c.req.url).origin) {
      throw new ApiError(403, 'bad_origin', 'Live updates are only for this site')
    }
    await next()
  },
  requireUser,
  async (c) => {
    // Only what the hub needs: no cookies go on to the Durable Object.
    const upgraded = await liveHub(c.env, c.get('userId')).fetch(c.req.url, {
      headers: { upgrade: 'websocket', 'x-gdt-token-exp': String(c.get('tokenExp')) },
    })
    if (!upgraded.webSocket) return upgraded
    // A fresh response: middleware may still add headers to it.
    return new Response(null, { status: 101, webSocket: upgraded.webSocket })
  },
)
