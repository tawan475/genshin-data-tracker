/**
 * Labels for the planner's estimates and stock states: the words for the
 * farm cards' tooltips, readiness and stock colours, countdowns.
 */

import type { StockStatus } from '@gdt/game-data/planner-goals'
import type { Bracket, EstimateStatus } from '@gdt/game-data/planner-estimate'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'

export const STOCK_TONE: Record<StockStatus, string> = {
  all: 'text-success-text',
  alone: 'text-warning-text',
  short: 'text-danger-text',
}

/** Read where it renders (the getters answer in the language on screen). */
export const STOCK_MEANING: Readonly<Record<StockStatus, string>> = {
  get all() {
    return t('farm.stock.all')
  },
  get alone() {
    return t('farm.stock.alone')
  },
  get short() {
    return t('farm.stock.short')
  },
}

/**
 * A goal's readiness, as its card and the legend show it (a label, never
 * colour alone). The bag goes to goals in priority order (allocation.ts).
 */
export const READINESS: Record<
  StockStatus | 'done',
  { label: string; meaning: string; badge: string; dot: string }
> = {
  all: {
    get label() {
      return t('farm.readiness.all.label')
    },
    get meaning() {
      return t('farm.readiness.all.meaning')
    },
    badge: 'bg-emerald-500/15 text-success-text',
    dot: 'bg-emerald-500',
  },
  alone: {
    get label() {
      return t('farm.readiness.alone.label')
    },
    get meaning() {
      return t('farm.readiness.alone.meaning')
    },
    badge: 'bg-amber-500/10 text-warning-text',
    dot: 'bg-amber-500',
  },
  short: {
    get label() {
      return t('farm.readiness.short.label')
    },
    get meaning() {
      return t('farm.readiness.short.meaning')
    },
    badge: 'bg-danger-surface text-danger-text',
    dot: 'bg-danger',
  },
  done: {
    get label() {
      return t('farm.readiness.done.label')
    },
    get meaning() {
      return t('farm.readiness.done.meaning')
    },
    badge: 'bg-surface-overlay text-text-secondary',
    dot: 'bg-emerald-500',
  },
}

/** A card whose levels are reached but whose artifacts aren't yet. */
export const ARTIFACTS_LEFT = {
  get label() {
    return t('farm.readiness.artifacts.label')
  },
  get meaning() {
    return t('farm.readiness.artifacts.meaning')
  },
  badge: 'bg-accent/10 text-accent-text',
  dot: 'bg-accent',
}

/** A goal made by the Custom preset that asks nothing yet (`unset`). */
export const GOAL_UNSET = {
  get label() {
    return t('farm.readiness.unset.label')
  },
  get meaning() {
    return t('farm.readiness.unset.meaning')
  },
  badge: 'bg-accent/10 text-accent-text',
  dot: 'bg-accent',
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']

export function bracketText(b: Bracket): string {
  const base =
    b.kind === 'tier'
      ? t('farm.bracket.tier', { tier: ROMAN[b.value] ?? String(b.value) })
      : b.kind === 'level'
        ? t('farm.bracket.bossLevel', { level: b.value })
        : t('farm.bracket.wl', { wl: b.value })
  const withAr = b.ar ? t('farm.bracket.withAr', { base, ar: b.ar }) : base
  return b.assumed ? t('farm.bracket.assumed', { base: withAr }) : withAr
}

/** "2 days", "3 weeks" */
export const daysText = (days: number) => t('farm.unit.days', { n: formatNumber(days) }, days)
export const weeksText = (weeks: number) => t('farm.unit.weeks', { n: formatNumber(weeks) }, weeks)

export function statusTitle(status: EstimateStatus): string {
  if (status === 'locked') return t('farm.status.locked')
  if (status === 'no-rate') return t('farm.status.noRate')
  if (status === 'not-farmed') return t('farm.status.notFarmed')
  return ''
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** "Mon" (0 = Sunday, as Date#getDay). */
export const weekdayShort = (day: number) => t(`farm.weekday.short.${WEEKDAYS[day] ?? 'sun'}`)
/** "Monday" (0 = Sunday, as Date#getDay). */
export const weekdayLong = (day: number) => t(`farm.weekday.long.${WEEKDAYS[day] ?? 'sun'}`)

/** "5h 12m", "12m" */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? t('farm.time.hm', { h, m }) : t('farm.time.m', { m })
}

/** Forging time: "6h", "1h 30m", "45m". */
export function formatSeconds(seconds: number): string {
  const minutes = Math.max(0, Math.ceil(seconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 && m === 0 ? t('farm.time.h', { h }) : formatCountdown(seconds * 1000)
}
