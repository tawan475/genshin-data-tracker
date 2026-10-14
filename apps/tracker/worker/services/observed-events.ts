/**
 * Domain event windows irminsul saw in the game's own schedule (captures'
 * `gi_events`), kept per server in `observed_domain_events` (migration
 * 0025). Events are the same for everyone on a server, so one capture
 * tells every account there. Written after an upload that carries some, in
 * `waitUntil` (never failing or slowing the upload); most uploads carry none.
 */

import {
  serverFromUid,
  type DomainEventWindow,
  type DomainEventsResponse,
  type ObservedDomainEvent,
} from '@gdt/shared'
import { SERVER_UTC_OFFSET, type Server } from '@gdt/game-data/planner-math'
import type { Context } from 'hono'
import type { AppEnv } from '../env'

const DAY_MS = 86_400_000
/** A window starting further ahead than this is not believed (the game lists running events only). */
const MAX_AHEAD_MS = 60 * DAY_MS
/** Windows stay listed this long after they end, then go. */
const KEEP_AFTER_END_MS = DAY_MS

/** Upserts the windows a capture carried; `reports` counts the uploads that agreed. */
export function observedEventStatements(
  d1: D1Database,
  server: Server,
  events: readonly ObservedDomainEvent[],
  now = Date.now(),
): D1PreparedStatement[] {
  return events
    .filter((event) => event.end > now - KEEP_AFTER_END_MS && event.begin < now + MAX_AHEAD_MS)
    .map((event) =>
      d1
        .prepare(
          `INSERT INTO observed_domain_events
             (server, activity_id, kind, begin_at, end_at, reports, first_seen_at, last_seen_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
           ON CONFLICT (server, activity_id, begin_at) DO UPDATE SET
             end_at = excluded.end_at, kind = excluded.kind,
             reports = reports + 1, last_seen_at = excluded.last_seen_at`,
        )
        .bind(server, event.id, event.kind, event.begin, event.end, now),
    )
}

/**
 * After an upload: records its `gi_events` for the account's server (from its
 * UID; none for an account without one, or a China server).
 */
export function recordObservedEvents(
  c: Context<AppEnv>,
  uid: string | null | undefined,
  events: readonly ObservedDomainEvent[],
): void {
  if (events.length === 0 || !uid) return
  const server = serverFromUid(uid)
  if (!server) return
  const statements = observedEventStatements(c.env.DB, server, events)
  if (statements.length === 0) return
  c.executionCtx.waitUntil(
    c.env.DB.batch(statements).then(
      () => undefined,
      (error: unknown) => console.error('could not record observed domain events', error),
    ),
  )
}

/** Unix ms as the server's local `YYYY-MM-DDTHH:mm`. */
export function serverLocal(ms: number, server: Server): string {
  return new Date(ms + SERVER_UTC_OFFSET[server] * 3_600_000).toISOString().slice(0, 16)
}

/** Every observed window not ended more than a day ago, by server, as event windows. */
export async function observedWindows(
  d1: D1Database,
  now = Date.now(),
): Promise<DomainEventsResponse['observed']> {
  const { results } = await d1
    .prepare(
      `SELECT server, activity_id, kind, begin_at, end_at FROM observed_domain_events
       WHERE end_at > ?1 ORDER BY begin_at`,
    )
    .bind(now - KEEP_AFTER_END_MS)
    .all<{ server: Server; activity_id: number; kind: string; begin_at: number; end_at: number }>()
  const out: DomainEventsResponse['observed'] = {}
  for (const row of results) {
    const window: DomainEventWindow = {
      kind: row.kind as DomainEventWindow['kind'],
      start: serverLocal(row.begin_at, row.server),
      // The game ends at 03:59:59; windows are minute-exact and end-exclusive.
      end: serverLocal(Math.ceil(row.end_at / 60_000) * 60_000, row.server),
      multiplier: 2,
      dailyClaims: 3,
      version: '',
      source: `game schedule (activity ${row.activity_id})`,
    }
    ;(out[row.server] ??= []).push(window)
  }
  return out
}
