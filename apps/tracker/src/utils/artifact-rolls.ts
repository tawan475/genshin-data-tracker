/**
 * Substat roll inference.
 *
 * Every time a substat rolls it adds one of a few fixed values (four tiers
 * from 3★ up: 70 / 80 / 90 / 100 % of the top one), so a substat's total can
 * be split back into its rolls. GOOD stores only the total (plus, from
 * irminsul, the first roll as `initialValue` and the artifact's roll count as
 * `totalRolls`), and both narrow the answer down.
 *
 * Tables are the game's ReliquaryAffixExcelConfigData values per rarity,
 * lowest tier first (percentages are exact; flat stats rounded to 0.01).
 */

type Tiers = readonly number[]

const TIERS: Readonly<Record<number, Readonly<Record<string, Tiers>>>> = {
  5: {
    hp: [209.13, 239, 268.88, 298.75],
    atk: [13.62, 15.56, 17.51, 19.45],
    def: [16.2, 18.52, 20.83, 23.15],
    hp_: [4.08, 4.66, 5.25, 5.83],
    atk_: [4.08, 4.66, 5.25, 5.83],
    def_: [5.1, 5.83, 6.56, 7.29],
    eleMas: [16.32, 18.65, 20.98, 23.31],
    enerRech_: [4.53, 5.18, 5.83, 6.48],
    critRate_: [2.72, 3.11, 3.5, 3.89],
    critDMG_: [5.44, 6.22, 6.99, 7.77],
  },
  4: {
    hp: [167.3, 191.2, 215.1, 239],
    atk: [10.89, 12.45, 14, 15.56],
    def: [12.96, 14.82, 16.67, 18.52],
    hp_: [3.26, 3.73, 4.2, 4.66],
    atk_: [3.26, 3.73, 4.2, 4.66],
    def_: [4.08, 4.66, 5.25, 5.83],
    eleMas: [13.06, 14.92, 16.79, 18.65],
    enerRech_: [3.63, 4.14, 4.66, 5.18],
    critRate_: [2.18, 2.49, 2.8, 3.11],
    critDMG_: [4.35, 4.97, 5.6, 6.22],
  },
  3: {
    hp: [100.38, 114.72, 129.06, 143.4],
    atk: [6.54, 7.47, 8.4, 9.34],
    def: [7.78, 8.89, 10, 11.11],
    hp_: [2.45, 2.8, 3.15, 3.5],
    atk_: [2.45, 2.8, 3.15, 3.5],
    def_: [3.06, 3.5, 3.93, 4.37],
    eleMas: [9.79, 11.19, 12.59, 13.99],
    enerRech_: [2.72, 3.11, 3.5, 3.89],
    critRate_: [1.63, 1.86, 2.1, 2.33],
    critDMG_: [3.26, 3.73, 4.2, 4.66],
  },
  2: {
    hp: [50.19, 60.95, 71.7],
    atk: [3.27, 3.97, 4.67],
    def: [3.89, 4.72, 5.56],
    hp_: [1.63, 1.98, 2.33],
    atk_: [1.63, 1.98, 2.33],
    def_: [2.04, 2.48, 2.91],
    eleMas: [6.53, 7.93, 9.33],
    enerRech_: [1.81, 2.2, 2.59],
    critRate_: [1.09, 1.32, 1.55],
    critDMG_: [2.18, 2.64, 3.11],
  },
  1: {
    hp: [23.9, 29.88],
    atk: [1.56, 1.95],
    def: [1.85, 2.31],
    hp_: [1.17, 1.46],
    atk_: [1.17, 1.46],
    def_: [1.46, 1.82],
    eleMas: [4.66, 5.83],
    enerRech_: [1.3, 1.62],
    critRate_: [0.78, 0.97],
    critDMG_: [1.55, 1.94],
  },
}

/** Highest level per rarity; a substat rolls at every fourth level. */
const MAX_LEVEL: Readonly<Record<number, number>> = { 5: 20, 4: 16, 3: 12, 2: 4, 1: 4 }

export function maxLevel(rarity: number): number {
  return MAX_LEVEL[rarity] ?? 20
}

/** Upgrades an artifact of this rarity gets on the way to max level. */
function maxUpgrades(rarity: number): number {
  return Math.floor(maxLevel(rarity) / 4)
}

export function isPercentStat(key: string): boolean {
  return key.endsWith('_')
}

/** Roll values for a substat at a rarity, lowest first; [] for unknown keys. */
export function getRollTiers(key: string, rarity = 5): Tiers {
  return TIERS[rarity]?.[key] ?? []
}

export function getMaxRollTier(key: string, rarity = 5): number {
  const tiers = getRollTiers(key, rarity)
  return tiers[tiers.length - 1] ?? 0
}

/**
 * The game shows (and irminsul exports) percentages rounded to 0.1 and flat
 * stats to whole numbers, so a sum of rolls matches within half of that.
 * Flat tiers are themselves rounded to 0.01, which adds up over six rolls.
 */
function tolerance(key: string, loose: boolean): number {
  const base = isPercentStat(key) ? 0.05 + 1e-6 : 0.5 + 0.031
  return loose ? base * 2 : base
}

/** 1 (lowest tier) to 4 (top tier). Below 3★ there are fewer tiers, aligned to the top. */
export type RollQuality = 1 | 2 | 3 | 4

export interface InferredRoll {
  value: number
  quality: RollQuality
}

interface Combo {
  /** Tier index of every roll, highest first. */
  tiers: number[]
  sum: number
}

const comboCache = new Map<string, Combo[]>()

/** Every multiset of 1..maxRolls tiers, with its sum. At most 209 for 4 tiers and 6 rolls. */
function combos(key: string, rarity: number): Combo[] {
  const cacheKey = `${rarity}:${key}`
  let list = comboCache.get(cacheKey)
  if (list) return list
  const tiers = getRollTiers(key, rarity)
  const maxRolls = 1 + maxUpgrades(rarity)
  list = []
  const out = list
  const walk = (from: number, picked: number[], sum: number) => {
    if (picked.length > 0) out.push({ tiers: [...picked], sum })
    if (picked.length === maxRolls) return
    for (let t = from; t >= 0; t--) {
      picked.push(t)
      walk(t, picked, sum + tiers[t]!)
      picked.pop()
    }
  }
  walk(tiers.length - 1, [], 0)
  comboCache.set(cacheKey, list)
  return list
}

interface RollOption {
  count: number
  tiers: number[]
  error: number
}

const optionCache = new Map<string, RollOption[]>()

/**
 * For each possible roll count, the closest decomposition of `value` (one
 * per count, fewest rolls first). With `initialValue` the first roll is
 * known, so only decompositions containing that tier count.
 */
function rollOptions(
  key: string,
  value: number,
  rarity: number,
  initialValue: number | undefined,
): RollOption[] {
  const cacheKey = `${rarity}:${key}:${value}:${initialValue ?? ''}`
  const hit = optionCache.get(cacheKey)
  if (hit) return hit

  const tiers = getRollTiers(key, rarity)
  let options: RollOption[] = []
  if (tiers.length > 0 && value > 0) {
    let initialTier: number | null = null
    if (initialValue !== undefined) {
      let best = Infinity
      tiers.forEach((tier, index) => {
        const diff = Math.abs(tier - initialValue)
        if (diff <= tolerance(key, false) && diff < best) {
          best = diff
          initialTier = index
        }
      })
    }
    for (const loose of [false, true]) {
      const limit = tolerance(key, loose)
      const byCount = new Map<number, RollOption>()
      for (const combo of combos(key, rarity)) {
        const error = Math.abs(combo.sum - value)
        if (error > limit) continue
        if (initialTier !== null && !combo.tiers.includes(initialTier)) continue
        const count = combo.tiers.length
        const current = byCount.get(count)
        if (!current || error < current.error - 1e-9) {
          byCount.set(count, { count, tiers: combo.tiers, error })
        }
      }
      options = [...byCount.values()].sort((a, b) => a.count - b.count)
      if (options.length > 0) break
    }
  }
  optionCache.set(cacheKey, options)
  return options
}

function toRolls(key: string, rarity: number, tiers: number[]): InferredRoll[] {
  const values = getRollTiers(key, rarity)
  const offset = 4 - values.length
  return tiers.map((t) => ({
    value: values[t]!,
    quality: Math.min(4, Math.max(1, offset + t + 1)) as RollQuality,
  }))
}

/** One substat on its own: the fewest rolls that add up to `value`. */
export function inferSubstatRolls(
  key: string,
  value: number,
  rarity = 5,
  initialValue?: number,
): InferredRoll[] {
  const best = rollOptions(key, value, rarity, initialValue)[0]
  return best ? toRolls(key, rarity, best.tiers) : []
}

/**
 * Roll counts the artifact can have in total. With `totalRolls` (irminsul)
 * that is exact; otherwise it follows from the level: one roll per four
 * levels, plus the starting lines (rarity − 2 or rarity − 1 of them, at
 * most 4). An upgrade spent opening a new line counts as that line's roll.
 */
function possibleTotals(
  rarity: number,
  level: number,
  lines: number,
  totalRolls?: number,
): number[] {
  if (totalRolls && totalRolls > 0) return [totalRolls]
  const upgrades = Math.min(maxUpgrades(rarity), Math.floor(level / 4))
  const minStart = Math.max(0, rarity - 2)
  const maxStart = Math.min(4, rarity - 1)
  const totals: number[] = []
  for (let start = maxStart; start >= minStart; start--) {
    const opened = lines - start
    if (opened < 0 || opened > upgrades) continue
    totals.push(start + upgrades)
  }
  return totals
}

export interface RollSource {
  rarity: number
  level: number
  substats: readonly { key: string; value: number; initialValue?: number }[]
  totalRolls?: number
}

/**
 * Rolls for every substat of an artifact (same order as `substats`; an empty
 * list where the value cannot be decomposed). Where a substat alone is
 * ambiguous (3 high rolls or 4 low ones), the artifact's total roll count
 * decides.
 */
export function inferArtifactRolls(artifact: RollSource): InferredRoll[][] {
  const { rarity, substats } = artifact
  const options = substats.map((s) => rollOptions(s.key, s.value, rarity, s.initialValue))
  const totals = possibleTotals(rarity, artifact.level, substats.length, artifact.totalRolls)

  let best: { pick: RollOption[]; error: number } | null = null
  if (totals.length > 0 && options.every((o) => o.length > 0)) {
    const pick: RollOption[] = []
    const walk = (index: number, count: number, error: number) => {
      if (index === options.length) {
        if (totals.includes(count) && (!best || error < best.error - 1e-9)) {
          best = { pick: [...pick], error }
        }
        return
      }
      for (const option of options[index]!) {
        pick.push(option)
        walk(index + 1, count + option.count, error + option.error)
        pick.pop()
      }
    }
    walk(0, 0, 0)
  }

  const chosen: (RollOption | undefined)[] =
    (best as { pick: RollOption[] } | null)?.pick ?? options.map((o) => o[0])
  return substats.map((s, i) => {
    const option = chosen[i]
    return option ? toRolls(s.key, rarity, option.tiers) : []
  })
}

/** Roll quality as a data colour: the game's rarity colours, lowest to top tier. */
export const ROLL_QUALITY_BG: Readonly<Record<RollQuality, string>> = {
  1: 'bg-rarity-1',
  2: 'bg-rarity-3',
  3: 'bg-rarity-4',
  4: 'bg-rarity-5',
}

export const ROLL_QUALITY_TEXT: Readonly<Record<RollQuality, string>> = {
  1: 'text-rarity-1',
  2: 'text-rarity-3',
  3: 'text-rarity-4',
  4: 'text-rarity-5',
}

/** Bar height per quality, so the difference reads without colour too. */
export const ROLL_QUALITY_HEIGHT: Readonly<Record<RollQuality, string>> = {
  1: 'h-2.5',
  2: 'h-3',
  3: 'h-3.5',
  4: 'h-4',
}

export const ROLL_QUALITY_LABEL: Readonly<Record<RollQuality, string>> = {
  1: '70%',
  2: '80%',
  3: '90%',
  4: '100%',
}
