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

/**
 * `GET /api/domain-events`: the staff-set windows, and the windows irminsul
 * saw in the game's schedule per server (`observed`, server local times, for
 * events not ended more than a day ago). The game data's list is in the app.
 */
export interface DomainEventsResponse {
  events: DomainEventWindow[]
  observed: Partial<Record<'AMERICA' | 'EUROPE' | 'ASIA' | 'SAR', DomainEventWindow[]>>
}

/**
 * irminsul's `gi_events` (contract v1): the "Overflowing …" events the game's
 * own schedule (OpActivity) listed at the capture's login, by the game's
 * activity id. Times are unix seconds.
 */
export interface ObservedDomainEvent {
  id: number
  kind: DomainEventKind
  /** Unix ms. */
  begin: number
  /** Unix ms, exclusive. */
  end: number
}

/** The game's OpActivity ids of each kind (7.1 OpActivityExcelConfigData). */
export const OP_ACTIVITY_KINDS: Readonly<Record<number, DomainEventKind>> = {
  101: 'leyLine',
  102: 'leyLine',
  103: 'leyLine',
  201: 'revelation',
  202: 'revelation',
  301: 'wealth',
  302: 'wealth',
  401: 'mastery',
  402: 'mastery',
  501: 'favor',
  502: 'favor',
  601: 'abundance',
  602: 'abundance',
}

const HOUR_S = 3600
/** irminsul's own bounds: 1 hour to 45 days. */
const MAX_EVENT_S = 45 * 24 * HOUR_S

/**
 * Reads `gi_events` from an upload (anything else, or a malformed entry, is
 * left out): known ids whose kind matches, whole-second times, 1 h – 45 days
 * long, at most 20.
 */
export function parseObservedEvents(value: unknown): ObservedDomainEvent[] {
  if (!Array.isArray(value)) return []
  const out: ObservedDomainEvent[] = []
  for (const row of value.slice(0, 20)) {
    if (typeof row !== 'object' || row === null) continue
    const { id, kind, begin, end } = row as Record<string, unknown>
    if (typeof id !== 'number' || !(id in OP_ACTIVITY_KINDS)) continue
    if (OP_ACTIVITY_KINDS[id] !== kind) continue
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end)) continue
    const length = (end as number) - (begin as number)
    if ((begin as number) <= 0 || length < HOUR_S || length > MAX_EVENT_S) continue
    out.push({
      id,
      kind: OP_ACTIVITY_KINDS[id]!,
      begin: (begin as number) * 1000,
      end: (end as number) * 1000,
    })
  }
  return out
}
