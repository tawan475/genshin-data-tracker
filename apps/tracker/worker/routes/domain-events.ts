/**
 * GET /api/domain-events: the domain events the tracker knows, one list for
 * every page: the game data's announced runs (`@gdt/game-data/events`) and
 * the windows staff set on the staff dashboard (Site → Domain events) for a
 * run the data has not caught up with. Merged here so the app has a single
 * source. Public and cacheable: it holds dates, nothing about anyone.
 */

import type { DomainEventsResponse, DomainEventWindow } from '@gdt/shared'
import { loadDomainEvents } from '@gdt/game-data/events'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { staffDomainEvents } from '../services/staff-deps'

const DAY_MS = 86_400_000
/** Server local times read as UTC are off by at most 14 hours; a day covers every server. */
const SLACK_MS = DAY_MS

/**
 * The game data's windows then staff's, a staff copy of a known run dropped,
 * those around `now` kept (running, starting within 60 days, ended within a
 * day), by start. Pure.
 */
export function mergeDomainEvents(
  data: readonly DomainEventWindow[],
  staff: readonly DomainEventWindow[],
  now: number,
): DomainEventWindow[] {
  const seen = new Set<string>()
  const out: DomainEventWindow[] = []
  for (const event of [...data, ...staff]) {
    const id = `${event.kind}|${event.start}`
    if (seen.has(id)) continue
    seen.add(id)
    const start = Date.parse(`${event.start}:00Z`)
    const end = Date.parse(`${event.end}:00Z`)
    if (end < now - DAY_MS - SLACK_MS || start > now + 60 * DAY_MS + SLACK_MS) continue
    out.push(event)
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

export const domainEvents = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  const [data, staff] = await Promise.all([
    loadDomainEvents().catch(() => []),
    staffDomainEvents(c.env.DB),
  ])
  return c.json<DomainEventsResponse>({ events: mergeDomainEvents(data, staff, Date.now()) })
})
