/**
 * Changes and flows over a material's history (see @/data/materials-history
 * for the change-point series these walk). Pure functions; they import that
 * module rather than @/data/materials (which loads data) so tests can run them.
 *
 * Some captures miss part of the inventory (a key absent from a snapshot
 * counts 0), so a series can drop to 0 for one snapshot and come straight
 * back to the same count. Counting that as spending everything and getting
 * it back would swamp every figure (Mora: 70M "spent" in one hop), so these
 * functions read such a dip as the count it interrupts.
 */

import { pointBucket, rangeStart, type ChartRange } from '@/data/chart-range'
import {
  chartFrame,
  indexAtOrBefore,
  type ChartFrame,
  type MaterialSeries,
  type MaterialsHistory,
} from '@/data/materials-history'

const DAY = 86_400_000

/** What a change is measured against: the previous snapshot, or one ~7 / 30 days older. */
export type ChangePeriod = 'last' | '7d' | '30d'

export const PERIOD_OPTIONS: { value: ChangePeriod; label: string }[] = [
  { value: 'last', label: 'Last' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

export function isChangePeriod(value: unknown): value is ChangePeriod {
  return value === 'last' || value === '7d' || value === '30d'
}

// ------------------------------------------------------------------ values

/** Change point `i` is a one-snapshot drop to 0 that the next change point undoes. */
function isGap(series: MaterialSeries, i: number): boolean {
  const v = series.value
  return i > 0 && v[i] === 0 && v[i - 1]! > 0 && v[i + 1] === v[i - 1]
}

/** Index of the last change point at or before snapshot `index`, or -1. */
function pointAt(series: MaterialSeries, index: number): number {
  let lo = 0
  let hi = series.at.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series.at[mid]! <= index) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** The count at snapshot `index`, reading a capture gap as the count around it. */
export function countAt(series: MaterialSeries | undefined, index: number): number {
  if (!series || index < 0) return 0
  const i = pointAt(series, index)
  if (i === -1) return 0
  return isGap(series, i) ? series.value[i - 1]! : series.value[i]!
}

/** Chart points for one key over `frame` (as seriesPoints in @/data/materials, gaps bridged). */
export function chartPoints(
  history: MaterialsHistory,
  key: string,
  frame: ChartFrame,
): { x: number; y: number }[] {
  const series = history.series.get(key)
  const points: { x: number; y: number }[] = []
  if (frame.carryIn >= 0) points.push({ x: frame.from, y: countAt(series, frame.carryIn) })
  for (const index of frame.indices)
    points.push({ x: history.times[index]!, y: countAt(series, index) })
  const last = history.times.length - 1
  if (last >= 0 && frame.end > history.times[last]!) {
    points.push({ x: frame.end, y: countAt(series, last) })
  }
  return points
}

/** Count change of `key` over the frame (newest minus its baseline snapshot). */
export function frameChange(history: MaterialsHistory, key: string, frame: ChartFrame): number {
  const series = history.series.get(key)
  return countAt(series, history.times.length - 1) - countAt(series, frame.baseline)
}

// ------------------------------------------------------------------ periods

export interface Reference {
  /** Snapshot index changes are measured from. */
  index: number
  takenAt: number
}

/**
 * The snapshot a period compares the newest one with. Days count back from
 * the newest snapshot (not from today); a history shorter than the period
 * falls back to its first snapshot. Null with fewer than two snapshots.
 */
export function referenceFor(history: MaterialsHistory, period: ChangePeriod): Reference | null {
  const { times } = history
  const n = times.length
  if (n < 2) return null
  let index = n - 2
  if (period !== 'last') {
    const days = period === '7d' ? 7 : 30
    index = Math.max(0, indexAtOrBefore(times, times[n - 1]! - days * DAY))
  }
  return { index, takenAt: times[index]! }
}

/** Count change of every key from `reference` to the newest snapshot. */
export function changesSince(
  history: MaterialsHistory,
  reference: Reference | null,
): Map<string, number> {
  const changes = new Map<string, number>()
  if (!reference) return changes
  const last = history.times.length - 1
  for (const [key, series] of history.series) {
    const change = countAt(series, last) - countAt(series, reference.index)
    if (change !== 0) changes.set(key, change)
  }
  return changes
}

export interface Flow {
  /** Sum of the rises between consecutive snapshots. */
  gained: number
  /** Sum of the falls, as a positive number. */
  spent: number
  /** Highest count held in the range. */
  peak: number
}

/** Rises and falls of one key between snapshot `from` and `to` (inclusive). */
export function flowBetween(series: MaterialSeries | undefined, from: number, to: number): Flow {
  let previous = countAt(series, from)
  const flow: Flow = { gained: 0, spent: 0, peak: previous }
  if (!series) return flow
  for (let i = 0; i < series.at.length; i++) {
    const at = series.at[i]!
    if (at <= from) continue
    if (at > to) break
    if (isGap(series, i)) continue
    const value = series.value[i]!
    if (value > previous) flow.gained += value - previous
    else flow.spent += previous - value
    if (value > flow.peak) flow.peak = value
    previous = value
  }
  return flow
}

/** When the key first had a count above zero (epoch ms), or null. */
export function firstSeen(history: MaterialsHistory, key: string): number | null {
  const series = history.series.get(key)
  if (!series) return null
  const i = series.value.findIndex((v) => v > 0)
  return i === -1 ? null : (history.times[series.at[i]!] ?? null)
}

/**
 * The snapshots a chart over `range` plots, ending at the newest capture
 * (its last sighting), not now. The count held at the range start is carried
 * in, so a short range with nothing new draws the last known count as a flat
 * line. Up to a week every snapshot is kept; longer spans keep the last per
 * hour, then per day, so a year stays light (see pointBucket).
 */
export function rangeFrame(history: MaterialsHistory, range: ChartRange): ChartFrame {
  const end = Math.max(history.lastSeenAt, history.times.at(-1) ?? 0)
  const from = rangeStart(range, end)
  const first = history.times[0] ?? end
  return chartFrame(history, from, pointBucket(end - Math.max(first, from)))
}

/** Where the frame's line starts: the range start, or the first snapshot when history is shorter. */
export function frameStart(history: MaterialsHistory, frame: ChartFrame): number {
  return frame.carryIn >= 0 ? frame.from : (history.times[frame.baseline] ?? 0)
}
