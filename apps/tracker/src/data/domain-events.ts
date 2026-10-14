import type { DomainEventsResponse } from '@gdt/shared'
import { loadDomainEvents, type DomainEvent } from '@gdt/game-data/events'
import { requestJson } from '@/api/http'

/**
 * The limited-time domain events ("Overflowing Abundance" opens every talent
 * book and weapon material all week, others multiply some domains): the game
 * data's list (`@gdt/game-data/events`, announced runs, shipped with each data
 * release) plus the windows staff set on the staff dashboard for a run the
 * data has not caught up with (`GET /api/domain-events`). Either source may
 * fail alone; what loaded is used.
 */

/** Staff windows are re-read after this long (the server caches them 5 min too). */
const STAFF_TTL_MS = 10 * 60_000

let gameData: Promise<DomainEvent[]> | undefined
let staff: { at: number; promise: Promise<DomainEvent[]> } | undefined

function staffEvents(now: number): Promise<DomainEvent[]> {
  if (!staff || now - staff.at > STAFF_TTL_MS) {
    const promise = requestJson<DomainEventsResponse>('/domain-events')
      .then((body) => body.events.map((event) => ({ ...event, source: event.source || 'staff' })))
      .catch(() => [] as DomainEvent[])
    staff = { at: now, promise }
  }
  return staff.promise
}

/** Every known event window: the game data's first, then staff's (duplicates are harmless). */
export async function loadAllDomainEvents(now = Date.now()): Promise<DomainEvent[]> {
  gameData ??= loadDomainEvents().catch(() => [])
  const [data, set] = await Promise.all([gameData, staffEvents(now)])
  return [...data, ...set]
}

export { domainEventsAt, type DomainEventsNow } from './domain-events-now'

/** For tests: forget what was loaded. */
export function resetDomainEventsCache(): void {
  gameData = undefined
  staff = undefined
}
