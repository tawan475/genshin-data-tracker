import type { ArtifactIdentity, ArtifactState } from '../artifact'
import type { GoodCharacter, GoodSubstat, GoodWeapon } from '../good'

export interface ArtifactOccurrence {
  identity: ArtifactIdentity
  state: ArtifactState
}

/** An uploaded GOOD file after every field has been checked and coerced. */
export interface NormalizedGood {
  format: string
  version: number
  source: string
  /** The payload's own `timestamp`, unvalidated; see `resolveImportTimestamp`. */
  timestamp: unknown
  characters: GoodCharacter[]
  weapons: GoodWeapon[]
  artifacts: ArtifactOccurrence[]
  materials: Map<string, number>
  /** Sorted, de-duplicated; `null` when the file carried none, so export omits the field. */
  achievements: number[] | null
}

export class GoodFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoodFormatError'
  }
}

type Json = Record<string, unknown>

/**
 * Validates an untrusted, already-parsed GOOD payload. Malformed entries are
 * dropped rather than failing the whole import, and missing fields take their
 * GOOD defaults, so files from other scanners still import.
 */
export function normalizeGood(input: unknown): NormalizedGood {
  if (!isObject(input)) throw new GoodFormatError('GOOD payload must be a JSON object')

  const achievementsRaw = Array.isArray(input.gi_achievements)
    ? input.gi_achievements
    : Array.isArray(input.achievements)
      ? input.achievements
      : null

  return {
    format: str(input.format) || 'GOOD',
    version: num(input.version, 1),
    source: str(input.source) || 'Unknown',
    timestamp: input.timestamp,
    characters: objects(input.characters).flatMap(toCharacter),
    weapons: objects(input.weapons).flatMap(toWeapon),
    artifacts: objects(input.artifacts).map(toArtifact),
    materials: toMaterials(input.materials),
    achievements: achievementsRaw && toAchievements(achievementsRaw),
  }
}

function toCharacter(raw: Json): GoodCharacter[] {
  const key = str(raw.key)
  if (!key) return []
  const talent = isObject(raw.talent) ? raw.talent : {}
  return [
    {
      key,
      level: num(raw.level, 1),
      constellation: num(raw.constellation, 0),
      ascension: num(raw.ascension, 0),
      talent: {
        auto: num(talent.auto, 1),
        skill: num(talent.skill, 1),
        burst: num(talent.burst, 1),
      },
    },
  ]
}

function toWeapon(raw: Json): GoodWeapon[] {
  const key = str(raw.key)
  if (!key) return []
  return [
    {
      key,
      level: num(raw.level, 1),
      ascension: num(raw.ascension, 0),
      refinement: num(raw.refinement, 1),
      location: str(raw.location),
      lock: Boolean(raw.lock),
    },
  ]
}

function toArtifact(raw: Json): ArtifactOccurrence {
  return {
    identity: {
      setKey: str(raw.setKey),
      slotKey: str(raw.slotKey),
      level: num(raw.level, 0),
      rarity: num(raw.rarity, 0),
      mainStatKey: str(raw.mainStatKey),
      substats: toSubstats(raw.substats),
      totalRolls: num(raw.totalRolls, 0),
      elixerCrafted: Boolean(raw.elixerCrafted),
      unactivatedSubstats: toSubstats(raw.unactivatedSubstats),
    },
    state: {
      location: str(raw.location),
      lock: Boolean(raw.lock),
      astralMark: Boolean(raw.astralMark),
    },
  }
}

function toSubstats(raw: unknown): GoodSubstat[] {
  return objects(raw).flatMap((s) => {
    const key = str(s.key)
    if (!key) return []
    const substat: GoodSubstat = { key, value: num(s.value, 0) }
    if (typeof s.initialValue === 'number' && Number.isFinite(s.initialValue)) {
      substat.initialValue = s.initialValue
    }
    return [substat]
  })
}

function toMaterials(raw: unknown): Map<string, number> {
  const materials = new Map<string, number>()
  if (!isObject(raw)) return materials
  for (const [key, count] of Object.entries(raw)) {
    if (key && typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      materials.set(key, count)
    }
  }
  return materials
}

function toAchievements(raw: unknown[]): number[] {
  const ids = raw.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0)
  return [...new Set(ids)].sort((a, b) => a - b)
}

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function objects(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
