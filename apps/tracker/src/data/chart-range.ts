/**
 * The time ranges every history chart offers (Overview, Progression,
 * Materials) and the pure rules that keep short ranges readable: where a
 * range starts, how its x axis is labelled, and how finely captures are
 * bucketed.
 *
 * A range ends at the account's newest capture (a snapshot, or Irminsul
 * seeing the same inventory again), not at the current time, as the charts
 * always have: "3h" is the last three hours of recorded play, so an account
 * last captured yesterday still shows that session instead of a flat line.
 * Each chart carries the value held when the range opens in at its start, so
 * a range with one capture inside (or none, when the newest capture is a
 * re-sighting) draws the known value as a flat line rather than a lone dot.
 */

import type { TimelineGroupBy } from '@gdt/shared'

export type ChartRange =
  | '1h'
  | '3h'
  | '6h'
  | '12h'
  | '1d'
  | '3d'
  | '7d'
  | '14d'
  | '30d'
  | '1y'
  | 'all'

export const DEFAULT_CHART_RANGE: ChartRange = '30d'

export const HOUR = 3_600_000
export const DAY = 86_400_000

const RANGE_MS: Record<ChartRange, number> = {
  '1h': HOUR,
  '3h': 3 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '1d': DAY,
  '3d': 3 * DAY,
  '7d': 7 * DAY,
  '14d': 14 * DAY,
  '30d': 30 * DAY,
  '1y': 365 * DAY,
  all: Infinity,
}

/** Shortest first. */
export const CHART_RANGES = Object.keys(RANGE_MS) as ChartRange[]

/** The range select's layout: hours, days, then the long ranges on their own. */
export const CHART_RANGE_GROUPS: { label: string | null; ranges: ChartRange[] }[] = [
  { label: 'Hours', ranges: ['1h', '3h', '6h', '12h'] },
  { label: 'Days', ranges: ['1d', '3d', '7d', '14d', '30d'] },
  { label: null, ranges: ['1y', 'all'] },
]

export function rangeLabel(range: ChartRange): string {
  return range === 'all' ? 'All' : range
}

export function isChartRange(value: unknown): value is ChartRange {
  return typeof value === 'string' && Object.hasOwn(RANGE_MS, value)
}

/** A stored choice, or the default when nothing is stored or it is no longer offered (90d). */
export function parseChartRange(value: unknown): ChartRange {
  return isChartRange(value) ? value : DEFAULT_CHART_RANGE
}

/** Length in ms; Infinity for all history. */
export function rangeLength(range: ChartRange): number {
  return RANGE_MS[range]
}

/** Where a range ending at `end` (the newest capture) starts; -Infinity for all history. */
export function rangeStart(range: ChartRange, end: number): number {
  return end - RANGE_MS[range]
}

// ------------------------------------------------------------------ buckets

/** Every capture, or the last one per local hour / day. */
export type PointBucket = 'raw' | 'hour' | 'day'

/**
 * How finely a line spanning `span` ms keeps its captures: every capture up
 * to a week, so an hour range never collapses into one point (a few
 * captures a day make a week a few dozen points); the last per hour up to
 * 90 days; the last per day beyond, so years of history stay light.
 */
export function pointBucket(span: number): PointBucket {
  if (span <= 7 * DAY) return 'raw'
  if (span <= 90 * DAY) return 'hour'
  return 'day'
}

const FINENESS: Record<PointBucket | TimelineGroupBy, number> = {
  raw: 0,
  hour: 1,
  day: 2,
  month: 3,
  year: 4,
}

/** The finer of two buckets (a line is never coarser than the bars under it). */
export function finerBucket(
  a: PointBucket | TimelineGroupBy,
  b: PointBucket | TimelineGroupBy,
): PointBucket | TimelineGroupBy {
  return FINENESS[a] <= FINENESS[b] ? a : b
}

/** Nominal period lengths, to tell whether a grouping fits a range. */
const PERIOD_MS: Record<TimelineGroupBy, number> = {
  hour: HOUR,
  day: DAY,
  month: 30 * DAY,
  year: 365 * DAY,
}

const GROUPS: TimelineGroupBy[] = ['hour', 'day', 'month', 'year']

/**
 * A per-period grouping fits a range that holds at least two of its periods
 * (per day needs 2d or more); per hour always fits, as the finest.
 */
export function groupFits(range: ChartRange, groupBy: TimelineGroupBy): boolean {
  return groupBy === 'hour' || RANGE_MS[range] >= 2 * PERIOD_MS[groupBy]
}

/**
 * The grouping a chart uses: the chosen one when it fits the range, else the
 * coarsest finer one that does ("Per day" over 6h becomes per hour instead
 * of a single bar). The choice itself is kept for longer ranges.
 */
export function fitGroupBy(range: ChartRange, chosen: TimelineGroupBy): TimelineGroupBy {
  for (let i = GROUPS.indexOf(chosen); i > 0; i--) {
    if (groupFits(range, GROUPS[i]!)) return GROUPS[i]!
  }
  return 'hour'
}

// --------------------------------------------------------------------- axis

/** Times of day, day + time, dates, or months. */
export type AxisFormat = 'time' | 'day-time' | 'date' | 'month'

/**
 * Tick labels for an x axis spanning `span` ms: times of day up to a day,
 * day and time up to a week, dates beyond, months past half a year (whose
 * ticks always fall on month starts, see timeTicks). The slack covers ranges
 * snapped to whole periods (a 1d range grouped per hour spans up to 25 hours).
 */
export function axisFormat(span: number): AxisFormat {
  if (span <= DAY + HOUR) return 'time'
  if (span <= 8 * DAY) return 'day-time'
  if (span <= 180 * DAY) return 'date'
  return 'month'
}

interface Formats {
  time: Intl.DateTimeFormat
  hour: Intl.DateTimeFormat
  day: Intl.DateTimeFormat
  dayTime: Intl.DateTimeFormat
  month: Intl.DateTimeFormat
}

const formatCache = new Map<boolean, Formats>()

function formats(hour12: boolean): Formats {
  let f = formatCache.get(hour12)
  if (!f) {
    const make = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(undefined, options)
    f = {
      time: make({ hour: 'numeric', minute: '2-digit', hour12 }),
      hour: make({ month: 'short', day: 'numeric', hour: 'numeric', hour12 }),
      day: make({ month: 'short', day: 'numeric' }),
      dayTime: make({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12 }),
      month: make({ month: 'short', year: 'numeric' }),
    }
    formatCache.set(hour12, f)
  }
  return f
}

function isMidnight(ms: number): boolean {
  const d = new Date(ms)
  return d.getHours() === 0 && d.getMinutes() === 0
}

/**
 * One x-axis tick: "3:00 PM" / "15:00"; "Oct 5" at midnight and
 * "Oct 5, 3:00 PM" otherwise; "Oct 5"; "Oct 2026". Tooltips carry the full
 * date and time.
 */
export function axisTick(ms: number, format: AxisFormat, hour12: boolean): string {
  const f = formats(hour12)
  if (format === 'time') return f.time.format(ms)
  if (format === 'day-time') return isMidnight(ms) ? f.day.format(ms) : f.dayTime.format(ms)
  if (format === 'date') return f.day.format(ms)
  return f.month.format(ms)
}

/** A period's column label on a per-hour bar chart: the time alone when the bars span a day. */
export function hourTick(ms: number, format: AxisFormat, hour12: boolean): string {
  const f = formats(hour12)
  return format === 'time' ? f.time.format(ms) : f.hour.format(ms)
}

/** Room one tick label needs at 12px, gap included, per format. */
const TICK_WIDTH: Record<AxisFormat, number> = { time: 72, 'day-time': 116, date: 64, month: 80 }

/** How many ticks fit an axis `width` px wide (2 to 6). */
export function tickCount(width: number, format: AxisFormat): number {
  return Math.max(2, Math.min(6, Math.floor(width / TICK_WIDTH[format])))
}

type TickUnit = 'minute' | 'hour' | 'day' | 'month' | 'year'

const UNIT_MS: Record<TickUnit, number> = {
  minute: 60_000,
  hour: HOUR,
  day: DAY,
  month: 30.44 * DAY,
  year: 365.25 * DAY,
}

const STEPS: [TickUnit, number][] = [
  ['minute', 1],
  ['minute', 5],
  ['minute', 10],
  ['minute', 15],
  ['minute', 30],
  ['hour', 1],
  ['hour', 2],
  ['hour', 3],
  ['hour', 6],
  ['hour', 12],
  ['day', 1],
  ['day', 2],
  ['day', 3],
  ['day', 7],
  ['day', 14],
  ['month', 1],
  ['month', 2],
  ['month', 3],
  ['month', 6],
  ['year', 1],
  ['year', 2],
  ['year', 5],
  ['year', 10],
  ['year', 25],
  ['year', 100],
]

/** Local days since 1970-01-01 (DST-proof: counts calendar days). */
function localDay(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
}

/** The first boundary of `n` `unit`s at or before `ms`, in local time. */
function floorTo(ms: number, unit: TickUnit, n: number): Date {
  const d = new Date(ms)
  if (unit === 'minute') {
    d.setSeconds(0, 0)
    d.setMinutes(Math.floor(d.getMinutes() / n) * n)
  } else if (unit === 'hour') {
    d.setMinutes(0, 0, 0)
    d.setHours(Math.floor(d.getHours() / n) * n)
  } else {
    d.setHours(0, 0, 0, 0)
    if (unit === 'day') {
      // Multi-day steps line up on Mondays (1970-01-05 was one), so they don't shift with the range.
      if (n > 1) d.setDate(d.getDate() - ((((localDay(d) - 4) % n) + n) % n))
    } else if (unit === 'month') {
      d.setDate(1)
      d.setMonth(Math.floor(d.getMonth() / n) * n)
    } else {
      d.setMonth(0, 1)
      d.setFullYear(Math.floor(d.getFullYear() / n) * n)
    }
  }
  return d
}

function advance(d: Date, unit: TickUnit, n: number): void {
  if (unit === 'minute') d.setMinutes(d.getMinutes() + n)
  else if (unit === 'hour') d.setHours(d.getHours() + n)
  else if (unit === 'day') d.setDate(d.getDate() + n)
  else if (unit === 'month') d.setMonth(d.getMonth() + n)
  else d.setFullYear(d.getFullYear() + n)
}

/**
 * Up to `max` x-axis ticks between `min` and `max` ms on round local times
 * (every 15 minutes, 3 hours, day, Monday, month…): the finest step whose
 * ticks fit. An axis too narrow for any round time gets one tick at its start.
 */
export function timeTicks(min: number, max: number, maxTicks: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (!(max > min)) return [min]
  for (const [unit, n] of STEPS) {
    // Skip steps that obviously make too many ticks before walking them.
    if ((max - min) / (UNIT_MS[unit] * n) > maxTicks + 1) continue
    const ticks: number[] = []
    const d = floorTo(min, unit, n)
    while (d.getTime() < min) advance(d, unit, n)
    while (d.getTime() <= max && ticks.length <= maxTicks) {
      ticks.push(d.getTime())
      advance(d, unit, n)
    }
    if (ticks.length <= maxTicks && ticks.length > 0) return ticks
  }
  return [min]
}

/**
 * The ticks for an axis `width` px wide: timeTicks with as many as fit the
 * labels. Day-and-time ticks that all fall on midnight read as dates alone,
 * which are narrower, so more of them fit.
 */
export function axisTicks(min: number, max: number, width: number, format: AxisFormat): number[] {
  const ticks = timeTicks(min, max, tickCount(width, format))
  if (format === 'day-time' && ticks.every(isMidnight)) {
    const daily = timeTicks(min, max, tickCount(width, 'date'))
    if (daily.every(isMidnight)) return daily
  }
  return ticks
}

// ------------------------------------------------------------------- labels

const edgeFormats = new Map<boolean, { dateTime: Intl.DateTimeFormat; date: Intl.DateTimeFormat }>()

/**
 * One end of a chart's window: date and time when the window is a week or
 * shorter ("Oct 5, 2026, 3:10 PM"), the date alone beyond.
 */
export function formatRangeEdge(ms: number, span: number, hour12: boolean): string {
  let f = edgeFormats.get(hour12)
  if (!f) {
    f = {
      dateTime: new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12,
      }),
      date: new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    }
    edgeFormats.set(hour12, f)
  }
  return span <= 8 * DAY ? f.dateTime.format(ms) : f.date.format(ms)
}

/** "Oct 5, 2026, 1:10 PM – 2:10 PM", "Oct 3, 2026, 9:00 AM – Oct 5, 2026, 2:10 PM", "Sep 5, 2026 – Oct 5, 2026". */
export function formatWindow(from: number, to: number, hour12: boolean): string {
  const span = to - from
  const start = formatRangeEdge(from, span, hour12)
  if (span <= 8 * DAY && new Date(from).toDateString() === new Date(to).toDateString()) {
    return `${start} – ${formats(hour12).time.format(to)}`
  }
  return `${start} – ${formatRangeEdge(to, span, hour12)}`
}
