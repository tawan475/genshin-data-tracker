import type { ArtifactIdentity, ArtifactState } from '../artifact'
import type { KeyDictionary } from '../dictionary'
import type {
  GiAnecdote,
  GiAnecdotes,
  GiCharacter,
  GiExpedition,
  GiPlayer,
  GiTasks,
  GoodCharacter,
  GoodSubstat,
  GoodWeapon,
} from '../good'
import { GOOD_LIMITS } from '../import'
import { readCapture, type GiCapture } from '../live/capture'

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
  /**
   * `gi_anecdotes`, the parts that pass their checks: entries by ascending
   * id, areas sorted and unique, `reward` / `wish` only when whole.
   */
  anecdotes: GiAnecdotes | null
  /**
   * Live sync (irminsul's `gi_guid` on items, `gi_capture`): never stored in
   * a section and never part of a hash. `itemGuids` lists each kept
   * artifact's and weapon's guid in the order of `artifacts` / `weapons`
   * (null for an item without a valid one); absent when no item had one.
   */
  itemGuids?: { artifacts: (string | null)[]; weapons: (string | null)[] }
  capture?: GiCapture | null
  /** `gi_tasks`, the parts that pass their checks whole (see toTasks). */
  tasks: GiTasks | null
}

export class GoodFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoodFormatError'
  }
}

/**
 * A GOOD file over one of GOOD_LIMITS: more items than the game can hold, or
 * a key longer than any real one. `code` is what the API answers with (422).
 */
export class GoodLimitError extends GoodFormatError {
  constructor(
    readonly code: 'too_many_items' | 'key_too_long',
    message: string,
  ) {
    super(message)
    this.name = 'GoodLimitError'
  }
}

export interface NormalizeOptions {
  /**
   * The material dictionary (kept out of the main entry point): a material
   * key it knows may be longer than GOOD_LIMITS.keyLength. Without it, every
   * key is held to that length.
   */
  materials?: KeyDictionary
}

type Json = Record<string, unknown>

/**
 * Validates an untrusted, already-parsed GOOD payload. Malformed entries are
 * dropped rather than failing the whole import, and missing fields take their
 * GOOD defaults, so files from other scanners still import. A file over
 * GOOD_LIMITS fails as a whole (GoodLimitError).
 */
export function normalizeGood(input: unknown, options: NormalizeOptions = {}): NormalizedGood {
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
  checkCounts(input, achievementsRaw)

  const good: NormalizedGood = {
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
    anecdotes: toAnecdotes(input.gi_anecdotes),
    tasks: toTasks(input.gi_tasks),
  }
  const itemGuids = toItemGuids(input)
  if (itemGuids) good.itemGuids = itemGuids
  if (input.gi_capture !== undefined) good.capture = readCapture(input.gi_capture)
  checkKeys(good, options)
  return good
}

// ---------------------------------------------------------------- GOOD_LIMITS
// Counted on the raw file, before any entry is looked at, so an oversized one
// costs no more work than reading it did.

function checkCounts(input: Json, achievements: unknown[] | null): void {
  const count = (value: unknown) =>
    Array.isArray(value) ? value.length : isObject(value) ? Object.keys(value).length : 0
  const caps: [string, number, number][] = [
    ['characters', count(input.characters), GOOD_LIMITS.characters],
    ['weapons', count(input.weapons), GOOD_LIMITS.weapons],
    ['artifacts', count(input.artifacts), GOOD_LIMITS.artifacts],
    ['materials', count(input.materials), GOOD_LIMITS.materialKeys],
    ['achievements', count(achievements), GOOD_LIMITS.achievements],
    ['achievement times', count(input.gi_achievement_times), GOOD_LIMITS.achievements],
    ['character extras', count(input.gi_characters), GOOD_LIMITS.characters],
    [
      'anecdotes',
      count(isObject(input.gi_anecdotes) ? input.gi_anecdotes.anecdotes : null),
      GOOD_LIMITS.anecdotes,
    ],
  ]
  for (const [what, n, max] of caps) {
    if (n > max) {
      throw new GoodLimitError(
        'too_many_items',
        `This file has ${formatCount(n)} ${what}; at most ${formatCount(max)} are accepted.`,
      )
    }
  }
  for (const artifact of objects(input.artifacts)) {
    const n = Math.max(count(artifact.substats), count(artifact.unactivatedSubstats))
    if (n > GOOD_LIMITS.substats) {
      throw new GoodLimitError(
        'too_many_items',
        `An artifact in this file has ${formatCount(n)} substats; at most ${GOOD_LIMITS.substats} are accepted.`,
      )
    }
  }
}

/** Every key that would be stored spelled out, and `source`, within GOOD_LIMITS.keyLength. */
function checkKeys(good: NormalizedGood, { materials }: NormalizeOptions): void {
  const check = (what: string, key: string) => {
    if (key.length <= GOOD_LIMITS.keyLength) return
    throw new GoodLimitError(
      'key_too_long',
      `A ${what} in this file is ${formatCount(key.length)} characters long ` +
        `("${key.slice(0, 24)}…"); at most ${GOOD_LIMITS.keyLength} are accepted.`,
    )
  }
  check('source', good.source)
  for (const c of good.characters) check('character key', c.key)
  for (const w of good.weapons) {
    check('weapon key', w.key)
    check('weapon location', w.location)
  }
  for (const { identity: a, state } of good.artifacts) {
    check('artifact set key', a.setKey)
    check('artifact slot key', a.slotKey)
    check('artifact main stat key', a.mainStatKey)
    check('artifact location', state.location)
    for (const s of a.substats) check('substat key', s.key)
    for (const s of a.unactivatedSubstats) check('substat key', s.key)
  }
  for (const key of good.materials.keys()) {
    if (!materials?.ids.has(key)) check('material key', key)
  }
  for (const key of good.characterExtras?.keys() ?? []) check('character key', key)
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
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
      ...itemExp(raw),
    },
  ]
}

/** Above any EXP an item holds toward its next level (a 5★ weapon's 89 → 90 is ~1.1M). */
const MAX_ITEM_EXP = 5_000_000

/** `gi_exp` when it is a real, non-zero EXP; 0 and unknown are both left out. */
function itemExp(raw: Json): { gi_exp?: number } {
  return isIntIn(raw.gi_exp, 1, MAX_ITEM_EXP) ? { gi_exp: raw.gi_exp } : {}
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
      ...(isIntIn(raw.gi_exp, 1, MAX_ITEM_EXP) ? { exp: raw.gi_exp } : {}),
    },
  }
}

const GUID = /^\d{1,20}$/

/** Each kept item's `gi_guid`, aligned with what toArtifact / toWeapon keep. */
function toItemGuids(input: Json): NormalizedGood['itemGuids'] | null {
  const guid = (raw: Json) =>
    typeof raw.gi_guid === 'string' && GUID.test(raw.gi_guid) ? raw.gi_guid : null
  const artifacts = objects(input.artifacts).map(guid)
  const weapons = objects(input.weapons).flatMap((raw) => (str(raw.key) ? [guid(raw)] : []))
  return artifacts.some(Boolean) || weapons.some(Boolean) ? { artifacts, weapons } : null
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

/** Above any character's EXP toward their next level, and any friendship step. */
const MAX_CHARACTER_EXP = 20_000_000
const MAX_FRIENDSHIP_EXP = 1_000_000

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
    // 0 is left out like unknown: it is what the stored rows default to.
    if (isIntIn(value.exp, 1, MAX_CHARACTER_EXP)) extra.exp = value.exp
    if (isIntIn(value.friendshipExp, 1, MAX_FRIENDSHIP_EXP))
      extra.friendshipExp = value.friendshipExp
    if (Object.keys(extra).length > 0) extras.set(key, extra)
  }
  return extras.size > 0 ? extras : null
}

/** The ranges irminsul's `gi_anecdotes` contract gives (and keeps to on its side). */
const ANECDOTE_ID = [100_000, 199_999] as const
const ANECDOTE_STATE = [0, 15] as const
const ANECDOTE_FINISH_COUNT = [0, 100_000] as const
const ANECDOTE_AREA = [1, 64] as const
/** Areas the book can have: the 7.1 game has 8. */
const MAX_ANECDOTE_AREAS = 64
/** A reward exchange per 10 recorded anecdotes; the game keeps 1,000 unclaimed. */
const ANECDOTE_REWARD_INDEX = [0, 100_000] as const
const ANECDOTE_REWARD_PROGRESS = [0, 1_000] as const
const ANECDOTE_REWARD_TARGET = [1, 1_000] as const
/** The AnecdoteExtra NPC ids are 98xx; room for more. */
const ANECDOTE_NPC = [1, 999_999] as const

function toAnecdotes(raw: unknown): GiAnecdotes | null {
  if (!isObject(raw)) return null
  const entries: [number, GiAnecdote][] = []
  if (isObject(raw.anecdotes)) {
    for (const [key, value] of Object.entries(raw.anecdotes)) {
      if (!/^[1-9]\d{5}$/.test(key) || !isObject(value)) continue
      const id = Number(key)
      if (!isIntIn(id, ...ANECDOTE_ID)) continue
      // `state` omitted on the wire is 0; irminsul writes it anyway.
      const state = value.state === undefined ? 0 : value.state
      const finishCount = value.finishCount === undefined ? 0 : value.finishCount
      if (!isIntIn(state, ...ANECDOTE_STATE)) continue
      if (!isIntIn(finishCount, ...ANECDOTE_FINISH_COUNT)) continue
      entries.push([id, { state, finishCount }])
    }
  }
  entries.sort((a, b) => a[0] - b[0])
  const areas = Array.isArray(raw.unlockedAreas)
    ? [...new Set(raw.unlockedAreas.filter((v): v is number => isIntIn(v, ...ANECDOTE_AREA)))]
        .sort((a, b) => a - b)
        .slice(0, MAX_ANECDOTE_AREAS)
    : []
  const anecdotes: GiAnecdotes = {
    anecdotes: Object.fromEntries(entries.map(([id, entry]) => [String(id), entry])),
    unlockedAreas: areas,
  }
  const reward = raw.reward
  if (
    isObject(reward) &&
    isIntIn(reward.index, ...ANECDOTE_REWARD_INDEX) &&
    isIntIn(reward.progress, ...ANECDOTE_REWARD_PROGRESS) &&
    isIntIn(reward.target, ...ANECDOTE_REWARD_TARGET)
  ) {
    anecdotes.reward = { index: reward.index, progress: reward.progress, target: reward.target }
  }
  const wish = raw.wish
  if (isObject(wish) && isIntIn(wish.lastWishTime, 0, LATEST_GAME_TIME)) {
    anecdotes.wish = isIntIn(wish.npcId, ...ANECDOTE_NPC)
      ? { npcId: wish.npcId, lastWishTime: wish.lastWishTime }
      : { lastWishTime: wish.lastWishTime }
  }
  const empty = entries.length === 0 && areas.length === 0 && !anecdotes.reward && !anecdotes.wish
  return empty ? null : anecdotes
}

/** Times in `gi_tasks`: 2015-01-01 .. 2100-01-01 (the contract's window). */
const TASK_TIME = [1_420_070_400, 4_102_444_800] as const
/** The most expeditions `gi_tasks` lists (the game has five slots). */
const MAX_EXPEDITIONS = 20
/** A GOOD key, as irminsul writes one. */
const GOOD_KEY = /^[A-Za-z0-9]{1,64}$/

/**
 * irminsul's `gi_tasks` (contract v1). Each part is kept only when every
 * value in it is in range; the rest of the key still counts. Rewritten in a
 * fixed key order, so equal content hashes equal.
 */
function toTasks(raw: unknown): GiTasks | null {
  if (!isObject(raw)) return null
  const tasks: GiTasks = {}
  const c = raw.commissions
  if (isObject(c) && isIntIn(c.total, 1, 10) && isIntIn(c.finished, 0, c.total)) {
    tasks.commissions = { finished: c.finished, total: c.total }
  }
  const a = raw.abyss
  if (
    isObject(a) &&
    isIntIn(a.start, ...TASK_TIME) &&
    isIntIn(a.end, a.start + 1, Math.min(a.start + 62 * 86_400, TASK_TIME[1])) &&
    isIntIn(a.maxStars, 1, 108) &&
    isIntIn(a.stars, 0, a.maxStars)
  ) {
    tasks.abyss = { start: a.start, end: a.end, stars: a.stars, maxStars: a.maxStars }
  }
  const e = raw.expeditions
  if (Array.isArray(e) && e.length <= MAX_EXPEDITIONS) {
    const out: GiExpedition[] = []
    for (const x of e) {
      if (
        !isObject(x) ||
        !isIntIn(x.id, 1, 999_999) ||
        !isIntIn(x.start, ...TASK_TIME) ||
        !isIntIn(x.hours, 1, 100) ||
        !isIntIn(x.doneAt, x.start, TASK_TIME[1]) ||
        (x.character !== undefined &&
          (typeof x.character !== 'string' || !GOOD_KEY.test(x.character)))
      ) {
        out.length = 0
        break
      }
      out.push({
        ...(typeof x.character === 'string' ? { character: x.character } : {}),
        id: x.id,
        start: x.start,
        hours: x.hours,
        doneAt: x.doneAt,
      })
    }
    // One bad entry and the list is not believed (a partial list would say
    // fewer are out than are).
    if (out.length === e.length) {
      tasks.expeditions = out.sort(
        (p, q) => p.doneAt - q.doneAt || (p.character ?? '').localeCompare(q.character ?? ''),
      )
    }
  }
  const r = raw.realm
  if (isObject(r) && isIntIn(r.limit, 1, 100_000) && isIntIn(r.value, 0, r.limit)) {
    tasks.realm = { value: r.value, limit: r.limit }
  }
  const w = raw.welkin
  if (isObject(w) && isIntIn(w.days, 0, 400)) tasks.welkin = { days: w.days }
  return Object.keys(tasks).length > 0 ? tasks : null
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
