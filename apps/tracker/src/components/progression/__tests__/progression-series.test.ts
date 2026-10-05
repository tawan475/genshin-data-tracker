import type { SnapshotSummary } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { DAY, HOUR } from '@/data/chart-range'
import type { Capture } from '@/data/overview'
import { buildProgression, periodTotals } from '../progression-series'

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

const summary = (mora: number, primogem: number): SnapshotSummary => ({
  characters: 1,
  weapons: 1,
  artifacts: 1,
  materials: 1,
  mora,
  primogem,
  artifact3: 0,
  artifact4: 0,
})

describe('progression over short ranges', () => {
  const last = at(2026, 10, 5, 14, 20)
  // One capture 5 hours back, then one every ten minutes for the last hour.
  const captures: Capture[] = [
    { at: last - 5 * HOUR, summary: summary(1_000, 10) },
    ...[50, 40, 30, 20, 10, 0].map((ago, i) => ({
      at: last - ago * 60_000,
      summary: summary(2_000 + i * 100, 20 + i),
    })),
  ]

  it('draws every capture in an hour, not one point per hour', () => {
    const p = buildProgression(captures, 'hour', '1h')!
    expect(p.lineBucket).toBe('raw')
    // The value held when the range opens, then all six captures.
    expect(p.lines.mora.map((point) => point.y)).toEqual([
      1_000, 2_000, 2_100, 2_200, 2_300, 2_400, 2_500,
    ])
    expect(p.lines.mora[0]!.x).toBe(at(2026, 10, 5, 13))
    // Bars per hour: 13:00 (three captures) and 14:00 (three).
    expect(p.periods.map((period) => [period.start, period.captures])).toEqual([
      [at(2026, 10, 5, 13), 3],
      [at(2026, 10, 5, 14), 3],
    ])
    expect(p.periods.map((period) => period.change.mora)).toEqual([1_200, 300])
    expect(periodTotals(p, 'mora')).toEqual({ last: 2_500, net: 1_500, gained: 1_500, spent: 0 })
  })

  it('keeps the closing capture per period on long spans', () => {
    const daily: Capture[] = []
    for (let d = 0; d < 200; d++) {
      // Two captures a day: the evening one closes the day.
      daily.push({ at: at(2026, 1, 1, 9) + d * DAY, summary: summary(d * 10, 1) })
      daily.push({ at: at(2026, 1, 1, 21) + d * DAY, summary: summary(d * 10 + 5, 1) })
    }
    const p = buildProgression(daily, 'month', 'all')!
    // Day closes under month bars: finer than the bars, lighter than every capture.
    expect(p.lineBucket).toBe('day')
    // The first capture as the opening value, then one close per day.
    expect(p.lines.mora.length).toBe(201)
    expect(p.lines.mora.at(-1)!.y).toBe(1_995)

    const hourly = buildProgression(daily, 'hour', '30d')!
    expect(hourly.lineBucket).toBe('hour')
  })
})
