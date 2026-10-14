import type { DomainEventsResponse, DomainEventWindow } from '@gdt/shared'
import { requestJson } from '@/api/http'

/**
 * The limited-time domain events ("Overflowing Abundance" opens every talent
 * book and weapon material all week, others multiply some domains), as the
 * tracker serves them (`GET /api/domain-events`: the game data's announced
 * runs and staff's windows, merged on the server). Read again every 10
 * minutes; a failed read keeps what was there.
 */

const TTL_MS = 10 * 60_000

let cached: { at: number; promise: Promise<DomainEventWindow[]> } | undefined
let last: DomainEventWindow[] = []

export function loadAllDomainEvents(now = Date.now()): Promise<DomainEventWindow[]> {
  if (!cached || now - cached.at > TTL_MS) {
    const promise = requestJson<DomainEventsResponse>('/domain-events').then(
      (body) => (last = body.events),
      () => last,
    )
    cached = { at: now, promise }
  }
  return cached.promise
}

export { domainEventsAt, type DomainEventsNow } from './domain-events-now'

/** For tests: forget what was loaded. */
export function resetDomainEventsCache(): void {
  cached = undefined
  last = []
}
