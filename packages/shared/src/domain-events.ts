import { z } from 'zod'

/**
 * Domain events set by staff on the website: the windows of an "Overflowing …"
 * event the game data (`@gdt/game-data/events`, `data/domain-events.json`)
 * has not caught up with yet, e.g. a run announced after the last data
 * release. Same shape as the game data's `DomainEvent`, so the app merges the
 * two lists and reads them with the same `activeDomainEvents`. Stored as JSON
 * in `site_settings` (`farm.events`).
 */

/** The kinds `@gdt/game-data/events` knows (`DOMAIN_EVENT_KINDS`); a test keeps them equal. */
export const DOMAIN_EVENT_KINDS = [
  'abundance',
  'mastery',
  'favor',
  'wealth',
  'revelation',
  'leyLine',
] as const
export type DomainEventKind = (typeof DOMAIN_EVENT_KINDS)[number]

/** `YYYY-MM-DDTHH:mm`, server local time. */
const serverTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Expected YYYY-MM-DDTHH:mm (server time)')

/** One window as staff enter it. */
export const domainEventInput = z
  .object({
    kind: z.enum(DOMAIN_EVENT_KINDS),
    start: serverTime,
    /** Exclusive. */
    end: serverTime,
    multiplier: z.number().positive().max(10).nullable().default(2),
    dailyClaims: z.number().int().positive().max(20).nullable().default(null),
    /** The game version, when known. */
    version: z.string().trim().max(16).default(''),
    /** Where it was announced (a link or a word), for the next staff member. */
    source: z.string().trim().max(300).default(''),
  })
  .refine((event) => event.start < event.end, { message: 'The event ends before it starts' })

export type DomainEventWindow = z.output<typeof domainEventInput>

/** At most this many windows are kept: old ones are meant to be removed. */
export const MAX_STAFF_DOMAIN_EVENTS = 20

export const domainEventList = z.array(domainEventInput).max(MAX_STAFF_DOMAIN_EVENTS)

/** Stored text -> windows; anything malformed reads as none. */
export function parseStaffDomainEvents(text: unknown): DomainEventWindow[] {
  if (typeof text !== 'string' || !text) return []
  try {
    const parsed = domainEventList.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** `GET /api/domain-events`: the staff-set windows (the game data's list is in the app). */
export interface DomainEventsResponse {
  events: DomainEventWindow[]
}
