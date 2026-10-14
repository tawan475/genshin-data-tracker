import type { DomainEventWindow, DomainEventsResponse } from '@gdt/shared'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { mergeDomainEvents } from '../routes/domain-events'
import { ORIGIN } from './client'

const run = (over: Partial<DomainEventWindow> = {}): DomainEventWindow => ({
  kind: 'abundance',
  start: '2026-10-13T04:00',
  end: '2026-10-20T04:00',
  multiplier: 2,
  dailyClaims: 3,
  version: '7.1',
  source: 'game data',
  ...over,
})

describe('GET /api/domain-events: one list, merged on the server', () => {
  const now = Date.UTC(2026, 9, 15)

  it('keeps running, upcoming and just-ended windows, by start, without staff copies', () => {
    const data = [
      run({ kind: 'favor', start: '2026-10-26T04:00', end: '2026-11-02T04:00' }),
      run(),
      run({ start: '2026-09-14T04:00', end: '2026-09-21T04:00' }),
    ]
    const staff = [
      run({ source: 'notice' }),
      run({ kind: 'mastery', start: '2027-03-01T04:00', end: '2027-03-08T04:00' }),
    ]
    expect(mergeDomainEvents(data, staff, now)).toEqual([
      run(),
      run({ kind: 'favor', start: '2026-10-26T04:00', end: '2026-11-02T04:00' }),
    ])
  })

  it('answers the game data list to anyone, cacheable', async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/domain-events`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    const body = (await response.json()) as DomainEventsResponse
    expect(Array.isArray(body.events)).toBe(true)
  })
})
