/**
 * GOOD (Genshin Open Object Description), the interchange format shared with
 * Genshin Optimizer and irminsul.
 *
 * The field set mirrors what irminsul emits (`irminsul/src/good.rs`); that file
 * is the wire contract. Fields other scanners add are not stored, nor are
 * fields inside irminsul's `gi_*` keys that this file does not list.
 */

export interface GoodSubstat {
  key: string
  value: number
  initialValue?: number
}

export interface GoodArtifact {
  setKey: string
  slotKey: string
  level: number
  rarity: number
  mainStatKey: string
  location: string
  lock: boolean
  substats: GoodSubstat[]
  totalRolls?: number
  astralMark?: boolean
  elixerCrafted?: boolean
  unactivatedSubstats?: GoodSubstat[]
}

export interface GoodWeapon {
  key: string
  level: number
  ascension: number
  refinement: number
  location: string
  lock: boolean
}

export interface GoodCharacter {
  key: string
  level: number
  constellation: number
  ascension: number
  talent: { auto: number; skill: number; burst: number }
}

/**
 * irminsul's `gi_player`: account values GOOD has no place for. The game sends
 * them at login, so they describe the login, not the capture (resin keeps
 * regenerating after it). Every field is optional.
 */
export interface GiPlayer {
  uid?: number
  /** Adventure Rank, 1-60. */
  ar?: number
  /** Adventure EXP toward the next rank. */
  arExp?: number
  /** World Level, 0-9. */
  wl?: number
  /** The highest World Level the account may choose. */
  wlLimit?: number
  /** Original Resin. */
  resin?: number
  storyKeys?: number
  /** In the game's units: 24000 is the 240 it shows. */
  maxStamina?: number
  /** The game-data dump commit the exporting irminsul build carries. */
  gameData?: string
}

/** One character's entry in irminsul's `gi_characters`. */
export interface GiCharacter {
  /** Friendship level, 1-10. */
  friendship?: number
  /** When the character joined the account, unix seconds. */
  obtainedAt?: number
}

export interface Good {
  format: string
  version: number
  source: string
  characters: GoodCharacter[]
  artifacts: GoodArtifact[]
  weapons: GoodWeapon[]
  materials: Record<string, number>
  gi_achievements?: number[]
  /** Epoch milliseconds of the capture; irminsul always sets it. */
  timestamp?: number
  // irminsul's own top-level additions (not GOOD); each is optional.
  gi_player?: GiPlayer
  /** Finish time of achievements, unix seconds, keyed by achievement id. */
  gi_achievement_times?: Record<string, number>
  /** Keyed by the character's GOOD key (Traveler with its element). */
  gi_characters?: Record<string, GiCharacter>
}

/**
 * Converts an in-game name into a GOOD PascalCase key: drop every symbol,
 * capitalise each word, join without spaces.
 *
 * - "Gladiator's Finale" -> "GladiatorsFinale"
 * - "Spirit Locket of Boreas" -> "SpiritLocketOfBoreas"
 * - '"The Catch"' -> "TheCatch"
 */
export function toGoodKey(name: string): string {
  if (!name) return ''
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}
