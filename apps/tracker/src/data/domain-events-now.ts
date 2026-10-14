import {
  activeDomainEvents,
  DOMAIN_EVENT_EFFECTS,
  serverLocalTime,
  type DomainEvent,
} from '@gdt/game-data/events'

/** What the domain event windows mean at a moment (pure; loading them is ./domain-events). */
export interface DomainEventsNow {
  /** The events running now on the account's server. */
  active: DomainEvent[]
  /** A running event offers every talent book and weapon material today (a Sunday all week). */
  allDomainsOpen: boolean
  /** When the earliest running event ends (ms), for the countdown; null when none runs. */
  endsAt: number | null
}

/** What `events` means at `now` on `server` (null server: the browser's zone). */
export function domainEventsAt(
  events: readonly DomainEvent[],
  now: number,
  server: string | null | undefined,
): DomainEventsNow {
  const active = activeDomainEvents(events, now, server)
  const ends = active.map((event) => serverLocalTime(event.end, server))
  return {
    active,
    allDomainsOpen: active.some((event) => DOMAIN_EVENT_EFFECTS[event.kind].allDomainsOpen),
    endsAt: ends.length > 0 ? Math.min(...ends) : null,
  }
}
