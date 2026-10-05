import { describe, expect, it } from 'vitest'
import { DAY, HOUR } from '@/data/chart-range'
import type { MaterialsHistory } from '@/data/materials-history'
import { chartPoints, flowBetween, frameChange, frameStart, rangeFrame } from '../material-stats'

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

/** A history of one key ("Mora") with the given counts per snapshot. */
function history(times: number[], counts: number[], lastSeenAt = times.at(-1)!): MaterialsHistory {
  return {
    times,
    lastSeenAt,
    series: new Map([['Mora', { at: counts.map((_, i) => i), value: counts }]]),
    latest: new Map([['Mora', counts.at(-1)!]]),
  }
}

describe('materials chart range', () => {
  const end = at(2026, 10, 5, 14, 20)

  it('keeps every snapshot of a short range, the count at its start carried in', () => {
    // A burst of six snapshots inside one hour, after an older one.
    const times = [end - 5 * HOUR, ...[50, 40, 30, 20, 10, 0].map((ago) => end - ago * 60_000)]
    const h = history(times, [100, 110, 120, 130, 140, 150, 160])
    const frame = rangeFrame(h, '1h')
    expect(frame.from).toBe(end - HOUR)
    expect(frame.carryIn).toBe(0)
    expect(frame.indices).toEqual([1, 2, 3, 4, 5, 6])
    expect(chartPoints(h, 'Mora', frame).map((p) => p.y)).toEqual([
      100, 110, 120, 130, 140, 150, 160,
    ])
    expect(frameChange(h, 'Mora', frame)).toBe(60)
    expect(flowBetween(h.series.get('Mora'), frame.baseline, 6).gained).toBe(60)
    expect(frameStart(h, frame)).toBe(end - HOUR)
  })

  it('draws the last known count flat when nothing was taken in the range', () => {
    // The newest snapshot was taken 5 hours before Irminsul last saw it unchanged.
    const h = history([end - 30 * HOUR, end - 5 * HOUR], [100, 200], end)
    const frame = rangeFrame(h, '1h')
    expect(frame.indices).toEqual([])
    expect(frame.carryIn).toBe(1)
    expect(frame.count).toBe(0)
    expect(chartPoints(h, 'Mora', frame)).toEqual([
      { x: end - HOUR, y: 200 },
      { x: end, y: 200 },
    ])
    expect(frameChange(h, 'Mora', frame)).toBe(0)
  })

  it('keeps the last snapshot per day over long spans', () => {
    const times: number[] = []
    for (let d = 200; d >= 0; d--) {
      times.push(end - d * DAY - 2 * HOUR, end - d * DAY)
    }
    const h = history(
      times,
      times.map((_, i) => i),
    )
    const year = rangeFrame(h, '1y')
    expect(year.indices.length).toBe(201)
    // 14 days: every snapshot is kept per hour (two a day, two hours apart).
    const fortnight = rangeFrame(h, '14d')
    expect(fortnight.indices.length).toBe(fortnight.count)
    // 3 days: every snapshot.
    const days = rangeFrame(h, '3d')
    expect(days.indices.length).toBe(days.count)
  })
})
