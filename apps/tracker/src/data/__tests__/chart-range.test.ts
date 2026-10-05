import type { SnapshotSummary } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import {
  axisFormat,
  axisTick,
  axisTicks,
  CHART_RANGE_GROUPS,
  CHART_RANGES,
  DAY,
  DEFAULT_CHART_RANGE,
  finerBucket,
  fitGroupBy,
  formatRangeEdge,
  formatWindow,
  groupFits,
  HOUR,
  hourTick,
  parseChartRange,
  pointBucket,
  rangeLength,
  rangeStart,
  tickCount,
  timeTicks,
  type ChartRange,
} from '../chart-range'
import { historyWindow, rangeFigure, stepSeries, type Capture } from '../overview'

// The runtime's own locale and time zone apply: times are built in local
// time and labels compared with the same Intl options.
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, options)

describe('chart ranges', () => {
  it('offers the eleven ranges in order, each once in the select', () => {
    expect(CHART_RANGES).toEqual([
      '1h',
      '3h',
      '6h',
      '12h',
      '1d',
      '3d',
      '7d',
      '14d',
      '30d',
      '1y',
      'all',
    ])
    expect(CHART_RANGE_GROUPS.flatMap((g) => g.ranges)).toEqual(CHART_RANGES)
    expect(CHART_RANGE_GROUPS.map((g) => g.label)).toEqual(['Hours', 'Days', null])
  })

  it('falls back to 30d for anything no longer offered', () => {
    expect(DEFAULT_CHART_RANGE).toBe('30d')
    expect(parseChartRange('1h')).toBe('1h')
    expect(parseChartRange('all')).toBe('all')
    expect(parseChartRange('90d')).toBe('30d')
    expect(parseChartRange(null)).toBe('30d')
    expect(parseChartRange('toString')).toBe('30d')
  })

  it('starts a range that long before its end', () => {
    const end = at(2026, 10, 5, 14, 20)
    expect(rangeStart('1h', end)).toBe(end - HOUR)
    expect(rangeStart('12h', end)).toBe(end - 12 * HOUR)
    expect(rangeStart('14d', end)).toBe(end - 14 * DAY)
    expect(rangeStart('1y', end)).toBe(end - 365 * DAY)
    expect(rangeStart('all', end)).toBe(-Infinity)
    expect(rangeLength('all')).toBe(Infinity)
  })
})

describe('bucketing', () => {
  it('keeps every capture up to a week, then hours, then days', () => {
    expect(pointBucket(HOUR)).toBe('raw')
    expect(pointBucket(7 * DAY)).toBe('raw')
    expect(pointBucket(7 * DAY + 1)).toBe('hour')
    expect(pointBucket(90 * DAY)).toBe('hour')
    expect(pointBucket(365 * DAY)).toBe('day')
  })

  it('never draws a line coarser than its bars', () => {
    expect(finerBucket('day', 'month')).toBe('day')
    expect(finerBucket('day', 'hour')).toBe('hour')
    expect(finerBucket('raw', 'hour')).toBe('raw')
  })

  it('fits the grouping to the range', () => {
    const fits = (range: ChartRange) =>
      (['hour', 'day', 'month', 'year'] as const).filter((g) => groupFits(range, g))
    expect(fits('1h')).toEqual(['hour'])
    expect(fits('1d')).toEqual(['hour'])
    expect(fits('3d')).toEqual(['hour', 'day'])
    expect(fits('30d')).toEqual(['hour', 'day'])
    expect(fits('1y')).toEqual(['hour', 'day', 'month'])
    expect(fits('all')).toEqual(['hour', 'day', 'month', 'year'])

    // An hour range never collapses into one day (or month) bar.
    expect(fitGroupBy('6h', 'day')).toBe('hour')
    expect(fitGroupBy('1h', 'year')).toBe('hour')
    expect(fitGroupBy('30d', 'month')).toBe('day')
    expect(fitGroupBy('1y', 'year')).toBe('month')
    // A choice that fits stays.
    expect(fitGroupBy('7d', 'day')).toBe('day')
    expect(fitGroupBy('all', 'year')).toBe('year')
    expect(fitGroupBy('1d', 'hour')).toBe('hour')
  })
})

describe('axis labels', () => {
  it('reads times up to a day, day and time up to a week, dates, then months', () => {
    const format = (range: ChartRange) => axisFormat(rangeLength(range))
    expect(['1h', '3h', '6h', '12h', '1d'].map((r) => format(r as ChartRange))).toEqual(
      Array(5).fill('time'),
    )
    expect(format('3d')).toBe('day-time')
    expect(format('7d')).toBe('day-time')
    expect(format('14d')).toBe('date')
    expect(format('30d')).toBe('date')
    expect(format('1y')).toBe('month')
    expect(axisFormat(180 * DAY)).toBe('date')
    // A 1d range snapped to whole hours spans up to 25 hours.
    expect(axisFormat(25 * HOUR)).toBe('time')
    // A young account's "All" is labelled by what it spans.
    expect(axisFormat(5 * HOUR)).toBe('time')
  })

  it('formats ticks by kind and clock', () => {
    const afternoon = at(2026, 10, 5, 15, 0)
    const midnight = at(2026, 10, 5)
    const time = fmt({ hour: 'numeric', minute: '2-digit', hour12: false })
    const day = fmt({ month: 'short', day: 'numeric' })
    expect(axisTick(afternoon, 'time', false)).toBe(time.format(afternoon))
    expect(axisTick(afternoon, 'time', false)).toMatch(/15:00/)
    expect(axisTick(afternoon, 'time', true)).toMatch(/^3:00\s(PM|pm)$/)
    // Day and time: the date alone at midnight, the time added otherwise.
    expect(axisTick(midnight, 'day-time', false)).toBe(day.format(midnight))
    expect(axisTick(afternoon, 'day-time', false)).toContain(day.format(afternoon))
    expect(axisTick(afternoon, 'day-time', false)).toMatch(/15:00/)
    expect(axisTick(afternoon, 'date', false)).toBe(day.format(afternoon))
    expect(axisTick(afternoon, 'month', false)).toBe(
      fmt({ month: 'short', year: 'numeric' }).format(afternoon),
    )
    // Hour columns: the time alone when the bars span a day.
    expect(hourTick(afternoon, 'time', false)).toBe(time.format(afternoon))
    expect(hourTick(afternoon, 'day-time', false)).toContain(day.format(afternoon))
  })

  it('fits two to six ticks to the width', () => {
    expect(tickCount(1000, 'time')).toBe(6)
    expect(tickCount(300, 'day-time')).toBe(2)
    expect(tickCount(40, 'date')).toBe(2)
    expect(tickCount(430, 'date')).toBe(6)
  })

  it('puts ticks on round local times', () => {
    const min = at(2026, 10, 5, 10, 7)
    const hour = timeTicks(min, min + HOUR, 6)
    expect(hour).toEqual([10, 20, 30, 40, 50, 60].map((m) => at(2026, 10, 5, 10, m)))

    const day = timeTicks(min, min + DAY, 6)
    expect(day.length).toBeLessThanOrEqual(6)
    expect(day.length).toBeGreaterThanOrEqual(3)
    for (const t of day) expect(new Date(t).getMinutes()).toBe(0)
    expect(new Set(day.map((t, i) => (i ? t - day[i - 1]! : 0)).slice(1)).size).toBe(1)

    const week = timeTicks(min, min + 7 * DAY, 6)
    for (const t of week) expect(new Date(t).getHours()).toBe(0)

    // Past half a year the steps are whole months, as the month labels need.
    for (const width of [160, 300, 600]) {
      const ticks = timeTicks(min, min + 181 * DAY, tickCount(width, 'month'))
      for (const t of ticks) expect(new Date(t).getDate()).toBe(1)
    }

    const year = timeTicks(min, min + 365 * DAY, 6)
    expect(year.length).toBeLessThanOrEqual(6)
    for (const t of year) {
      expect(new Date(t).getDate()).toBe(1)
      expect(new Date(t).getHours()).toBe(0)
    }

    for (const ticks of [hour, day, week, year]) {
      for (const t of ticks) {
        expect(t).toBeGreaterThanOrEqual(min)
      }
    }
    expect(timeTicks(min, min, 6)).toEqual([min])
    expect(timeTicks(-Infinity, min, 6)).toEqual([])
  })

  it('fits more date-only ticks on a narrow week', () => {
    const min = at(2026, 9, 28, 23, 3)
    const max = min + 7 * DAY
    // 250px holds two "Oct 5, 3:00 PM" labels; at midnight they read "Oct 5".
    const narrow = axisTicks(min, max, 250, 'day-time')
    expect(narrow.length).toBeGreaterThanOrEqual(2)
    for (const t of narrow) expect(new Date(t).getHours()).toBe(0)
    // Wide enough for times between the days, they stay.
    const wide = axisTicks(min, min + 2 * DAY, 1000, 'day-time')
    expect(wide.some((t) => new Date(t).getHours() !== 0)).toBe(true)
  })

  it('names a window with times when it is a week or shorter', () => {
    const to = at(2026, 10, 5, 14, 10)
    const dateTime = fmt({
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    })
    const date = fmt({ year: 'numeric', month: 'short', day: 'numeric' })
    // One day: the end as a time only.
    expect(formatWindow(to - HOUR, to, false)).toBe(`${dateTime.format(to - HOUR)} – 14:10`)
    expect(formatWindow(to - 2 * DAY, to, false)).toBe(
      `${dateTime.format(to - 2 * DAY)} – ${dateTime.format(to)}`,
    )
    expect(formatWindow(to - 30 * DAY, to, false)).toBe(
      `${date.format(to - 30 * DAY)} – ${date.format(to)}`,
    )
    expect(formatRangeEdge(to, HOUR, false)).toBe(dateTime.format(to))
    expect(formatRangeEdge(to, 30 * DAY, false)).toBe(date.format(to))
  })
})

// ------------------------------------------------------------ overview window

const summary = (mora: number, primogem = 100): SnapshotSummary => ({
  characters: 1,
  weapons: 1,
  artifacts: 1,
  materials: 1,
  mora,
  primogem,
  artifact3: 0,
  artifact4: 0,
})

describe('history window', () => {
  const last = at(2026, 10, 5, 14, 20)
  const captures: Capture[] = [
    { at: last - 3 * DAY, summary: summary(1000) },
    { at: last - 5 * HOUR, summary: summary(2000) },
    { at: last - 20 * 60_000, summary: summary(2500) },
    { at: last, summary: summary(3000) },
  ]

  it('carries the value held at the start of a short range in', () => {
    const view = historyWindow(captures, '1h')
    expect(view.count).toBe(2)
    expect(view.from).toBe(last - HOUR)
    expect(view.to).toBe(last)
    expect(view.captures.map((c) => [c.at, c.summary.mora])).toEqual([
      [last - HOUR, 2000],
      [last - 20 * 60_000, 2500],
      [last, 3000],
    ])
    // The change is measured from what was held when the hour opened.
    expect(rangeFigure(view.captures, 'mora')).toEqual({ last: 3000, change: 1000 })
    expect(stepSeries(view.captures, 'mora')).toHaveLength(3)
  })

  it('draws a flat line when the range holds only the newest capture', () => {
    const flat = historyWindow(
      [
        { at: last - 5 * HOUR, summary: summary(2000) },
        { at: last, summary: summary(2000) },
      ],
      '1h',
    )
    expect(flat.count).toBe(1)
    expect(stepSeries(flat.captures, 'mora')).toEqual([
      { x: last - HOUR, y: 2000 },
      { x: last, y: 2000 },
    ])
  })

  it('starts at the first capture when history is shorter than the range', () => {
    const view = historyWindow(captures, 'all')
    expect(view.count).toBe(4)
    expect(view.from).toBe(last - 3 * DAY)
    expect(view.captures).toHaveLength(4)
    expect(historyWindow(captures, '30d').captures).toHaveLength(4)
  })

  it('carries nothing in when a capture sits on the range start', () => {
    const view = historyWindow(captures, '3d')
    expect(view.captures[0]!.at).toBe(last - 3 * DAY)
    expect(view.captures).toHaveLength(4)
  })

  it('is empty without captures', () => {
    expect(historyWindow([], '1h')).toEqual({ captures: [], count: 0, from: 0, to: 0 })
  })
})
