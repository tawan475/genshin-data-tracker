/**
 * Live sync's files in the export zip (docs/plans/live-sync.md §7.8), built
 * in the export worker. Pure.
 *
 * - `live/journal.ndjson`: the open journal as GOOD-X delta lines (one line,
 *   its batches merged: the last value of each path);
 * - `live/points.csv`: the chart points, one row each;
 * - `live/now.json`: the newest snapshot with the journal applied, as plain
 *   GOOD (no `gi_guid`): the account as of the last batch.
 */

import {
  DELTA_FORMAT,
  FIGURE_FIELDS,
  applyDelta,
  bindItemGuids,
  type Good,
  type LiveGood,
  type LiveJournalResponse,
  type LivePointsResponse,
} from '@gdt/shared'

export interface LiveFile {
  name: string
  text: string
  mtime?: number
}

/** The open journal as one GOOD-X delta line (null without changes). */
export function journalNdjson(live: LiveJournalResponse, uid: number | null): string | null {
  if (!live.open || !live.base || !live.changes?.length) return null
  const line = {
    format: DELTA_FORMAT,
    v: 1,
    uid: uid ?? 0,
    session: live.session ?? '',
    seq: live.seq ?? 0,
    base: live.base.contentKey,
    at: live.updatedAt ?? 0,
    changes: live.changes,
  }
  return `${JSON.stringify(line)}\n`
}

/** The chart points as CSV: an ISO time and each figure. */
export function pointsCsv(points: LivePointsResponse['points']): string | null {
  if (points.length === 0) return null
  const rows = points.map((p) =>
    [new Date(p.at).toISOString(), ...FIGURE_FIELDS.map((field) => p.figures[field])].join(','),
  )
  return `${['time', ...FIGURE_FIELDS].join(',')}\n${rows.join('\n')}\n`
}

/** The newest snapshot with the journal applied, as plain GOOD; null when the journal does not follow it. */
export function goodAsOfNow(
  newest: { id: number; good: Good },
  live: LiveJournalResponse,
): Good | null {
  if (!live.open || live.base?.snapshotId !== newest.id || !live.changes?.length) return null
  const now = applyDelta(bindItemGuids(newest.good as LiveGood, live.items ?? []), live.changes)
  const strip = <T extends { gi_guid?: string }>(item: T) => {
    const { gi_guid: _guid, ...rest } = item
    return rest
  }
  return {
    ...now,
    artifacts: now.artifacts.map(strip),
    weapons: now.weapons.map(strip),
    timestamp: live.updatedAt ?? now.timestamp,
  } as Good
}

/** Every `live/` file there is something for. */
export function liveFiles(
  live: LiveJournalResponse | null,
  points: LivePointsResponse['points'],
  newest: { id: number; good: Good } | null,
): LiveFile[] {
  const files: LiveFile[] = []
  const at = live?.updatedAt
  if (live) {
    const uid = newest?.good.gi_player?.uid ?? null
    const journal = journalNdjson(live, uid)
    if (journal) files.push({ name: 'live/journal.ndjson', text: journal, mtime: at })
  }
  const csv = pointsCsv(points)
  if (csv) files.push({ name: 'live/points.csv', text: csv, mtime: points.at(-1)?.at })
  if (live && newest) {
    const good = goodAsOfNow(newest, live)
    if (good) files.push({ name: 'live/now.json', text: JSON.stringify(good), mtime: at })
  }
  return files
}
