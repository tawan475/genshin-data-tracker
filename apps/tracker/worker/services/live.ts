/**
 * Live updates: one Durable Object per user holds the sockets of that user's
 * browsers (one per browser: its tabs elect one to hold it) and fans every
 * change out to them.
 *
 * Built to cost as little as possible:
 * - Sockets use the WebSocket Hibernation API: while nothing happens the
 *   object is evicted from memory and an open socket costs nothing. The rare
 *   keep-alive `ping` is answered by an auto-response, which does not wake it.
 * - `users.live_since` says whether anyone is listening: the hub sets it when
 *   its first socket opens and clears it when the last one closes (or when an
 *   event finds none left). Writes read it in the batch they already send and
 *   skip the hub when it is NULL, so an upload while no page is open costs
 *   no Durable Object request at all.
 * - On connect the hub reads, in that same one D1 round trip, the session's
 *   current token version and each account's version and names, and sends
 *   them as `hello`: a tab re-reads the account list only if something moved
 *   while it had no socket.
 * - Writes notify after their own D1 batch, in `waitUntil` (the response never
 *   waits; a failure is only logged).
 *
 * Sessions: a socket is authorised once, by the access cookie at the upgrade,
 * and keeps the session's token version (the access token's `ver`). Ending
 * sessions (sign out everywhere, a password change) bumps the version in D1
 * and tells the hub, awaited, which closes every socket of an older version
 * (4003); a connect with an older version is refused, and every import's
 * event carries the current version too, so a socket never outlives a revoked
 * session. Signing one browser out only clears its cookies (sessions are not
 * tracked server-side), and its page closes its socket itself.
 */

import type { LiveAccount, LiveEvent } from '@gdt/shared'
import { DurableObject } from 'cloudflare:workers'
import type { Context } from 'hono'
import type { AppEnv } from '../env'

/** Close code for a socket whose session was ended: reconnect only with a fresh one. */
export const SESSION_ENDED_CLOSE = 4003

interface Attachment {
  userId: number
  /** The session's token version when the socket opened. */
  ver: number
}

/** Whether anyone listens, and the session version, as a write's batch read them. */
export interface Listener {
  live: boolean
  tokenVersion: number
}

export class LiveHub extends DurableObject<Env> {
  /** Upgrades being checked: they count as listening, so the flag stays set under them. */
  private connecting = 0
  /** Events sent while an upgrade was being checked, for the socket it opens. */
  private backlog: string[] = []
  /** `live_since` as this instance last wrote it (null: not known since it woke). */
  private flag: boolean | null = null
  /** Flag writes run one after another, each deciding on the sockets as they are then. */
  private chain: Promise<unknown> = Promise.resolve()
  /** Events this instance was asked to send since it woke (diagnostics and tests). */
  notified = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** The upgrade, forwarded by `GET /api/live` once it has checked the access cookie. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const userId = Number(request.headers.get('x-gdt-user'))
    const claimed = request.headers.get('x-gdt-token-version')
    const ver = claimed === null || claimed === '' ? null : Number(claimed)
    this.connecting++
    let accepted = false
    try {
      // One round trip: mark the user as listening, read the session version
      // and what the tab needs to tell whether it missed anything.
      const [, user, accounts] = await this.serial(async () => {
        const results = await this.env.DB.batch<Record<string, unknown>>([
          this.env.DB.prepare(
            'UPDATE users SET live_since = ?2 WHERE id = ?1 AND live_since IS NULL',
          ).bind(userId, Date.now()),
          this.env.DB.prepare('SELECT token_version FROM users WHERE id = ?1').bind(userId),
          this.env.DB.prepare(
            `SELECT id, data_version, name, uid, server FROM genshin_accounts
             WHERE user_id = ?1 ORDER BY id`,
          ).bind(userId),
        ])
        this.flag = true
        return results
      })
      const current = user!.results[0]?.token_version
      // A token from before its session was ended. (A token from before
      // access tokens carried a version is taken at the current one.)
      if (typeof current !== 'number' || (ver !== null && !(ver >= current))) {
        return new Response('Session ended', { status: 401 })
      }

      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({ userId, ver: ver ?? current } satisfies Attachment)
      const hello: LiveEvent = {
        type: 'hello',
        accounts: accounts!.results.map(
          (row): LiveAccount => ({
            id: row.id as number,
            dataVersion: row.data_version as number,
            name: row.name as string | null,
            uid: row.uid as string | null,
            server: row.server as LiveAccount['server'],
          }),
        ),
      }
      server.send(JSON.stringify(hello))
      for (const text of this.backlog) server.send(text)
      accepted = true
      return new Response(null, { status: 101, webSocket: client })
    } finally {
      this.connecting--
      if (this.connecting === 0) this.backlog = []
      if (!accepted) await this.release(userId)
    }
  }

  /**
   * Sends `event` to every open socket; one of a session older than
   * `tokenVersion` is closed instead. Answers how many got it.
   */
  async notify(userId: number, event: LiveEvent, tokenVersion?: number): Promise<number> {
    this.notified++
    const text = JSON.stringify(event)
    let sent = 0
    for (const socket of this.ctx.getWebSockets()) {
      const { ver } = attachment(socket)
      try {
        if (tokenVersion !== undefined && ver < tokenVersion) {
          socket.close(SESSION_ENDED_CLOSE, 'session ended')
          continue
        }
        socket.send(text)
        sent++
      } catch {
        // Already closing; its tab reconnects on its own.
      }
    }
    if (this.connecting > 0) this.backlog.push(text)
    // Nobody left (a stale flag after a crash): stop the writes calling.
    if (sent === 0) await this.release(userId)
    return sent
  }

  /** Closes every socket of a session older than `tokenVersion` (the user's sessions were ended). */
  async revoke(userId: number, tokenVersion: number): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      if (attachment(socket).ver >= tokenVersion) continue
      try {
        socket.close(SESSION_ENDED_CLOSE, 'session ended')
      } catch {
        // Already closing.
      }
    }
    await this.release(userId)
  }

  /** How many sockets are open (tests and diagnostics). */
  async sockets(): Promise<number> {
    return this.open().length
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
      // Already closed (the runtime answers the close itself).
    }
    await this.release(attachment(socket).userId, socket)
  }

  override async webSocketError(socket: WebSocket) {
    try {
      socket.close(1011, 'error')
    } catch {
      // Already closed.
    }
    await this.release(attachment(socket).userId, socket)
  }

  private open(except?: WebSocket): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
  }

  /** Clears `live_since` when nobody is listening any more (`closing` is on its way out). */
  private release(userId: number, closing?: WebSocket): Promise<void> {
    return this.serial(async () => {
      if (this.connecting > 0 || this.open(closing).length > 0 || this.flag === false) return
      if (!Number.isSafeInteger(userId) || userId <= 0) return
      await this.env.DB.prepare('UPDATE users SET live_since = NULL WHERE id = ?1')
        .bind(userId)
        .run()
      this.flag = false
    }).catch((error: unknown) => console.warn('live_flag_failed', String(error)))
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work)
    this.chain = run.catch(() => undefined)
    return run
  }
}

function attachment(socket: WebSocket): Attachment {
  return (socket.deserializeAttachment() ?? { userId: 0, ver: 0 }) as Attachment
}

/** The user's hub: one Durable Object per user, by id. */
export function liveHub(env: Env, userId: number): DurableObjectStub<LiveHub> {
  return env.LIVE.get(env.LIVE.idFromName(String(userId)))
}

/**
 * Reads, in a write's own batch, whether the account's user has anyone
 * listening and their session version (see `listenerOf`).
 */
export function listenerStatement(d1: D1Database, accountId: number): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT u.live_since, u.token_version FROM genshin_accounts AS a
       JOIN users AS u ON u.id = a.user_id WHERE a.id = ?1`,
    )
    .bind(accountId)
}

export function listenerOf(result: D1Result | undefined): Listener | undefined {
  const row = result?.results[0] as { live_since?: unknown; token_version?: unknown } | undefined
  if (!row || typeof row.token_version !== 'number') return undefined
  return {
    live: row.live_since !== null && row.live_since !== undefined,
    tokenVersion: row.token_version,
  }
}

/** The tab that sent a write (`x-gdt-tab`), echoed in its live event so that tab skips it. */
export function senderTab(c: Context<AppEnv>): { tab?: string } {
  const tab = c.req.header('x-gdt-tab')
  return tab && /^[A-Za-z0-9_-]{1,40}$/.test(tab) ? { tab } : {}
}

/**
 * Tells the user's open pages that something changed, after the response:
 * never awaited by the request, never failing it. With a `listener` read in
 * the write's batch, nothing is sent when nobody listens, and sockets of an
 * ended session are closed on the way.
 */
export function notifyUser(
  c: Context<AppEnv>,
  userId: number,
  event: LiveEvent,
  listener?: Listener,
): void {
  if (!c.env.LIVE || (listener && !listener.live)) return
  const sent = liveHub(c.env, userId)
    .notify(userId, event, listener?.tokenVersion)
    .catch((error: unknown) => console.warn('live_notify_failed', String(error)))
  try {
    c.executionCtx.waitUntil(sent)
  } catch {
    // No execution context (a direct app.fetch in a test): the promise still runs.
  }
}

/**
 * Closes the sockets of the user's ended sessions. Awaited by the caller and
 * tried twice: this is what keeps a socket from outliving its session.
 */
export async function revokeLive(env: Env, userId: number, tokenVersion: number): Promise<void> {
  if (!env.LIVE) return
  for (let attempt = 1; ; attempt++) {
    try {
      await liveHub(env, userId).revoke(userId, tokenVersion)
      return
    } catch (error) {
      if (attempt >= 2) {
        // The next import's event, and every connect, still check the version.
        console.error('live_revoke_failed', String(error))
        return
      }
    }
  }
}
