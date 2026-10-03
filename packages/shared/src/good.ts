/**
 * GOOD (Genshin Open Object Description), the interchange format shared with
 * Genshin Optimizer and irminsul.
 *
 * The field set mirrors what irminsul emits (`irminsul/src/good.rs`); that file
 * is the wire contract. Fields other scanners add are not stored.
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
