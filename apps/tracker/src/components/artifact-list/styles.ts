/**
 * The original "My Artifacts" colours (old frontend `utils/artifact-stats.ts`
 * and `utils/artifact-rolls.ts`), kept verbatim for the ported card and
 * table. Roll inference itself comes from `@/utils/artifact-rolls`.
 */

import { getMaxRollTier, type InferredRoll } from '@/utils/artifact-rolls'

/** Card border by rarity. */
export function rarityBorderClass(rarity?: number): string {
  switch (rarity) {
    case 5:
      return 'border-amber-400/60 dark:border-amber-500/50'
    case 4:
      return 'border-purple-400/60 dark:border-purple-500/50'
    case 3:
      return 'border-blue-400/60 dark:border-blue-500/50'
    case 2:
      return 'border-emerald-400/60 dark:border-emerald-500/50'
    default:
      return 'border-slate-200 dark:border-slate-700'
  }
}

/** Substat value colour by stat: crit red, ATK orange, ER purple, EM emerald. */
export function getSubstatColorClass(key: string): string {
  if (key.includes('critRate') || key.includes('critDMG')) {
    return 'text-red-500 dark:text-red-400'
  }
  if (key.includes('atk')) return 'text-orange-500 dark:text-orange-400'
  if (key.includes('enerRech')) return 'text-purple-500 dark:text-purple-400'
  if (key.includes('eleMas')) return 'text-emerald-500 dark:text-emerald-400'
  return 'text-slate-600 dark:text-slate-400'
}

const ROLL_BAR_COLORS: Readonly<Record<number, string>> = {
  1: 'bg-slate-400 dark:bg-slate-500',
  2: 'bg-lime-500',
  3: 'bg-sky-500',
  4: 'bg-violet-500',
  5: 'bg-amber-500',
  6: 'bg-red-500',
}

const ROLL_TEXT_COLORS: Readonly<Record<number, string>> = {
  1: 'text-slate-500 dark:text-slate-400',
  2: 'text-lime-600 dark:text-lime-400',
  3: 'text-sky-600 dark:text-sky-400',
  4: 'text-violet-600 dark:text-violet-400',
  5: 'text-amber-600 dark:text-amber-400',
  6: 'text-red-600 dark:text-red-400',
}

const clamp = (n: number) => Math.min(6, Math.max(1, n))

/**
 * Substat name colour by how many times it rolled (1 grey … 6 red); grey
 * when the value could not be split into rolls.
 */
export function rollCountTextClass(rollCount: number): string {
  return rollCount > 0 ? ROLL_TEXT_COLORS[clamp(rollCount)]! : 'text-slate-500 dark:text-slate-400'
}

/**
 * Bar colour for one roll. The old UI placed the tiers at the top of a 1–6
 * scale (`7 - tiers + index + 1`), which is quality + 3: lowest tier violet,
 * then amber, then red for the two highest.
 */
export function rollBarClass(roll: InferredRoll): string {
  return ROLL_BAR_COLORS[clamp(roll.quality + 3)]!
}

/** Bar fill: the roll against the stat's top tier, never below 8 %. */
export function rollFillPercent(roll: InferredRoll, key: string, rarity: number): number {
  const max = getMaxRollTier(key, rarity) || 1
  return Math.min(100, Math.max(8, (roll.value / max) * 100))
}

/** Hides an icon the CDN does not have instead of showing a broken image. */
export function hideBrokenImage(event: Event): void {
  ;(event.target as HTMLImageElement).style.visibility = 'hidden'
}
