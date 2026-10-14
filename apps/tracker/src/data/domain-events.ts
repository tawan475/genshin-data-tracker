import type { DomainEventsResponse } from '@gdt/shared'
import { loadDomainEvents, type DomainEvent } from '@gdt/game-data/events'
import { requestJson } from '@/api/http'

/**
 * The limited-time domain events ("Overflowing Abundance" opens every talent
 * book and weapon material all week, others multiply some domains), from
 * three places: the game data's list (`@gdt/game-data/events`, announced
 * runs, shipped with each data release), the windows staff set on the staff
 * dashboard, and those irminsul saw in the game's own schedule on the
 * account's server (both `GET /api/domain-events`). Each source may fail
 * alone; what loaded is used.
 */

/** The server's windows are re-read after this long (it caches them 5 min too). */
const SERVER_TTL_MS = 10 * 60_000

let gameData: Promise<DomainEvent[]> | undefined
let fromServer: { at: number; promise: Promise<DomainEventsResponse | null> } | undefined

function serverEvents(now: number): Promise<DomainEventsResponse | null> {
  if (!fromServer || now - fromServer.at > SERVER_TTL_MS) {
    const promise = requestJson<DomainEventsResponse>('/domain-events').catch(() => null)
    fromServer = { at: now, promise }
  }
  return fromServer.promise
}

/**
 * Every known event window for `server` (null: none of the observed ones):
 * the game data's, then staff's, then the game schedule's (duplicates are
 * harmless).
 */
export async function loadAllDomainEvents(
  server: string | null | undefined,
  now = Date.now(),
): Promise<DomainEvent[]> {
  gameData ??= loadDomainEvents().catch(() => [])
  const [data, body] = await Promise.all([gameData, serverEvents(now)])
  const staff = (body?.events ?? []).map((event) => ({ ...event, source: event.source || 'staff' }))
  const observed =
    server && body?.observed ? (body.observed[server as keyof typeof body.observed] ?? []) : []
  return [...data, ...staff, ...observed]
}

export { domainEventsAt, type DomainEventsNow } from './domain-events-now'

/** For tests: forget what was loaded. */
export function resetDomainEventsCache(): void {
  gameData = undefined
  fromServer = undefined
}
