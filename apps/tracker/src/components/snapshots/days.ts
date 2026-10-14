/**
 * Grouping snapshots by local calendar day. Day keys are "YYYY-MM-DD", the
 * same format as <input type="date">, so a date range is a string compare.
 */

import type { SnapshotResponse } from '@gdt/shared'
import { t } from '@/i18n'
import { locale } from '@/i18n/locale'
import { dateFormat } from '@/lib/format'

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Calendar days from `from` to `to` inclusive (keys as above). */
export function daySpan(from: string, to: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000) + 1
}

/** "Today", "Yesterday", or "Mon, Jul 13, 2026" (Chinese: the language's own date with its weekday). */
export function dayLabel(key: string, now = Date.now()): string {
  if (key === dayKey(now)) return t('format.today')
  if (key === dayKey(now - 86_400_000)) return t('format.yesterday')
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)
  const full = { year: 'numeric', month: 'short', day: 'numeric' } as const
  if (locale.value !== 'en') return dateFormat({ ...full, weekday: 'short' }).format(date)
  return `${dateFormat({ weekday: 'short' }).format(date)}, ${dateFormat(full).format(date)}`
}

/** A duration in the largest units that keep it short: "41 s", "12 min", "2 h 5 min", "3 days". */
export function formatGap(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`
  return `${Math.round(hours / 24)} days`
}

/** "Jun 20 – Jul 13, 2026" (the locale decides how to share the year). */
export function rangeLabel(from: number, to: number): string {
  return dateFormat({ year: 'numeric', month: 'short', day: 'numeric' }).formatRange(from, to)
}

export interface SnapshotEntry {
  snapshot: SnapshotResponse
  /** The next older snapshot, for "since previous" figures. */
  previous: SnapshotResponse | null
}

export interface DayGroup {
  key: string
  label: string
  /** Entries on screen for this day (a day can straddle "Show older"). */
  entries: SnapshotEntry[]
  /** Every snapshot of the day, shown or not. */
  ids: number[]
}

/**
 * Groups the first `limit` snapshots (newest first) by day. `ids` covers the
 * whole day so selecting a day never depends on how much is on screen.
 */
export function groupByDay(
  snapshots: readonly SnapshotResponse[],
  limit: number,
  idsByDay: ReadonlyMap<string, number[]>,
): DayGroup[] {
  const groups: DayGroup[] = []
  const now = Date.now()
  const end = Math.min(limit, snapshots.length)
  for (let i = 0; i < end; i++) {
    const snapshot = snapshots[i]!
    const key = dayKey(snapshot.takenAt)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(key, now), entries: [], ids: idsByDay.get(key) ?? [] }
      groups.push(group)
    }
    group.entries.push({ snapshot, previous: snapshots[i + 1] ?? null })
  }
  return groups
}

export function indexByDay(snapshots: readonly SnapshotResponse[]): Map<string, number[]> {
  const days = new Map<string, number[]>()
  for (const { id, takenAt } of snapshots) {
    const key = dayKey(takenAt)
    const ids = days.get(key)
    if (ids) ids.push(id)
    else days.set(key, [id])
  }
  return days
}
