import type { ArtifactIdentity, ArtifactState } from '../artifact'
import type { GiCharacter, GiPlayer, GoodCharacter, GoodSubstat, GoodWeapon } from '../good'

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
  // irminsul's own keys. Each is `null` when the file had none (or nothing in
  // it passed the checks), so export omits it.
  /** `gi_player`, fields that pass their range check only, in a fixed order. */
  player: GiPlayer | null
  /** `gi_achievement_times`: [achievement id, unix seconds], sorted by id. */
  achievementTimes: [number, number][] | null
  /** `gi_characters`: GOOD key -> values that pass their check, sorted by key. */
  characterExtras: Map<string, GiCharacter> | null
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
  // Every GOOD exporter writes this marker; without it, arbitrary JSON would be
  // stored as an empty snapshot.
  if (input.format !== 'GOOD')
    throw new GoodFormatError('Not a GOOD file (missing "format": "GOOD")')

  const achievementsRaw = Array.isArray(input.gi_achievements)
    ? input.gi_achievements
    : Array.isArray(input.achievements)
      ? input.achievements
      : null

  return {
    format: 'GOOD',
    version: num(input.version, 1),
    source: str(input.source) || 'Unknown',
    timestamp: input.timestamp,
    characters: objects(input.characters).flatMap(toCharacter),
    weapons: objects(input.weapons).flatMap(toWeapon),
    artifacts: objects(input.artifacts).map(toArtifact),
    materials: toMaterials(input.materials),
    achievements: achievementsRaw && toAchievements(achievementsRaw),
    player: toPlayer(input.gi_player),
    achievementTimes: toAchievementTimes(input.gi_achievement_times),
    characterExtras: toCharacterExtras(input.gi_characters),
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

// ------------------------------------------------------------ irminsul's keys
// irminsul range-checks these before sending; they are checked again because
// any client can upload, and a value outside its range is dropped (the field,
// not the file).

/** 2020-09-15 UTC, two weeks before the game launched (irminsul's bound too). */
const EARLIEST_GAME_TIME = 1_600_128_000
/** Unix seconds as irminsul sends them: an unsigned 32-bit number. */
const LATEST_GAME_TIME = 0xffff_ffff

/**
 * Each `gi_player` field and its valid range, in the order a stored player
 * section lists them. Append only: the order is part of the stored form.
 */
const PLAYER_FIELDS: readonly [keyof GiPlayer, number, number][] = [
  ['uid', 100_000_000, 9_999_999_999], // 9 or 10 digits, like an account's UID
  ['ar', 1, 60],
  ['arExp', 0, 10_000_000],
  ['wl', 0, 9],
  ['wlLimit', 0, 9],
  ['resin', 0, 2_000], // refills can take it past the natural cap
  ['storyKeys', 0, 1_000],
  ['maxStamina', 1, 100_000],
]

/** The order of a stored player section's keys: PLAYER_FIELDS, then `gameData`. */
export const PLAYER_KEY_ORDER: readonly string[] = [
  ...PLAYER_FIELDS.map(([field]) => field),
  'gameData',
]

function toPlayer(raw: unknown): GiPlayer | null {
  if (!isObject(raw)) return null
  const player: Record<string, number | string> = {}
  for (const [field, min, max] of PLAYER_FIELDS) {
    const value = raw[field]
    if (isIntIn(value, min, max)) player[field] = value
  }
  if (typeof raw.gameData === 'string' && /^[0-9a-f]{1,64}$/.test(raw.gameData)) {
    player.gameData = raw.gameData
  }
  // A key that only names the game data says nothing about the account.
  const known = Object.keys(player).filter((key) => key !== 'gameData')
  return known.length > 0 ? (player as GiPlayer) : null
}

function toAchievementTimes(raw: unknown): [number, number][] | null {
  if (!isObject(raw)) return null
  const times: [number, number][] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[1-9]\d{0,8}$/.test(key)) continue
    if (isIntIn(value, EARLIEST_GAME_TIME, LATEST_GAME_TIME)) times.push([Number(key), value])
  }
  return times.length > 0 ? times.sort((a, b) => a[0] - b[0]) : null
}

function toCharacterExtras(raw: unknown): Map<string, GiCharacter> | null {
  if (!isObject(raw)) return null
  const extras = new Map<string, GiCharacter>()
  for (const key of Object.keys(raw).sort()) {
    const value = raw[key]
    if (!key || !isObject(value)) continue
    const extra: GiCharacter = {}
    if (isIntIn(value.friendship, 1, 10)) extra.friendship = value.friendship
    if (isIntIn(value.obtainedAt, EARLIEST_GAME_TIME, LATEST_GAME_TIME)) {
      extra.obtainedAt = value.obtainedAt
    }
    if (extra.friendship !== undefined || extra.obtainedAt !== undefined) extras.set(key, extra)
  }
  return extras.size > 0 ? extras : null
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
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
