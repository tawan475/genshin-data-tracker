/**
 * Labels for the planner's estimates and stock states: short readable text
 * for the cards ("12 runs · 240 resin · 2 days") and the words for their
 * tooltips.
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

/** A goal's readiness, as its card and the legend show it (a label, never colour alone). */
export const READINESS: Record<
  StockStatus | 'done',
  { label: string; meaning: string; badge: string; dot: string }
> = {
  all: {
    label: 'Ready',
    meaning: 'Enough for every goal',
    badge: 'bg-emerald-500/15 text-success-text',
    dot: 'bg-emerald-500',
  },
  alone: {
    label: 'Ready alone',
    meaning: 'Enough for this goal, not for all of them',
    badge: 'bg-amber-500/10 text-warning-text',
    dot: 'bg-amber-500',
  },
  short: {
    label: 'Short',
    meaning: 'Not enough, even for this goal alone',
    badge: 'bg-danger-surface text-danger-text',
    dot: 'bg-danger',
  },
  done: {
    label: 'Done',
    meaning: 'Reached',
    badge: 'bg-surface-overlay text-text-secondary',
    dot: 'bg-emerald-500',
  },
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`

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

/** "12 runs · 240 resin · 2 days" */
export function runText(run: RunEstimate): string {
  return `${plural(run.runs, 'run')} · ${formatCompact(run.resin)} resin · ${plural(run.days, 'day')}`
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

/** "3 claims · 90–180 resin · 3 weeks" */
export function weeklyText(run: WeeklyRun): string {
  const resin =
    run.resinMin === run.resinMax
      ? formatCompact(run.resinMax)
      : `${formatCompact(run.resinMin)}–${formatCompact(run.resinMax)}`
  return `${plural(run.runs, 'claim')} · ${resin} resin · ${plural(run.weeks, 'week')}`
}

/** "2 days", "3 weeks": for the headline tiles. */
export const daysText = (days: number) => plural(days, 'day')
export const weeksText = (weeks: number) => plural(weeks, 'week')

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
