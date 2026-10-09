import type { SnapshotSummary } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { DAY, HOUR } from '@/data/chart-range'
import type { Capture } from '@/data/overview'
import {
  buildProgression,
  buildSnapshotProgression,
  captureChanges,
  defaultGroup,
  MAX_PERIODS,
  periodTotals,
  SNAPSHOT_BAR_WIDTH,
  snapshotBarWidth,
  snapshotTotals,
} from '../progression-series'

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

describe('per snapshot', () => {
  const last = at(2026, 10, 5, 22, 35)
  // A capture before the range, then four in the last hour: a re-sighting, a
  // primogem-only change, a gain and a loss in mora.
  const captures: Capture[] = [
    { at: at(2026, 10, 5, 18), summary: summary(1_000, 10) },
    { at: at(2026, 10, 5, 21, 40), summary: summary(1_000, 10) },
    { at: at(2026, 10, 5, 21, 55), summary: summary(1_000, 30) },
    { at: at(2026, 10, 5, 22, 10), summary: summary(1_500, 30) },
    { at: last, summary: summary(1_200, 30) },
  ]

  it('gives each capture its change, skipping the ones that changed nothing', () => {
    expect(captureChanges(captures, 1, 1_000, 'mora')).toEqual([
      { at: at(2026, 10, 5, 22, 10), change: 500, value: 1_500 },
      { at: last, change: -300, value: 1_200 },
    ])
    // The first capture in the range against the value carried in.
    expect(captureChanges(captures, 1, 900, 'mora')[0]).toEqual({
      at: at(2026, 10, 5, 21, 40),
      change: 100,
      value: 1_000,
    })
    expect(captureChanges(captures, 1, 10, 'primogem')).toEqual([
      { at: at(2026, 10, 5, 21, 55), change: 20, value: 30 },
    ])
  })

  it('puts every bar under a step of the line, on the same time axis', () => {
    const s = buildSnapshotProgression(captures, '1h')!
    // The range is the hour up to the newest capture, not snapped to 22:00.
    const from = last - HOUR
    expect(s.domain).toEqual([from, last])
    expect(s.open).toMatchObject({ mora: 1_000, primogem: 10 })
    expect(s.truncated).toBe(false)
    for (const key of ['mora', 'primogem'] as const) {
      const line = s.lines[key]
      expect([line[0]!.x, line.at(-1)!.x]).toEqual(s.domain)
      // Each change is where the line steps to its value.
      for (const change of s.changes[key]) {
        expect(line).toContainEqual({ x: change.at, y: change.value })
        expect(change.at).toBeGreaterThan(s.domain[0])
        expect(change.at).toBeLessThanOrEqual(s.domain[1])
      }
    }
    expect(s.changes.mora.map((c) => c.change)).toEqual([500, -300])
    expect(snapshotTotals(s, 'mora')).toEqual({ last: 1_200, net: 200, gained: 500, spent: 300 })
    expect(snapshotTotals(s, 'primogem')).toEqual({ last: 30, net: 20, gained: 20, spent: 0 })
  })

  it('starts all history at the first capture, which has nothing to change from', () => {
    const s = buildSnapshotProgression(captures, 'all')!
    expect(s.domain).toEqual([captures[0]!.at, last])
    expect(s.changes.mora.map((c) => c.at)).toEqual([at(2026, 10, 5, 22, 10), last])
    expect(snapshotTotals(s, 'mora').net).toBe(200)
  })

  it('carries the value in when nothing changed in the range', () => {
    const quiet = [...captures, { at: last + 3 * HOUR, summary: summary(1_200, 30) }]
    const s = buildSnapshotProgression(quiet, '1h')!
    for (const changes of Object.values(s.changes)) expect(changes).toEqual([])
    expect(s.lines.mora).toEqual([
      { x: last + 2 * HOUR, y: 1_200 },
      { x: last + 3 * HOUR, y: 1_200 },
    ])
    expect(snapshotTotals(s, 'mora')).toEqual({ last: 1_200, net: 0, gained: 0, spent: 0 })
  })

  it('keeps the newest bars past the cap, starting the line with them', () => {
    const many: Capture[] = Array.from({ length: MAX_PERIODS + 10 }, (_, i) => ({
      at: at(2026, 1, 1) + i * HOUR,
      // Mora changes every capture, primogems never.
      summary: summary(1_000 + i, 5),
    }))
    const s = buildSnapshotProgression(many, 'all')!
    expect(s.truncated).toBe(true)
    expect(s.changes.mora.length).toBe(MAX_PERIODS)
    const firstKept = many.length - MAX_PERIODS
    expect(s.changes.mora[0]!.at).toBe(many[firstKept]!.at)
    // Measured against the capture before, where the line and axis start.
    expect(s.open.mora).toBe(many[firstKept - 1]!.summary.mora)
    expect(s.domain).toEqual([many[firstKept - 1]!.at, many.at(-1)!.at])
    expect(s.lines.mora[0]).toEqual({ x: s.domain[0], y: s.open.mora })
  })

  it('thins bars as they crowd, within bounds', () => {
    expect(snapshotBarWidth(4, 560)).toBe(SNAPSHOT_BAR_WIDTH.max)
    expect(snapshotBarWidth(50, 560)).toBe(6)
    expect(snapshotBarWidth(550, 560)).toBe(SNAPSHOT_BAR_WIDTH.min)
    expect(snapshotBarWidth(0, 560)).toBe(SNAPSHOT_BAR_WIDTH.max)
    expect(snapshotBarWidth(10, 0)).toBe(SNAPSHOT_BAR_WIDTH.max)
  })

  it('defaults to snapshots up to a week, days beyond', () => {
    expect(defaultGroup('1h')).toBe('snapshot')
    expect(defaultGroup('7d')).toBe('snapshot')
    expect(defaultGroup('14d')).toBe('day')
    expect(defaultGroup('all')).toBe('day')
  })
})

describe('any figure, not only currency', () => {
  it('charts artifact counts per snapshot: a bar for each capture that changed them', () => {
    const t = (h: number) => at(2026, 10, 9, h)
    const withArtifacts = (artifacts: number): SnapshotSummary => ({
      ...summary(1_000, 10),
      artifacts,
    })
    const captures: Capture[] = [
      { at: t(1), summary: withArtifacts(100) },
      { at: t(2), summary: withArtifacts(100) },
      { at: t(3), summary: withArtifacts(104) },
      { at: t(4), summary: withArtifacts(101) },
    ]
    const s = buildSnapshotProgression(captures, '1d')!
    expect(s.changes.artifacts.map((c) => c.change)).toEqual([4, -3])
    expect(snapshotTotals(s, 'artifacts')).toEqual({ last: 101, net: 1, gained: 4, spent: 3 })
    expect(s.changes.mora).toEqual([])
  })
})
