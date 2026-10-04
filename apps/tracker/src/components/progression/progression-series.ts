/**
 * Mora and primogems grouped into periods (hour / day / month / year) for the
 * progression charts: each period's closing value and its change against the
 * period before. Pure: the component calls it through computed().
 *
 * Captures come from buildHistory, so a capture that missed the currency
 * packet already carries the previous mora and primogems. Leading captures
 * with nothing to carry (still 0 / 0) are left out rather than drawn as 0.
 */

import type { TimelineGroupBy } from '@gdt/shared'
import { periodStart } from '@/data/materials-history'
import { currencyMissing, type Capture, type Point } from '@/data/overview'
import { nextPeriod } from '@/data/progression'

export type CurrencyKey = 'mora' | 'primogem'
export const CURRENCY_KEYS: readonly CurrencyKey[] = ['mora', 'primogem']

export type ProgressionRange = '7d' | '30d' | '90d' | '1y' | 'all'

export const PROGRESSION_RANGES: { value: ProgressionRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' },
]

const DAY = 86_400_000
const RANGE_DAYS: Record<Exclude<ProgressionRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
}

/** Most periods drawn at once (hourly over years would be tens of thousands of bars). */
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
  /** Stepped line per figure: the closing capture of each period. */
  lines: Record<CurrencyKey, Point[]>
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
 * `captures` as buildHistory returns them (oldest first). Ranges end at the
 * newest capture rather than today, like the overview's history, and snap to
 * whole periods.
 */
export function buildProgression(
  allCaptures: readonly Capture[],
  groupBy: TimelineGroupBy,
  range: ProgressionRange,
): Progression | null {
  const captures = allCaptures.filter((c) => !currencyMissing(c.summary))
  const first = captures[0]
  const last = captures[captures.length - 1]
  if (!first || !last) return null

  const wanted = range === 'all' ? first.at : Math.max(first.at, last.at - RANGE_DAYS[range] * DAY)
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

  const raw: Record<CurrencyKey, Point[]> = {
    mora: [{ x: baseline ? from : first.at, y: open.mora }],
    primogem: [{ x: baseline ? from : first.at, y: open.primogem }],
  }

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
    if (closing) {
      raw.mora.push({ x: closing.at, y: close.mora })
      raw.primogem.push({ x: closing.at, y: close.primogem })
    }
    periods.push({
      start,
      captures: count,
      close,
      change: { mora: close.mora - previous.mora, primogem: close.primogem - previous.primogem },
    })
    previous = close
  })

  return {
    periods,
    lines: { mora: dedupe(raw.mora), primogem: dedupe(raw.primogem) },
    open,
    truncated,
  }
}

export interface PeriodTotals {
  /** Newest close. */
  last: number
  /** Newest close minus `open`: the sum of every period's change. */
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

interface PeriodFormats {
  hourTick: Intl.DateTimeFormat
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
      hourTick: make({ month: 'short', day: 'numeric', hour: 'numeric', hour12 }),
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

/** Short axis label for a period start: "Jul 6, 3 PM", "Jul 6", "Jul 2026", "2026". */
export function periodTick(start: number, groupBy: TimelineGroupBy, hour12: boolean): string {
  const f = formats(hour12)
  if (groupBy === 'year') return String(new Date(start).getFullYear())
  if (groupBy === 'month') return f.monthTick.format(start)
  if (groupBy === 'hour') return f.hourTick.format(start)
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
