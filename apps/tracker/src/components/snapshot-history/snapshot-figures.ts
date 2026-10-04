/**
 * Per-row figures for the Import History table: what changed since the
 * snapshot before, and the date filter.
 */

import type { SnapshotResponse } from '@gdt/shared'
import { currencyMissing, dayKey, formatSignedExact } from '@/data/overview'
import { formatFullDateTime, formatNumber } from '@/lib/format'

export const FIGURE_KEYS = ['characters', 'artifacts', 'weapons', 'mora', 'primogem'] as const
export type FigureKey = (typeof FIGURE_KEYS)[number]

const CURRENCY: ReadonlySet<FigureKey> = new Set(['mora', 'primogem'])

export interface Change {
  delta: number
  /** The snapshot compared against. */
  since: SnapshotResponse
}

export type RowChanges = Partial<Record<FigureKey, Change>>

/**
 * Changes of every snapshot (`list` newest first) against the one before it.
 * Mora and primogems compare with the closest older snapshot that has them,
 * so one capture without currency doesn't hide the next change.
 */
export function snapshotChanges(list: readonly SnapshotResponse[]): Map<number, RowChanges> {
  const changes = new Map<number, RowChanges>()
  let withCurrency: SnapshotResponse | null = null
  for (let i = list.length - 1; i >= 0; i--) {
    const current = list[i]!
    const previous = list[i + 1]
    const row: RowChanges = {}
    for (const key of FIGURE_KEYS) {
      const since = CURRENCY.has(key) ? withCurrency : previous
      if (!since || (CURRENCY.has(key) && currencyMissing(current.summary))) continue
      row[key] = { delta: current.summary[key] - since.summary[key], since }
    }
    changes.set(current.id, row)
    if (!currencyMissing(current.summary)) withCurrency = current
  }
  return changes
}

/** Tooltip for a figure: the exact value and change. */
export function figureTitle(value: number, change: Change | undefined): string {
  if (!change) return formatNumber(value)
  return (
    `${formatNumber(value)} (${formatSignedExact(change.delta)})\n` +
    `vs #${change.since.id} · ${formatFullDateTime(change.since.takenAt)}`
  )
}

/** Snapshots taken between two local days (inclusive, either order; '' = open). */
export function inDayRange(
  list: readonly SnapshotResponse[],
  from: string,
  to: string,
): readonly SnapshotResponse[] {
  if (!from && !to) return list
  const [lo, hi] = from && to && from > to ? [to, from] : [from, to]
  return list.filter((s) => {
    const day = dayKey(s.takenAt)
    return (!lo || day >= lo) && (!hi || day <= hi)
  })
}
