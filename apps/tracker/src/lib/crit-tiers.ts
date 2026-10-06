/**
 * Colour tiers for crit value (CV) and roll value (RV), after akasha.cv
 * (its bundle main.9683e590.js, read 2026-10-07):
 *
 * - One artifact's CV: grey below 15, then blue 15, purple 25, orange 35,
 *   gold 45, cyan 50 and a glowing red from 54.4, compared at one decimal
 *   (as shown). A circlet with a CRIT main stat is tiered as if 7.77 higher
 *   (its main stat stands in for a crit roll pair); the number shown stays.
 * - A build's CV (five pieces added up): 180 / 200 / 220 / 240 / 260 / 300.
 * - RV (each roll as a % of the stat's highest roll, added up):
 *   350 / 450 / 550 / 650 / 750 / 900. akasha adds up the rolls of the
 *   stats it counts for the character (CRIT by default); ours counts every
 *   substat, i.e. akasha with all four lines counted.
 *
 * Tier 0 is grey (including no crit at all), 6 the top. The colours are the
 * `cv-0`…`cv-6` tokens in main.css, in akasha's hue order.
 */

export type CritTier = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Lower bounds of tiers 1–6. */
export const ARTIFACT_CV_TIERS = [15, 25, 35, 45, 50, 54.4] as const
export const BUILD_CV_TIERS = [180, 200, 220, 240, 260, 300] as const
export const RV_TIERS = [350, 450, 550, 650, 750, 900] as const

/** What akasha adds to a CRIT circlet's CV before tiering it. */
export const CRIT_CIRCLET_BONUS = 7.77

export type CvScope = 'artifact' | 'build'

function tierOf(value: number, bounds: readonly number[]): CritTier {
  let tier = 0
  for (const bound of bounds) if (value >= bound) tier++
  return tier as CritTier
}

/** At one decimal, as the number is shown (akasha compares 49.95 as 50). */
const shown = (value: number) => Math.round(value * 10) / 10

/** True for a circlet whose main stat is CRIT Rate or CRIT DMG. */
export function isCritCirclet(slotKey: string, mainStatKey: string): boolean {
  return slotKey === 'circlet' && (mainStatKey === 'critRate_' || mainStatKey === 'critDMG_')
}

export function cvTier(cv: number, scope: CvScope = 'artifact', critCirclet = false): CritTier {
  if (!Number.isFinite(cv) || cv <= 0) return 0
  if (scope === 'build') return tierOf(shown(cv), BUILD_CV_TIERS)
  return tierOf(shown(critCirclet ? cv + CRIT_CIRCLET_BONUS : cv), ARTIFACT_CV_TIERS)
}

export function rvTier(rv: number): CritTier {
  return Number.isFinite(rv) ? tierOf(rv, RV_TIERS) : 0
}

/** Text colour per tier; literal class names so Tailwind sees them. */
export const CRIT_TIER_TEXT: Readonly<Record<CritTier, string>> = {
  0: 'text-cv-0',
  1: 'text-cv-1',
  2: 'text-cv-2',
  3: 'text-cv-3',
  4: 'text-cv-4',
  5: 'text-cv-5',
  6: 'text-cv-6 cv-glow',
}

/** "15 / 25 / 35 / 45 / 50 / 54.4", for tooltips. */
export function tierBounds(bounds: readonly number[]): string {
  return bounds.join(' / ')
}
