import { todayDigestSchema, type PlannerTask } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { alertFactsOf } from '../alert-facts'
import type { FarmCard, FarmSection } from '../farm-today'
import { todayDigest } from '../today-digest'

const card = (over: Partial<FarmCard> = {}): FarmCard =>
  ({
    id: 'domain:freedom',
    kind: 'domain',
    name: 'Cecilia Garden',
    detail: 'Freedom',
    domain: 'talent',
    resinPerRun: 20,
    run: {
      runs: 5.4,
      resin: 108.2,
      resinMax: 108.2,
      condensed: 0,
      days: 1,
      weekly: false,
      bracket: null,
      upperBound: false,
    },
    status: 'ok',
    lock: null,
    lines: [
      {
        material: { key: 'TeachingsOfFreedom' },
        need: 9,
        have: 0,
        crafted: 0,
        spent: 0,
        missing: 9,
        goals: ['character:Venti'],
      },
    ],
    goals: ['character:Venti', 'weapon:SkywardHarp:Venti', 'item:Mora'],
    paid: 0,
    blocked: 0,
    sets: [],
    ...over,
  }) as unknown as FarmCard

describe("Capture's Today digest", () => {
  it('flattens the sections to what the server takes, numbers whole', () => {
    const sections: FarmSection[] = [
      { key: 'domain', resin: '20', label: 'Domains', cards: [card(), card({ run: null })] },
    ]
    const digest = todayDigest(sections, 6, 'en')
    expect(todayDigestSchema.safeParse(digest).success).toBe(true)
    const [first, second] = digest.sections[0]!.cards
    expect(first).toMatchObject({ runs: 6, resin: 109, upperBound: false })
    expect(first!.items).toEqual([
      { key: 'TeachingsOfFreedom', name: expect.any(String), missing: 9 },
    ])
    // One name per person: Venti's own goal and the bow they hold; "item:" goals have no one.
    expect(first!.who).toHaveLength(1)
    expect(second).toMatchObject({ runs: null, resin: 0 })
  })
})

describe('alert facts from the Planner', () => {
  const now = Date.UTC(2026, 9, 31, 12)

  it('sends the hand-set resin, the capture and ticks still in force', () => {
    const rows: PlannerTask[] = [
      { kind: 'builtin', id: 'commissions', next: now + 3_600_000, updatedAt: now - 60_000 },
      { kind: 'builtin', id: 'bargains', next: now - 1, updatedAt: now - 9_000_000 },
      { kind: 'builtin', id: 'abyss', next: now + 1, updatedAt: now },
    ]
    const facts = alertFactsOf({
      capture: { value: 120, at: now - 600_000 },
      manual: null,
      captured: {
        at: now - 600_000,
        tasks: {
          resin: { value: 120, nextAt: now / 1000 + 60 },
          welkin: { days: 12 },
          expeditions: [{ id: 1, start: 1, hours: 20, doneAt: now / 1000 + 100 }],
        },
      },
      rows,
      now,
    })
    expect(facts).toEqual({
      manual: null,
      resin: { value: 120, at: now - 600_000 },
      clock: { value: 120, nextAt: now / 1000 + 60 },
      welkin: { days: 12, at: now - 600_000 },
      expeditions: { doneAt: [now + 100_000], at: now - 600_000 },
      ticks: { commissions: now - 60_000 },
    })
  })
})
