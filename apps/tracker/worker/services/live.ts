/**
 * Live updates: one Durable Object per user holds that user's open sockets
 * (one per signed-in tab) and fans every change out to them.
 *
 * - Sockets use the WebSocket Hibernation API: while nothing happens the
 *   object is evicted from memory and an open socket costs nothing. The
 *   tab's keep-alive `ping` is answered by an auto-response, which does not
 *   wake the object either.
 * - Writes call `notifyUser` after their D1 batch, in `waitUntil`: the
 *   response never waits for it, and a failed notification is only logged
 *   (an import must not fail because nobody could be told).
 * - A socket is authorised once, at the upgrade, by the access cookie. Its
 *   token's expiry rides along as the socket's attachment; once it has passed
 *   the socket is closed (4001) instead of being sent to, and the tab
 *   reconnects with a fresh cookie (after the usual refresh). So a session
 *   ended elsewhere stops hearing events within one access-token lifetime.
 * - Events carry ids and versions only; tabs read the data themselves, and
 *   catch up with one account-list read after any gap (pushes sent while a
 *   socket was down are not replayed).
 */

import type { LiveEvent } from '@gdt/shared'
import { DurableObject } from 'cloudflare:workers'
import type { Context } from 'hono'
import type { AppEnv } from '../env'

/** Close code for a socket whose session token expired: reconnect after a refresh. */
export const SESSION_EXPIRED_CLOSE = 4001

interface Attachment {
  /** The access token's expiry, epoch seconds. */
  exp: number
}

export class LiveHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** The upgrade, forwarded by `GET /api/live` once it has checked the session. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const exp = Number(request.headers.get('x-gdt-token-exp'))
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ exp: Number.isFinite(exp) ? exp : 0 } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Sends `event` to every open socket of this user; answers how many got it. */
  async notify(event: LiveEvent): Promise<number> {
    const text = JSON.stringify(event)
    const now = Math.floor(Date.now() / 1000)
    let sent = 0
    for (const socket of this.ctx.getWebSockets()) {
      const { exp } = (socket.deserializeAttachment() ?? { exp: 0 }) as Attachment
      try {
        if (exp <= now) {
          socket.close(SESSION_EXPIRED_CLOSE, 'session expired')
          continue
        }
        socket.send(text)
        sent++
      } catch {
        // Already closing; its tab reconnects on its own.
      }
    }
    return sent
  }

  /** How many sockets are open (tests and diagnostics). */
  async sockets(): Promise<number> {
    return this.ctx.getWebSockets().length
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    // Only the keep-alive is expected, and the auto-response normally answers it.
    if (message === 'ping') socket.send('pong')
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string) {
    try {
      // 1005 / 1006 mean "no code" and may not be sent back.
      socket.close(code === 1005 || code === 1006 ? 1000 : code, reason)
    } catch {
      // Already closed.
    }
  }

  override async webSocketError(socket: WebSocket) {
    try {
      socket.close(1011, 'error')
    } catch {
      // Already closed.
    }
  }
}

/** The user's hub: one Durable Object per user, by id. */
export function liveHub(env: Env, userId: number): DurableObjectStub<LiveHub> {
  return env.LIVE.get(env.LIVE.idFromName(String(userId)))
}

/**
 * Tells the user's open tabs that something changed, after the response:
 * never awaited by the request, never failing it.
 */
export function notifyUser(c: Context<AppEnv>, userId: number, event: LiveEvent): void {
  if (!c.env.LIVE) return
  const sent = liveHub(c.env, userId)
    .notify(event)
    .catch((error: unknown) => console.warn('live_notify_failed', String(error)))
  try {
    c.executionCtx.waitUntil(sent)
  } catch {
    // No execution context (a direct app.fetch in a test): the promise still runs.
  }
}
