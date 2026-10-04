/**
 * The original tracker's progression timeline (the old backend's
 * getOverviewStats), computed in the browser from snapshot summaries: one
 * point per period holding the last capture in it, carried forward through
 * empty periods up to now, then the newest `limit` points.
 *
 * Periods are local time; the old backend bucketed in UTC.
 */

import type { SnapshotResponse, SnapshotSummary, TimelineGroupBy } from '@gdt/shared'
import { clock24 } from '@/lib/format'
import { periodStart } from './materials-history'
import { buildHistory } from './overview'

export interface TimelinePoint {
  /** Start of the period (epoch ms, local time). */
  timestamp: number
  mora: number
  primogem: number
  totalCharacters: number
  totalArtifacts: number
  /** The full summary of the capture this point shows. */
  summary: SnapshotSummary
}

export const GROUP_BY_OPTIONS: { value: TimelineGroupBy; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export function nextPeriod(start: number, groupBy: TimelineGroupBy): number {
  const date = new Date(start)
  if (groupBy === 'hour') date.setHours(date.getHours() + 1)
  else if (groupBy === 'day') date.setDate(date.getDate() + 1)
  else if (groupBy === 'month') date.setMonth(date.getMonth() + 1)
  else date.setFullYear(date.getFullYear() + 1)
  return date.getTime()
}

/**
 * `snapshots` as loadSnapshots returns them (any order). Captures include
 * Irminsul's re-sightings of an unchanged inventory, and a capture that
 * missed the currency packet keeps the previous mora and primogems.
 */
export function progressionTimeline(
  snapshots: readonly SnapshotResponse[],
  groupBy: TimelineGroupBy,
  limit: number,
  now = Date.now(),
): TimelinePoint[] {
  const { captures } = buildHistory(snapshots)
  const first = captures[0]
  if (!first) return []

  const lastInPeriod = new Map<number, SnapshotSummary>()
  for (const capture of captures)
    lastInPeriod.set(periodStart(capture.at, groupBy), capture.summary)

  const points: TimelinePoint[] = []
  let current = first.summary
  for (let t = periodStart(first.at, groupBy); t <= now; t = nextPeriod(t, groupBy)) {
    current = lastInPeriod.get(t) ?? current
    points.push({
      timestamp: t,
      mora: current.mora,
      primogem: current.primogem,
      totalCharacters: current.characters,
      totalArtifacts: current.artifacts,
      summary: current,
    })
  }
  return points.slice(-limit)
}

/** The original chart labels for a period start, in local time. */
export function periodLabel(timestamp: number, groupBy: TimelineGroupBy): string {
  const date = new Date(timestamp)
  if (groupBy === 'year') return String(date.getFullYear())
  if (groupBy === 'month')
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
  if (groupBy === 'hour') {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: !clock24(),
    })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
