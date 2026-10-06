/**
 * Levels as the game shows them: "Lv. 80/90", the current level over the
 * cap of the current ascension phase. Characters and weapons share the
 * phases (A0 20, A1 40, … A6 90); 1★/2★ weapons stop at A4 (70).
 */

/** Level cap per ascension phase, A0–A6. */
export const ASCENSION_LEVEL_CAPS = [20, 40, 50, 60, 70, 80, 90] as const

/** Past A6 (levels 91–100) the game's ceiling. */
export const MAX_LEVEL = 100

/**
 * The cap a level sits under: the ascension phase's cap, or — when the
 * pair is inconsistent (a level above its phase's cap) — the first cap at
 * or above the level, and 100 past 90.
 */
export function levelCap(ascension: number, level = 0): number {
  const phase = Math.min(ASCENSION_LEVEL_CAPS.length - 1, Math.max(0, Math.trunc(ascension) || 0))
  const cap: number = ASCENSION_LEVEL_CAPS[phase]!
  if (level <= cap) return cap
  return ASCENSION_LEVEL_CAPS.find((c) => c >= level) ?? MAX_LEVEL
}

/** "Lv. 80/90". */
export function formatLevel(level: number, ascension: number): string {
  return `Lv. ${level}/${levelCap(ascension, level)}`
}
