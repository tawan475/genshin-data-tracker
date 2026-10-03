/** 5★ substat roll tiers (GO / datamine values). */
const ROLL_TIERS_5: Record<string, number[]> = {
  hp: [209.13, 239.0, 268.88, 298.75],
  atk: [13.62, 15.56, 17.51, 19.45],
  def: [16.2, 18.52, 20.84, 23.15],
  hp_: [4.08, 4.66, 5.25, 5.83],
  atk_: [4.08, 4.66, 5.25, 5.83],
  def_: [5.1, 5.83, 6.56, 7.29],
  eleMas: [16.32, 18.65, 20.98, 23.31],
  enerRech_: [4.53, 5.18, 5.83, 6.48],
  critRate_: [2.72, 3.11, 3.5, 3.89],
  critDMG_: [5.44, 6.22, 6.99, 7.77],
}

const RARITY_SCALE: Record<number, number> = {
  5: 1,
  4: 0.8,
  3: 0.7,
  2: 0.6,
  1: 0.5,
}

export const ROLL_BAR_COLORS: Record<number, string> = {
  1: 'bg-slate-400 dark:bg-slate-500',
  2: 'bg-lime-500',
  3: 'bg-sky-500',
  4: 'bg-violet-500',
  5: 'bg-amber-500',
  6: 'bg-red-500',
}

function isPercentStat(key: string): boolean {
  return key.endsWith('_')
}

export function roundSubstatValue(key: string, value: number): number {
  if (isPercentStat(key)) return Math.round(value * 10) / 10
  return Math.round(value)
}

export function getRollTiers(key: string, rarity = 5): number[] {
  const base = ROLL_TIERS_5[key]
  if (!base) return []
  const scale = RARITY_SCALE[rarity] ?? 1
  return base.map((v) => Math.round(v * scale * 100) / 100)
}

export function getMaxRollTier(key: string, rarity = 5): number {
  const tiers = getRollTiers(key, rarity)
  return tiers.length ? Math.max(...tiers) : 1
}

/** Decompose substat total into individual roll values (GO-style). */
export function inferSubstatRolls(
  key: string,
  value: number,
  rarity = 5,
): number[] {
  const tiers = getRollTiers(key, rarity)
  if (!tiers.length || value <= 0) return []

  const target = roundSubstatValue(key, value)
  const tolerance = isPercentStat(key) ? 0.2 : 2
  let best: number[] | null = null

  const search = (remaining: number, rolls: number[]) => {
    if (Math.abs(remaining) <= tolerance) {
      if (
        !best ||
        rolls.length < best.length ||
        (rolls.length === best.length &&
          rolls.reduce((a, b) => a + b, 0) > best.reduce((a, b) => a + b, 0))
      ) {
        best = [...rolls]
      }
      return
    }
    if (rolls.length >= 6 || remaining < -tolerance) return

    for (const tier of tiers) {
      if (tier <= remaining + tolerance) {
        search(remaining - tier, [...rolls, tier])
      }
    }
  }

  search(target, [])
  if (best?.length) {
    return [...best].sort((a, b) => a - b)
  }
  return [target]
}

export function getRollColorIndex(
  rollValue: number,
  key: string,
  rarity = 5,
): number {
  const tiers = getRollTiers(key, rarity)
  if (!tiers.length) return 1

  let closestIdx = 0
  let closestDiff = Infinity
  for (let i = 0; i < tiers.length; i++) {
    const diff = Math.abs(tiers[i] - rollValue)
    if (diff < closestDiff) {
      closestDiff = diff
      closestIdx = i
    }
  }

  const rollOffset = 7 - tiers.length
  return Math.min(6, Math.max(1, rollOffset + closestIdx + 1))
}

export const ROLL_TEXT_COLORS: Record<number, string> = {
  1: 'text-slate-500 dark:text-slate-400',
  2: 'text-lime-600 dark:text-lime-400',
  3: 'text-sky-600 dark:text-sky-400',
  4: 'text-violet-600 dark:text-violet-400',
  5: 'text-amber-600 dark:text-amber-400',
  6: 'text-red-600 dark:text-red-400',
}

export function getRollTextColorClass(
  rollCount: number,
): string {
  const idx = Math.min(6, Math.max(1, rollCount))
  return ROLL_TEXT_COLORS[idx]
}

export function rollFillPercent(
  rollValue: number,
  key: string,
  rarity = 5,
): number {
  const max = getMaxRollTier(key, rarity)
  return Math.min(100, Math.max(8, (rollValue / max) * 100))
}
