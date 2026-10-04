/**
 * Labels for the planner's estimates and stock states: short text for the
 * cards ("×12 · 240 · 2d") and the words for their tooltips.
 */

import type { StockStatus } from '@gdt/game-data/planner-goals'
import type {
  Bracket,
  EstimateStatus,
  RunEstimate,
  WeeklyRun,
} from '@gdt/game-data/planner-estimate'
import { formatCompact, formatNumber } from '@/lib/format'

export const STOCK_TONE: Record<StockStatus, string> = {
  all: 'text-success-text',
  alone: 'text-warning-text',
  short: 'text-danger-text',
}

export const STOCK_MEANING: Record<StockStatus, string> = {
  all: 'enough for all goals',
  alone: 'enough for this goal',
  short: 'short',
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']

export function bracketText(b: Bracket): string {
  const base =
    b.kind === 'tier'
      ? `Tier ${ROMAN[b.value] ?? b.value}`
      : b.kind === 'level'
        ? `Boss Lv ${b.value}`
        : `WL ${b.value}`
  const ar = b.ar ? ` (AR ${b.ar})` : ''
  return `${base}${ar}${b.assumed ? ', assumed' : ''}`
}

/** "×12 · 240 · 2d" */
export function runText(run: RunEstimate): string {
  return `×${formatNumber(run.runs)} · ${formatCompact(run.resin)} · ${formatNumber(run.days)}d`
}

/** "12 runs · 240 resin (4 condensed) · 2 days · Tier IV (AR 45)" */
export function runTitle(run: RunEstimate): string {
  const condensed = run.condensed > 0 ? ` (${formatNumber(run.condensed)} condensed)` : ''
  return [
    `${formatNumber(run.runs)} runs`,
    `${formatNumber(run.resin)} resin${condensed}`,
    `${formatNumber(run.days)} days`,
    bracketText(run.bracket),
  ].join(' · ')
}

/** "×3 · 90~180 · 3w" */
export function weeklyText(run: WeeklyRun): string {
  const resin =
    run.resinMin === run.resinMax
      ? formatCompact(run.resinMax)
      : `${formatCompact(run.resinMin)}~${formatCompact(run.resinMax)}`
  return `×${formatNumber(run.runs)} · ${resin} · ${formatNumber(run.weeks)}w`
}

export function weeklyTitle(run: WeeklyRun): string {
  return [
    `${formatNumber(run.runs)} claims, one a week`,
    `${formatNumber(run.resinMin)}–${formatNumber(run.resinMax)} resin`,
    `Dream Solvent: about ${formatNumber(run.solvent.need)} to convert, ${formatNumber(run.solvent.income)} dropped`,
    bracketText(run.bracket),
  ].join(' · ')
}

/** Card text for a source without runs; '' when there is nothing to say. */
export function statusText(status: EstimateStatus): string {
  if (status === 'locked') return 'Locked'
  if (status === 'no-rate') return 'No rate'
  return ''
}

export function statusTitle(status: EstimateStatus): string {
  if (status === 'locked') return 'Adventure Rank or World Level too low to farm it yet'
  if (status === 'no-rate') return 'No average drop rate for this source: no estimate'
  if (status === 'not-farmed') return 'No resin source'
  return ''
}

/** "5h 12m", "12m" */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Forging time: "6h", "1h 30m", "45m". */
export function formatSeconds(seconds: number): string {
  return formatCountdown(seconds * 1000).replace(/ 0m$/, '')
}
