/**
 * The original tracker's material history (the old backend's
 * getMaterialsHistory + aggregateTimelineByGroup), computed in the browser:
 * one point per period holding the count of the last snapshot in it, carried
 * forward through empty periods up to now, then the newest `limit` points.
 * A key missing from a snapshot counts 0, as before.
 *
 * Periods are local time; the old backend bucketed in UTC.
 */

import type { TimelineGroupBy } from '@gdt/shared'
import { indexAtOrBefore, periodStart, valueAt, type MaterialsHistory } from '@/data/materials'
import { nextPeriod } from '@/data/progression'
import { materialName } from '@/utils/materials'

export interface HistoryPeriod {
  /** Start of the period (epoch ms, local time). */
  timestamp: number
  /** The snapshot whose counts the period shows (last one taken before it ends). */
  index: number
}

export interface HistorySeries {
  key: string
  name: string
  points: { timestamp: number; count: number }[]
}

/** The periods a chart shows, shared by every series on it. */
export function historyPeriods(
  times: readonly number[],
  groupBy: TimelineGroupBy,
  limit: number,
  now = Date.now(),
): HistoryPeriod[] {
  const first = times[0]
  if (first === undefined) return []
  const starts: number[] = []
  for (let t = periodStart(first, groupBy); t <= now; t = nextPeriod(t, groupBy)) starts.push(t)
  return starts.slice(-limit).map((timestamp) => ({
    timestamp,
    index: indexAtOrBefore(times, nextPeriod(timestamp, groupBy) - 1),
  }))
}

export function historySeries(
  history: MaterialsHistory,
  keys: readonly string[],
  periods: readonly HistoryPeriod[],
): HistorySeries[] {
  return keys.map((key) => {
    const series = history.series.get(key)
    return {
      key,
      name: materialName(key),
      points: periods.map((p) => ({ timestamp: p.timestamp, count: valueAt(series, p.index) })),
    }
  })
}
