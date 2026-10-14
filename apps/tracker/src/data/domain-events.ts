import type { GameEventsResponse } from '@gdt/shared'
import { requestJson } from '@/api/http'

/**
 * The game's events as the tracker serves them (`GET /api/game-events`,
 * docs/plans/game-events.md): the domain event windows (game data, staff,
 * HoYoLAB, the banner rule: "Overflowing Abundance" opens every domain) and
 * the notice board's events and wishes, for one server. Read again every
 * 10 minutes; a failed read keeps what was there.
 */

const TTL_MS = 10 * 60_000
const EMPTY: GameEventsResponse = { server: null, domain: [], notices: [], syncedAt: null }

const cache = new Map<string, { at: number; promise: Promise<GameEventsResponse> }>()
const last = new Map<string, GameEventsResponse>()

export function loadGameEvents(
  server: string | null | undefined,
  now = Date.now(),
): Promise<GameEventsResponse> {
  const key = server ?? ''
  const hit = cache.get(key)
  if (hit && now - hit.at <= TTL_MS) return hit.promise
  const query = server ? `?server=${encodeURIComponent(server)}` : ''
  const promise = requestJson<GameEventsResponse>(`/game-events${query}`).then(
    (body) => {
      last.set(key, body)
      return body
    },
    () => last.get(key) ?? EMPTY,
  )
  cache.set(key, { at: now, promise })
  return promise
}

export { domainEventsAt, type DomainEventsNow } from './domain-events-now'

/** For tests: forget what was loaded. */
export function resetDomainEventsCache(): void {
  cache.clear()
  last.clear()
}
