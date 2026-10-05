/**
 * Mora and primogems for the progression charts: a stepped line through the
 * captures, and the change under it either per period (hour / day / month /
 * year: each period's closing value against the period before) or per
 * snapshot (each capture that changed a figure against the capture before,
 * on the line's own time axis so every bar sits under its step). Pure: the
 * component calls it through computed().
 *
 * Short ranges stay detailed: the component fits the grouping to the range
 * (fitGroupBy: "Per day" over 6h shows hours), and the line keeps every
 * capture up to a week (pointBucket), never coarser than the bars (every
 * capture, per snapshot).
 *
 * Captures come from buildHistory, so a capture that missed the currency
 * packet already carries the previous mora and primogems. Leading captures
 * with nothing to carry (still 0 / 0) are left out rather than drawn as 0.
 */

import type { TimelineGroupBy } from '@gdt/shared'
import {
  DAY,
  finerBucket,
  hourTick,
  pointBucket,
  rangeLength,
  rangeStart,
  type AxisFormat,
  type ChartRange,
  type PointBucket,
} from '@/data/chart-range'
import { periodStart } from '@/data/materials-history'
import { currencyMissing, type Capture, type Point } from '@/data/overview'
import { nextPeriod } from '@/data/progression'

export type CurrencyKey = 'mora' | 'primogem'
export const CURRENCY_KEYS: readonly CurrencyKey[] = ['mora', 'primogem']

/** The bar charts' grouping: every capture, or a period. */
export type ProgressionGroup = 'snapshot' | TimelineGroupBy

/**
 * The grouping until one is picked on this device: per snapshot up to a
 * week, where captures are few enough to read one by one; per day beyond.
 */
export function defaultGroup(range: ChartRange): ProgressionGroup {
  return rangeLength(range) <= 7 * DAY ? 'snapshot' : 'day'
}

/**
 * Most bars drawn at once, periods or snapshots (hourly over years would be
 * tens of thousands). Older ones are left out and the line starts with the
 * bars.
 */
export const MAX_PERIODS = 3000

/** Longest a period can be (DST adds an hour), to bound the walk back from the newest. */
const LONGEST: Record<TimelineGroupBy, number> = {
  hour: 3_600_000,
  day: DAY + 3_600_000,
  month: 31 * DAY + 3_600_000,
  year: 366 * DAY + 3_600_000,
}

type Figures = Record<CurrencyKey, number>

export interface Period {
  /** Local start of the period (epoch ms). */
  start: number
  /** Captures inside the period. */
  captures: number
  /** At the period's last capture; carried from before when it has none. */
  close: Figures
  /** Against the previous period's close (the first period: against `open`). */
  change: Figures
}

export interface Progression {
  /** Oldest first, every period from the start of the range to the newest capture. */
  periods: Period[]
  /**
   * Stepped line per figure from the value held at the range start: every
   * capture, or the closing capture per `lineBucket`.
   */
  lines: Record<CurrencyKey, Point[]>
  lineBucket: PointBucket | TimelineGroupBy
  /** What the first period is measured against. */
  open: Figures
  /** Older periods were dropped to stay within MAX_PERIODS. */
  truncated: boolean
}

function figures(capture: Capture): Figures {
  return { mora: capture.summary.mora, primogem: capture.summary.primogem }
}

/** First index whose `at` is >= `from`. */
function lowerBound(captures: readonly Capture[], from: number): number {
  let lo = 0
  let hi = captures.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (captures[mid]!.at < from) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Drops repeats of a value (the step line draws them anyway), keeping the
 * final point so the line reaches the newest capture.
 */
function dedupe(points: Point[]): Point[] {
  const out: Point[] = []
  points.forEach((point, i) => {
    if (i === 0 || point.y !== points[i - 1]!.y || i === points.length - 1) out.push(point)
  })
  return out
}

/**
 * Line points from the value held at `x0` through the captures from `index`
 * on: every capture, or the last one per period of `by`.
 */
function linePoints(
  captures: readonly Capture[],
  index: number,
  x0: number,
  open: Figures,
  by: PointBucket | TimelineGroupBy,
): Record<CurrencyKey, Point[]> {
  const lines: Record<CurrencyKey, Point[]> = {
    mora: [{ x: x0, y: open.mora }],
    primogem: [{ x: x0, y: open.primogem }],
  }
  let period = Number.NaN
  for (let i = index; i < captures.length; i++) {
    const capture = captures[i]!
    const p = by === 'raw' ? Number.NaN : periodStart(capture.at, by)
    for (const key of CURRENCY_KEYS) {
      const point = { x: capture.at, y: capture.summary[key] }
      // Same period as the capture before: the later one closes it.
      if (p === period) lines[key][lines[key].length - 1] = point
      else lines[key].push(point)
    }
    period = p
  }
  return { mora: dedupe(lines.mora), primogem: dedupe(lines.primogem) }
}

/**
 * `captures` as buildHistory returns them (oldest first). Ranges end at the
 * newest capture rather than now, like the overview's history, and snap to
 * whole periods of `groupBy`.
 */
export function buildProgression(
  allCaptures: readonly Capture[],
  groupBy: TimelineGroupBy,
  range: ChartRange,
): Progression | null {
  const captures = allCaptures.filter((c) => !currencyMissing(c.summary))
  const first = captures[0]
  const last = captures[captures.length - 1]
  if (!first || !last) return null

  const wanted = Math.max(first.at, rangeStart(range, last.at))
  const bounded = Math.max(wanted, last.at - MAX_PERIODS * LONGEST[groupBy])
  const lastStart = periodStart(last.at, groupBy)
  let starts: number[] = []
  for (let t = periodStart(bounded, groupBy); t <= lastStart; t = nextPeriod(t, groupBy)) {
    starts.push(t)
  }
  if (starts.length > MAX_PERIODS) starts = starts.slice(-MAX_PERIODS)
  const from = starts[0]!
  const truncated = from > periodStart(wanted, groupBy)

  // The last capture before the range closes the period before it.
  let j = lowerBound(captures, from)
  const baseline = j > 0 ? captures[j - 1]! : null
  const open = figures(baseline ?? first)
  const x0 = baseline ? from : first.at
  const lineBucket = finerBucket(pointBucket(last.at - x0), groupBy)
  const lines = linePoints(captures, j, x0, open, lineBucket)

  const periods: Period[] = []
  let previous = open
  starts.forEach((start, i) => {
    const end = starts[i + 1] ?? nextPeriod(start, groupBy)
    let closing: Capture | null = null
    let count = 0
    while (j < captures.length && captures[j]!.at < end) {
      closing = captures[j]!
      count++
      j++
    }
    const close = closing ? figures(closing) : previous
    periods.push({
      start,
      captures: count,
      close,
      change: { mora: close.mora - previous.mora, primogem: close.primogem - previous.primogem },
    })
    previous = close
  })

  return { periods, lines, lineBucket, open, truncated }
}

// --------------------------------------------------------------- per snapshot

export interface CaptureChange {
  /** The capture (epoch ms): the bar's place on the time axis. */
  at: number
  /** Against the capture before; the first in a range against the value carried in. */
  change: number
  /** After the capture. */
  value: number
}

/**
 * The change each capture from `index` on made to one figure, against the
 * capture before (the first against `open`, the value carried into the
 * range). Captures that left it as it was, re-sightings or ones where only
 * the other figure moved, get no entry: they draw no step either.
 */
export function captureChanges(
  captures: readonly Capture[],
  index: number,
  open: number,
  key: CurrencyKey,
): CaptureChange[] {
  const changes: CaptureChange[] = []
  let previous = open
  for (let i = index; i < captures.length; i++) {
    const capture = captures[i]!
    const value = capture.summary[key]
    if (value !== previous) changes.push({ at: capture.at, change: value - previous, value })
    previous = value
  }
  return changes
}

export interface SnapshotProgression {
  /** Per figure, oldest first: one bar per capture that changed it. */
  changes: Record<CurrencyKey, CaptureChange[]>
  /** Every capture as a stepped line from the value held at `domain[0]`. */
  lines: Record<CurrencyKey, Point[]>
  /** The time axis the line and the bars share: the line's start to the newest capture. */
  domain: [number, number]
  /** What the first change is measured against. */
  open: Figures
  /** Older captures were dropped to stay within MAX_PERIODS bars. */
  truncated: boolean
}

/**
 * Per-snapshot changes over `range`, not snapped to periods ("1h" is the
 * hour up to the newest capture), and the line they sit under. As in
 * buildProgression, the value held when the range opens is carried in at
 * its start. When more than MAX_PERIODS captures in the range changed mora
 * or primogems, the newest that many are kept and the range starts at the
 * capture before them, as "Per hour" over years keeps the newest hours.
 */
export function buildSnapshotProgression(
  allCaptures: readonly Capture[],
  range: ChartRange,
): SnapshotProgression | null {
  const captures = allCaptures.filter((c) => !currencyMissing(c.summary))
  const first = captures[0]
  const last = captures[captures.length - 1]
  if (!first || !last) return null

  const from = Math.max(first.at, rangeStart(range, last.at))
  let index = lowerBound(captures, from)
  let baseline = index > 0 ? captures[index - 1]! : null
  let x0 = baseline ? from : first.at

  // Captures in the range that changed either figure, for the cap.
  const changed: number[] = []
  let previous = figures(baseline ?? first)
  for (let i = index; i < captures.length; i++) {
    const current = figures(captures[i]!)
    if (current.mora !== previous.mora || current.primogem !== previous.primogem) changed.push(i)
    previous = current
  }
  const truncated = changed.length > MAX_PERIODS
  if (truncated) {
    index = changed[changed.length - MAX_PERIODS]!
    baseline = captures[index - 1]!
    x0 = baseline.at
  }

  const open = figures(baseline ?? first)
  return {
    changes: {
      mora: captureChanges(captures, index, open.mora, 'mora'),
      primogem: captureChanges(captures, index, open.primogem, 'primogem'),
    },
    lines: linePoints(captures, index, x0, open, 'raw'),
    domain: [x0, last.at],
    open,
    truncated,
  }
}

/** Narrowest and widest a snapshot's bar is drawn (px). */
export const SNAPSHOT_BAR_WIDTH = { min: 2, max: 12 } as const

/**
 * Bar width for `count` snapshots across a plot `plotWidth` px wide: wide
 * for a handful, thinning as they crowd, never under 2px.
 */
export function snapshotBarWidth(count: number, plotWidth: number): number {
  const { min, max } = SNAPSHOT_BAR_WIDTH
  if (!(count > 0) || !(plotWidth > 0)) return max
  return Math.max(min, Math.min(max, Math.floor((plotWidth / count) * 0.6)))
}

// --------------------------------------------------------------------- totals

export interface PeriodTotals {
  /** Newest value. */
  last: number
  /** Newest value minus `open`: the sum of every bar's change. */
  net: number
  gained: number
  spent: number
}

export function periodTotals(progression: Progression, key: CurrencyKey): PeriodTotals {
  let gained = 0
  let spent = 0
  for (const period of progression.periods) {
    const change = period.change[key]
    if (change > 0) gained += change
    else spent -= change
  }
  const last = progression.periods[progression.periods.length - 1]?.close[key] ?? 0
  return { last, net: last - progression.open[key], gained, spent }
}

export function snapshotTotals(progression: SnapshotProgression, key: CurrencyKey): PeriodTotals {
  let gained = 0
  let spent = 0
  for (const { change } of progression.changes[key]) {
    if (change > 0) gained += change
    else spent -= change
  }
  const open = progression.open[key]
  const last = progression.changes[key].at(-1)?.value ?? open
  return { last, net: last - open, gained, spent }
}

interface PeriodFormats {
  dayTick: Intl.DateTimeFormat
  monthTick: Intl.DateTimeFormat
  hour: Intl.DateTimeFormat
  date: Intl.DateTimeFormat
  dayTitle: Intl.DateTimeFormat
  monthTitle: Intl.DateTimeFormat
}

const formatCache = new Map<boolean, PeriodFormats>()

/** Formatters per clock preference, built once (ticks are formatted thousands at a time). */
function formats(hour12: boolean): PeriodFormats {
  let f = formatCache.get(hour12)
  if (!f) {
    const make = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(undefined, options)
    f = {
      dayTick: make({ month: 'short', day: 'numeric' }),
      monthTick: make({ month: 'short', year: 'numeric' }),
      hour: make({ hour: 'numeric', minute: '2-digit', hour12 }),
      date: make({ month: 'short', day: 'numeric', year: 'numeric' }),
      dayTitle: make({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      monthTitle: make({ month: 'long', year: 'numeric' }),
    }
    formatCache.set(hour12, f)
  }
  return f
}

/**
 * Short axis label for a period start: "Jul 6, 3 PM" ("3:00 PM" when the
 * bars span a day, see axisFormat), "Jul 6", "Jul 2026", "2026".
 */
export function periodTick(
  start: number,
  groupBy: TimelineGroupBy,
  hour12: boolean,
  axis: AxisFormat = 'date',
): string {
  const f = formats(hour12)
  if (groupBy === 'year') return String(new Date(start).getFullYear())
  if (groupBy === 'month') return f.monthTick.format(start)
  if (groupBy === 'hour') return hourTick(start, axis, hour12)
  return f.dayTick.format(start)
}

/** Tooltip title for a period: "Jul 6, 2026, 3:00 PM – 4:00 PM", "Mon, Jul 6, 2026", "July 2026". */
export function periodTitle(start: number, groupBy: TimelineGroupBy, hour12: boolean): string {
  const f = formats(hour12)
  if (groupBy === 'year') return String(new Date(start).getFullYear())
  if (groupBy === 'month') return f.monthTitle.format(start)
  if (groupBy === 'day') return f.dayTitle.format(start)
  const end = nextPeriod(start, 'hour')
  return `${f.date.format(start)}, ${f.hour.format(start)} – ${f.hour.format(end)}`
}
