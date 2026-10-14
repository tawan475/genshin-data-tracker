import { DOMAIN_EVENT_KINDS as SHARED_KINDS } from '@gdt/shared'
import { DOMAIN_EVENT_KINDS, type DomainEvent } from '@gdt/game-data/events'
import { describe, expect, it } from 'vitest'
import { domainEventsAt } from '../domain-events-now'

const abundance: DomainEvent = {
  kind: 'abundance',
  start: '2026-10-13T04:00',
  end: '2026-10-20T04:00',
  multiplier: 2,
  dailyClaims: 3,
  version: '7.1',
  source: 'staff',
}

describe('domain events', () => {
  it('the staff form knows exactly the kinds the game data knows', () => {
    expect([...SHARED_KINDS].sort()).toEqual([...DOMAIN_EVENT_KINDS].sort())
  })

  it('opens every domain while Overflowing Abundance runs on the account’s server', () => {
    // 04:00 on Asia (UTC+8) = 20:00 UTC the day before.
    const start = Date.UTC(2026, 9, 12, 20)
    const end = Date.UTC(2026, 9, 19, 20)
    expect(domainEventsAt([abundance], start - 1, 'ASIA')).toEqual({
      active: [],
      allDomainsOpen: false,
      endsAt: null,
    })
    expect(domainEventsAt([abundance], start, 'ASIA')).toEqual({
      active: [abundance],
      allDomainsOpen: true,
      endsAt: end,
    })
    // America is 13 hours behind: not started there yet.
    expect(domainEventsAt([abundance], start, 'AMERICA').allDomainsOpen).toBe(false)
    expect(domainEventsAt([abundance], end, 'ASIA').active).toEqual([])
  })

  it('a multiplier-only event does not open every domain', () => {
    const favor = { ...abundance, kind: 'favor' as const }
    const at = Date.UTC(2026, 9, 15)
    const now = domainEventsAt([favor], at, 'EUROPE')
    expect(now.active).toEqual([favor])
    expect(now.allDomainsOpen).toBe(false)
  })
})
