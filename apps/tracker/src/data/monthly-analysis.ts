/**
 * The original tracker's "Monthly Analysis" table (the old backend's
 * getMonthlyAnalysis), computed in the browser from snapshot summaries and
 * the materials history. Pure: the view calls it through computed().
 *
 * Differences from the old backend, both on purpose:
 * - Months and days are local calendar time; the old backend used UTC.
 * - Fodder counts come from each snapshot's own lock/location (its summary),
 *   where the old backend applied today's lock/location to every past day.
 * - A capture that missed the currency packet keeps the previous mora and
 *   primogems (see buildHistory) instead of reading 0.
 */

import type { SnapshotResponse, SnapshotSummary } from '@gdt/shared'
import { indexAtOrBefore, valueAt, type MaterialsHistory } from './materials-history'
import { buildHistory, dayKey } from './overview'

/** Mora a level-0 artifact is worth as enhancement fodder (its base EXP). */
export const ARTIFACT_WORTH = { 4: 2520, 3: 1260 } as const
/** Artifact EXP per extraction material. */
export const EXTRACT_EXP = { SanctifyingEssence: 10_000, SanctifyingUnction: 2_500 } as const

export interface MonthlyFigure {
  total: number
  diff: number
}

export interface MonthlyAnalysisRow {
  /** Local date, YYYY-MM-DD. */
  date: string
  mora: MonthlyFigure
  primogem: MonthlyFigure
  artifact: {
    totalWorth: number
    diffWorth: number
    total3: number
    total4: number
    diff3: number
    diff4: number
  }
  extract: {
    totalExp: number
    diffExp: number
    /** Sanctifying Unction. */
    total3: number
    /** Sanctifying Essence. */
    total4: number
    diff3: number
    diff4: number
  }
}

/** The old endpoint's response shape. */
export interface MonthlyAnalysis {
  /** 1–12. */
  month: number
  year: number
  /** One per local day with a capture, holding that day's last capture, oldest first. */
  rows: MonthlyAnalysisRow[]
}

interface Stats {
  mora: number
  primogem: number
  art3: number
  art4: number
  artifactMoraWorth: number
  ext3: number
  ext4: number
  extractExp: number
}

function statsOf(summary: SnapshotSummary, materials: MaterialsHistory, index: number): Stats {
  const ext4 = valueAt(materials.series.get('SanctifyingEssence'), index)
  const ext3 = valueAt(materials.series.get('SanctifyingUnction'), index)
  const art4 = summary.fodder4
  const art3 = summary.fodder3
  return {
    mora: summary.mora,
    primogem: summary.primogem,
    art3,
    art4,
    artifactMoraWorth: art4 * ARTIFACT_WORTH[4] + art3 * ARTIFACT_WORTH[3],
    ext3,
    ext4,
    extractExp: ext4 * EXTRACT_EXP.SanctifyingEssence + ext3 * EXTRACT_EXP.SanctifyingUnction,
  }
}

/**
 * For each capture of buildHistory(snapshots), the materials-history index of
 * the snapshot it shows. A re-sighting (lastSeenAt) shows its own snapshot,
 * which is not always the newest one taken before it, so captures are matched
 * by snapshot rather than by time: this rebuilds buildHistory's list (same
 * entries, same order, same stable sort) with the snapshot attached.
 */
function captureIndices(
  snapshots: readonly SnapshotResponse[],
  materials: MaterialsHistory,
  captures: readonly { at: number }[],
): number[] {
  // materials.ts orders the history by takenAt, then id.
  const ordered = [...snapshots].sort((a, b) => a.takenAt - b.takenAt || a.id - b.id)
  const aligned =
    ordered.length === materials.times.length &&
    ordered.every((s, i) => s.takenAt === materials.times[i])
  const indexById = new Map<number, number>()
  ordered.forEach((s, i) =>
    indexById.set(s.id, aligned ? i : indexAtOrBefore(materials.times, s.takenAt)),
  )

  const refs: { at: number; index: number }[] = []
  for (const s of snapshots) {
    const index = indexById.get(s.id)!
    refs.push({ at: s.takenAt, index })
    if (s.lastSeenAt > s.takenAt) refs.push({ at: s.lastSeenAt, index })
  }
  refs.sort((a, b) => a.at - b.at)

  if (refs.length === captures.length && refs.every((r, i) => r.at === captures[i]!.at)) {
    return refs.map((r) => r.index)
  }
  // Not expected; fall back to the newest snapshot taken by then.
  return captures.map((c) => indexAtOrBefore(materials.times, c.at))
}

/**
 * Day-by-day mora / primogem / fodder / extraction movement for one local
 * calendar month. `month` is 1–12. Each row is diffed against the row before
 * it; the first against the last capture before the month (or against zero
 * when there is none). Days without a capture get no row.
 */
export function monthlyAnalysis(
  snapshots: readonly SnapshotResponse[],
  materials: MaterialsHistory,
  year: number,
  month: number,
): MonthlyAnalysis {
  const { captures } = buildHistory(snapshots)
  const indices = captureIndices(snapshots, materials, captures)

  const start = new Date(year, month - 1, 1).getTime()
  const end = new Date(year, month, 1).getTime()

  let baseline = -1
  // Day -> its last capture. Captures are oldest first, so keys stay ascending.
  const lastOfDay = new Map<string, number>()
  captures.forEach((capture, i) => {
    if (capture.at < start) baseline = i
    else if (capture.at < end) lastOfDay.set(dayKey(capture.at), i)
  })

  const stats = (i: number) => statsOf(captures[i]!.summary, materials, indices[i]!)
  let prev: Stats | null = baseline >= 0 ? stats(baseline) : null

  const rows: MonthlyAnalysisRow[] = []
  for (const [date, i] of lastOfDay) {
    const curr = stats(i)
    rows.push({
      date,
      mora: { total: curr.mora, diff: curr.mora - (prev?.mora ?? 0) },
      primogem: { total: curr.primogem, diff: curr.primogem - (prev?.primogem ?? 0) },
      artifact: {
        totalWorth: curr.artifactMoraWorth,
        diffWorth: curr.artifactMoraWorth - (prev?.artifactMoraWorth ?? 0),
        total3: curr.art3,
        total4: curr.art4,
        diff3: curr.art3 - (prev?.art3 ?? 0),
        diff4: curr.art4 - (prev?.art4 ?? 0),
      },
      extract: {
        totalExp: curr.extractExp,
        diffExp: curr.extractExp - (prev?.extractExp ?? 0),
        total3: curr.ext3,
        total4: curr.ext4,
        diff3: curr.ext3 - (prev?.ext3 ?? 0),
        diff4: curr.ext4 - (prev?.ext4 ?? 0),
      },
    })
    prev = curr
  }

  return { month, year, rows }
}

/** A local calendar month; `month` is 1–12 like monthlyAnalysis takes it. */
export interface CalendarMonth {
  year: number
  month: number
}

/**
 * The local calendar months that have at least one capture (a snapshot taken
 * or seen again), oldest first: exactly the months whose table has rows.
 */
export function capturedMonths(snapshots: readonly SnapshotResponse[]): CalendarMonth[] {
  const seen = new Set<number>()
  const months: CalendarMonth[] = []
  for (const capture of buildHistory(snapshots).captures) {
    const d = new Date(capture.at)
    const key = d.getFullYear() * 12 + d.getMonth()
    if (seen.has(key)) continue
    seen.add(key)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}
