/**
 * Figures for the accounts home and the account overview, derived from the
 * snapshot summaries alone (nothing is decoded). Pure functions: views call
 * them through computed() so each runs once per data version, not per render.
 */

import type { AccountResponse, GenshinServer, SnapshotResponse, SnapshotSummary } from '@gdt/shared'
import { formatNumber } from '@/lib/format'

const DAY = 86_400_000

// ------------------------------------------------------------------ accounts

const SERVER_LABELS: Record<GenshinServer, string> = {
  AMERICA: 'America',
  EUROPE: 'Europe',
  ASIA: 'Asia',
  SAR: 'TW, HK, MO',
}

export function serverLabel(server: GenshinServer | null): string | null {
  return server ? SERVER_LABELS[server] : null
}

/** "692×": how many times smaller the stored copy is than what was uploaded. */
export function compressionRatio(rawBytes: number, storedBytes: number): string | null {
  if (rawBytes <= 0 || storedBytes <= 0) return null
  const ratio = rawBytes / storedBytes
  if (ratio >= 10) return `${formatNumber(Math.round(ratio))}×`
  return `${ratio.toFixed(1)}×`
}

export interface AccountTotals {
  accounts: number
  snapshots: number
  rawBytes: number
  storedBytes: number
  /** When the newest snapshot across all accounts was taken. */
  lastCapture: number | null
}

export function accountTotals(accounts: readonly AccountResponse[]): AccountTotals {
  let snapshots = 0
  let rawBytes = 0
  let storedBytes = 0
  let lastCapture: number | null = null
  for (const account of accounts) {
    snapshots += account.snapshotCount
    rawBytes += account.rawBytes
    storedBytes += account.storedBytes
    const taken = account.latest?.takenAt ?? null
    if (taken !== null && (lastCapture === null || taken > lastCapture)) lastCapture = taken
  }
  return { accounts: accounts.length, snapshots, rawBytes, storedBytes, lastCapture }
}

// -------------------------------------------------------------------- deltas

export type SummaryKey = keyof SnapshotSummary
/** Null where the change cannot be told (see currencyMissing). */
export type SummaryDelta = Record<SummaryKey, number | null>

const SUMMARY_KEYS: SummaryKey[] = [
  'characters',
  'weapons',
  'artifacts',
  'materials',
  'mora',
  'primogem',
  'fodder3',
  'fodder4',
]

const CURRENCY_KEYS: ReadonlySet<SummaryKey> = new Set(['mora', 'primogem'])

/**
 * Irminsul sometimes misses the packet that carries mora and primogems: the
 * snapshot then reads 0 for both while the rest of the inventory is there.
 * A real account essentially never has exactly 0 of both.
 */
export function currencyMissing(summary: SnapshotSummary): boolean {
  return summary.mora === 0 && summary.primogem === 0
}

export function summaryDelta(current: SnapshotSummary, previous: SnapshotSummary): SummaryDelta {
  const unknown = currencyMissing(current) || currencyMissing(previous)
  const delta = {} as SummaryDelta
  for (const key of SUMMARY_KEYS) {
    delta[key] = unknown && CURRENCY_KEYS.has(key) ? null : current[key] - previous[key]
  }
  return delta
}

/**
 * Change of the newest snapshot against the one before it. `snapshots` is
 * newest first (as loadSnapshots returns it); null when there is no pair.
 */
export function latestDelta(snapshots: readonly SnapshotResponse[]): SummaryDelta | null {
  const [latest, previous] = snapshots
  return latest && previous ? summaryDelta(latest.summary, previous.summary) : null
}

// ------------------------------------------------------------------- history

/**
 * One observation of the inventory: a snapshot being taken, or Irminsul
 * seeing the same inventory again later (`lastSeenAt`), which proves the
 * values still held at that time.
 */
export interface Capture {
  at: number
  /** As captured, except missing currency carried over from the capture before. */
  summary: SnapshotSummary
}

export interface History {
  /** Oldest first. */
  captures: Capture[]
  /** The last capture of each local calendar day, oldest first. */
  days: DayClose[]
}

export interface DayClose {
  /** Local date, YYYY-MM-DD. */
  key: string
  at: number
  summary: SnapshotSummary
  /** Captures that day (snapshots taken plus sightings of an unchanged inventory). */
  captures: number
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Local calendar day of a timestamp, as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Everything the overview charts and the monthly table need, computed once. */
export function buildHistory(snapshots: readonly SnapshotResponse[]): History {
  const captures: Capture[] = []
  for (const s of snapshots) {
    captures.push({ at: s.takenAt, summary: s.summary })
    if (s.lastSeenAt > s.takenAt) captures.push({ at: s.lastSeenAt, summary: s.summary })
  }
  captures.sort((a, b) => a.at - b.at)

  // A capture without currency keeps the previous known mora and primogems,
  // so charts and daily changes don't plunge to 0 and back.
  let known: SnapshotSummary | null = null
  for (const capture of captures) {
    if (!currencyMissing(capture.summary)) known = capture.summary
    else if (known) {
      capture.summary = { ...capture.summary, mora: known.mora, primogem: known.primogem }
    }
  }

  const days: DayClose[] = []
  for (const capture of captures) {
    const key = dayKey(capture.at)
    const last = days[days.length - 1]
    if (last && last.key === key) {
      last.at = capture.at
      last.summary = capture.summary
      last.captures++
    } else {
      days.push({ key, at: capture.at, summary: capture.summary, captures: 1 })
    }
  }
  return { captures, days }
}

export type HistoryRange = '30d' | '90d' | '1y' | 'all'

export const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' },
]

const RANGE_DAYS: Record<Exclude<HistoryRange, 'all'>, number> = { '30d': 30, '90d': 90, '1y': 365 }

/** First index whose `at` is >= `from` (captures are sorted by `at`). */
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
 * The captures inside a range. Ranges end at the newest capture rather than
 * today, so an account that has not been captured for a while still shows
 * its last stretch of history.
 */
export function capturesInRange(captures: readonly Capture[], range: HistoryRange): Capture[] {
  const last = captures[captures.length - 1]
  if (!last || range === 'all') return captures.slice()
  return captures.slice(lowerBound(captures, last.at - RANGE_DAYS[range] * DAY))
}

export interface Point {
  x: number
  y: number
}

/**
 * A stepped series for one figure. Inventory holds its value until the next
 * capture changes it, so a run of equal values draws the same line as its
 * first point: those repeats are dropped (keeping the final point so the
 * line reaches the newest capture). 1,000 captures of a slowly changing
 * figure become a few dozen points.
 */
export function stepSeries(captures: readonly Capture[], key: SummaryKey): Point[] {
  const points: Point[] = []
  let previous: number | undefined
  for (let i = 0; i < captures.length; i++) {
    const capture = captures[i]!
    const y = capture.summary[key]
    if (y !== previous || i === captures.length - 1) points.push({ x: capture.at, y })
    previous = y
  }
  return points
}

export interface RangeFigure {
  /** Value at the newest capture in range. */
  last: number
  /** Change from the first to the last capture in range. */
  change: number
}

export function rangeFigure(captures: readonly Capture[], key: SummaryKey): RangeFigure | null {
  const first = captures[0]
  const last = captures[captures.length - 1]
  if (!first || !last) return null
  return { last: last.summary[key], change: last.summary[key] - first.summary[key] }
}

// ----------------------------------------------------------- monthly analysis

export interface MonthRef {
  year: number
  /** 0–11, as Date uses. */
  month: number
}

export function monthOf(ms: number): MonthRef {
  const d = new Date(ms)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function shiftMonth(ref: MonthRef, by: number): MonthRef {
  const d = new Date(ref.year, ref.month + by, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function compareMonths(a: MonthRef, b: MonthRef): number {
  return a.year - b.year || a.month - b.month
}

export function monthLabel(ref: MonthRef): string {
  return new Date(ref.year, ref.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

/** The figures the monthly table follows. */
export const MONTHLY_KEYS = ['primogem', 'mora', 'fodder4', 'fodder3'] as const
export type MonthlyKey = (typeof MONTHLY_KEYS)[number]

export interface DayFigure {
  /** Value at the day's last capture. */
  total: number
  /** Against the previous captured day; null on the very first capture. */
  change: number | null
}

export interface MonthDay {
  key: string
  /** "Mon, Jul 6". */
  label: string
  /** "Jul 6". */
  short: string
  /** Null when nothing was captured that day. */
  figures: Record<MonthlyKey, DayFigure> | null
  captures: number
  /** Set when the change is measured across days without captures. */
  since: string | null
}

export interface MonthTotal {
  /** Sum of the daily changes; null when no change could be measured. */
  net: number | null
  gained: number
  spent: number
  /** Value at the month's last capture. */
  closing: number | null
}

export interface MonthAnalysis {
  month: MonthRef
  label: string
  /**
   * Every day of the month, oldest first, from the account's first capture
   * (days before it were not tracked) up to today.
   */
  days: MonthDay[]
  capturedDays: number
  totals: Record<MonthlyKey, MonthTotal>
}

/** Last index in `days` whose key is < `key` (or -1). */
function lastDayBefore(days: readonly DayClose[], key: string): number {
  let lo = 0
  let hi = days.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (days[mid]!.key < key) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

/**
 * Day-by-day movement for one month: each captured day's last capture,
 * diffed against the last capture of the previous captured day (which may
 * be in an earlier month). Days without a capture stay empty rather than
 * reading as "no change".
 */
export function monthlyAnalysis(
  days: readonly DayClose[],
  ref: MonthRef,
  now: number = Date.now(),
): MonthAnalysis {
  const byKey = new Map<string, DayClose>()
  for (const day of days) byKey.set(day.key, day)

  const longDay = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const firstEver = days[0]?.key ?? ''

  const daysInMonth = new Date(ref.year, ref.month + 1, 0).getDate()
  const today = monthOf(now)
  const lastDay =
    compareMonths(ref, today) === 0
      ? new Date(now).getDate()
      : compareMonths(ref, today) > 0
        ? 0
        : daysInMonth

  const firstKey = `${ref.year}-${pad(ref.month + 1)}-01`
  const baselineIndex = lastDayBefore(days, firstKey)
  let previous: DayClose | null = baselineIndex >= 0 ? days[baselineIndex]! : null

  const totals = {} as Record<MonthlyKey, MonthTotal>
  for (const key of MONTHLY_KEYS) totals[key] = { net: null, gained: 0, spent: 0, closing: null }

  const rows: MonthDay[] = []
  let capturedDays = 0
  let previousDate = previous ? previous.key : null
  for (let date = 1; date <= lastDay; date++) {
    const key = `${ref.year}-${pad(ref.month + 1)}-${pad(date)}`
    if (key < firstEver) continue
    const local = new Date(ref.year, ref.month, date)
    const label = longDay.format(local)
    const short = shortDay.format(local)
    const close = byKey.get(key)
    if (!close) {
      rows.push({ key, label, short, figures: null, captures: 0, since: null })
      continue
    }

    capturedDays++
    const figures = {} as Record<MonthlyKey, DayFigure>
    for (const k of MONTHLY_KEYS) {
      const total = close.summary[k]
      const change = previous ? total - previous.summary[k] : null
      figures[k] = { total, change }
      const t = totals[k]
      t.closing = total
      if (change !== null) {
        t.net = (t.net ?? 0) + change
        if (change > 0) t.gained += change
        else t.spent -= change
      }
    }

    // A gap: say which day the change is measured from.
    const yesterday = dayKey(new Date(ref.year, ref.month, date - 1).getTime())
    const since = previous && previousDate !== yesterday ? shortDay.format(previous.at) : null

    rows.push({ key, label, short, figures, captures: close.captures, since })
    previous = close
    previousDate = key
  }

  return { month: ref, label: monthLabel(ref), days: rows, capturedDays, totals }
}

export type MonthRow =
  | { kind: 'day'; day: MonthDay }
  | { kind: 'gap'; key: string; from: string; to: string; count: number }

/**
 * Table rows for a month: a run of two or more days without a capture
 * becomes one "Jul 14 – Jul 31" row, so a quiet stretch does not bury the
 * days that have data.
 */
export function monthRows(days: readonly MonthDay[]): MonthRow[] {
  const rows: MonthRow[] = []
  let run: MonthDay[] = []
  const flush = () => {
    const first = run[0]
    const last = run[run.length - 1]
    if (first && last) {
      if (run.length === 1) rows.push({ kind: 'day', day: first })
      else {
        rows.push({
          kind: 'gap',
          key: first.key,
          from: first.short,
          to: last.short,
          count: run.length,
        })
      }
    }
    run = []
  }
  for (const day of days) {
    if (day.figures) {
      flush()
      rows.push({ kind: 'day', day })
    } else run.push(day)
  }
  flush()
  return rows
}

/** Base artifact EXP a level-0 piece gives when used as fodder. */
export const FODDER_EXP = { fodder4: 2520, fodder3: 1260 } as const

// ---------------------------------------------------------- recent snapshots

export interface RecentSnapshot {
  id: number
  takenAt: number
  /** Set when Irminsul saw the same inventory again after it was taken. */
  seenAgainAt: number | null
  source: string
  rawSize: number
  storedSize: number
  summary: SnapshotSummary
  /** Non-zero changes against the snapshot before it, in display order. */
  changes: { label: string; value: number }[]
  /** False for the account's first snapshot (nothing to compare with). */
  hasPrevious: boolean
  /** Mora and primogems were not in this capture (see currencyMissing). */
  currencyMissing: boolean
}

const CHANGE_LABELS: [SummaryKey, string][] = [
  ['mora', 'Mora'],
  ['primogem', 'Primogems'],
  ['characters', 'Characters'],
  ['weapons', 'Weapons'],
  ['artifacts', 'Artifacts'],
  ['fodder4', '4★ fodder'],
  ['fodder3', '3★ fodder'],
]

/** The newest `count` snapshots with what changed in each. Input is newest first. */
export function recentSnapshots(
  snapshots: readonly SnapshotResponse[],
  count = 5,
): RecentSnapshot[] {
  return snapshots.slice(0, count).map((s, i) => {
    const previous = snapshots[i + 1]
    const changes: { label: string; value: number }[] = []
    if (previous) {
      const delta = summaryDelta(s.summary, previous.summary)
      for (const [key, label] of CHANGE_LABELS) {
        const value = delta[key]
        if (value !== null && value !== 0) changes.push({ label, value })
      }
    }
    return {
      id: s.id,
      takenAt: s.takenAt,
      seenAgainAt: s.lastSeenAt > s.takenAt ? s.lastSeenAt : null,
      source: s.source,
      rawSize: s.rawSize,
      storedSize: s.storedSize,
      summary: s.summary,
      changes,
      hasPrevious: !!previous,
      currencyMissing: currencyMissing(s.summary),
    }
  })
}

/** "+1,234" / "−1,234" / "0": exact, for tables where every digit matters. */
export function formatSignedExact(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`
}
