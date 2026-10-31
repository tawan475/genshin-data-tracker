import type { PlannerTask } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { alertFactsOf } from '../alert-facts'

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
