/**
 * What an artifact can still become: its upgrades to come and the crit value
 * they should add. Pure, from the roll tables in utils/artifact-rolls.
 *
 * - An upgrade comes every four levels up to the rarity's max (+20 for 5★).
 * - A 3-line piece's unactivated fourth line (`unactivatedSubstats`) opens
 *   at the first upgrade with its known value; otherwise (older captures)
 *   an upgrade spent opening a line is assumed to add no crit.
 * - Every other upgrade rolls one of the four lines, each equally likely,
 *   by one of four tiers (70–100 % of the top roll), equally likely.
 *
 * Expected CV at max = CV now + the opened line + each upgrade's chance of a
 * crit line times that line's average roll. Best case: every upgrade a top
 * roll on the best crit line. Max RV: every upgrade a top roll (100 %).
 */

import { calculateCV, type GoodSubstat } from '@gdt/shared'
import { getRollTiers, maxLevel } from '@/utils/artifact-rolls'

export interface PotentialSource {
  rarity: number
  level: number
  substats: readonly GoodSubstat[]
  unactivatedSubstats?: readonly GoodSubstat[]
}

export interface Potential {
  /** Upgrades still to come (one per four levels). */
  left: number
  /** The line the next upgrade opens, when the capture says. */
  activates: GoodSubstat | null
  /** Crit lines once every line is open. */
  critLines: number
  /** Chance an upgrade rolls a crit line, 0–1. */
  critChance: number
  /** CV expected at max level. */
  expectedCv: number
  /** CV at max level if every upgrade is a top crit roll. */
  bestCv: number
  /** RV at max level if every upgrade is a top roll. */
  maxRv: number
}

/** Crit value of one crit roll (CRIT Rate counts twice). */
const CRIT_WEIGHT: Readonly<Record<string, number>> = { critRate_: 2, critDMG_: 1 }

/** Upgrades still to come: one substat roll per four levels until max. */
export function upgradesLeft(artifact: { rarity: number; level: number }): number {
  return Math.max(0, Math.floor(maxLevel(artifact.rarity) / 4) - Math.floor(artifact.level / 4))
}

/** CV one roll of `key` adds at a rarity: the tiers' average and the top tier (0 for non-crit). */
export function critRoll(key: string, rarity: number): { average: number; max: number } {
  const weight = CRIT_WEIGHT[key]
  const tiers = getRollTiers(key, rarity)
  if (!weight || tiers.length === 0) return { average: 0, max: 0 }
  const average = tiers.reduce((sum, t) => sum + t, 0) / tiers.length
  return { average: weight * average, max: weight * tiers[tiers.length - 1]! }
}

const round1 = (value: number) => Math.round(value * 10) / 10

export function artifactPotential(artifact: PotentialSource, rv: number): Potential {
  const total = upgradesLeft(artifact)
  let rolls = total
  const lines: GoodSubstat[] = [...artifact.substats]
  const activates = artifact.unactivatedSubstats?.[0] ?? null
  if (activates && rolls > 0) {
    lines.push(activates)
    rolls--
  } else if (lines.length < 4) {
    // Lines still to open with unknown stats: count them as no crit.
    rolls = Math.max(0, rolls - (4 - lines.length))
  }
  const now = calculateCV(lines)
  let perRoll = 0
  let best = 0
  let critLines = 0
  for (const line of lines) {
    const roll = critRoll(line.key, artifact.rarity)
    if (roll.max === 0) continue
    critLines++
    perRoll += roll.average / 4
    best = Math.max(best, roll.max)
  }
  return {
    left: total,
    activates: activates && total > 0 ? activates : null,
    critLines,
    critChance: critLines / 4,
    expectedCv: round1(now + rolls * perRoll),
    bestCv: round1(now + rolls * best),
    maxRv: rv + total * 100,
  }
}
