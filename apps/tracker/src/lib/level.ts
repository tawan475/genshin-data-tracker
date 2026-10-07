/**
 * Levels as the game shows them: "Lv. 80/90", the current level over the
 * cap of the current ascension phase. Characters and weapons share the
 * phases (A0 20, A1 40, … A6 90); 1★/2★ weapons stop at A4 (70). Past 90
 * a character isn't levelled with EXP but raised with Masterless Stardust
 * straight to 95, then 100, so the game shows 95/95 and 100/100.
 */

/** Level cap per ascension phase, A0–A6. */
export const ASCENSION_LEVEL_CAPS = [20, 40, 50, 60, 70, 80, 90] as const

/**
 * The cap a level sits under: the ascension phase's cap, or — when the
 * pair is inconsistent (a level above its phase's cap) — the first cap at
 * or above the level; past 90 the level itself (95/95, 100/100).
 */
export function levelCap(ascension: number, level = 0): number {
  const phase = Math.min(ASCENSION_LEVEL_CAPS.length - 1, Math.max(0, Math.trunc(ascension) || 0))
  const cap: number = ASCENSION_LEVEL_CAPS[phase]!
  if (level <= cap) return cap
  return ASCENSION_LEVEL_CAPS.find((c) => c >= level) ?? level
}

/** "Lv. 80/90". */
export function formatLevel(level: number, ascension: number): string {
  return `Lv. ${level}/${levelCap(ascension, level)}`
}
