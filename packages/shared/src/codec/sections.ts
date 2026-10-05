/**
 * The stored form of each part of a snapshot. Every section is canonical JSON
 * (sorted, defaults trimmed, keys as dictionary ids) that the server deflates
 * once and stores under a hash of its text, so an unchanged section is stored
 * once no matter how many snapshots share it.
 *
 * These shapes are a storage format: data written today must decode forever.
 * Only ever add new optional trailing fields.
 */

import type { ArtifactIdentity, ArtifactState } from '../artifact'
import { CHARACTERS, WEAPONS, fromRef, toRef, type KeyDictionary, type KeyRef } from '../dictionary'
import type { GiCharacter, GiPlayer, GoodArtifact, GoodCharacter, GoodWeapon } from '../good'
import { sha256Hex128 } from '../hash'
import { compareTuples, deltaDecode, deltaEncode, trimDefaults } from './order'

export type SectionKind =
  | 'characters'
  | 'weapons'
  | 'artifacts'
  | 'materials'
  | 'achievements'
  // irminsul's own keys, each its own section: they change at different
  // rates (the player values on every login, the others rarely), so each
  // deduplicates on its own.
  | 'player'
  | 'achievementTimes'
  | 'characterExtras'

export interface Section {
  kind: SectionKind
  /** Content address: 128-bit SHA-256 of `kind:json`. */
  hash: string
  json: string
}

export async function makeSection(kind: SectionKind, value: unknown): Promise<Section> {
  const json = JSON.stringify(value)
  return { kind, json, hash: await sha256Hex128(`${kind}:${json}`) }
}

const n = (value: KeyRef | undefined, fallback: number): number =>
  typeof value === 'number' ? value : fallback

// ---------------------------------------------------------------- characters
// Row: [character, level, ascension, constellation, auto, skill, burst]

const CHARACTER_DEFAULTS: readonly KeyRef[] = [0, 1, 0, 0, 1, 1, 1]

export function encodeCharacters(characters: readonly GoodCharacter[]): KeyRef[][] {
  return characters
    .map((c) =>
      trimDefaults(
        [
          toRef(CHARACTERS, c.key),
          c.level,
          c.ascension,
          c.constellation,
          c.talent.auto,
          c.talent.skill,
          c.talent.burst,
        ],
        CHARACTER_DEFAULTS,
      ),
    )
    .sort(compareTuples)
}

export function decodeCharacters(rows: readonly KeyRef[][]): GoodCharacter[] {
  return rows.map((row) => ({
    key: fromRef(CHARACTERS, row[0]!),
    level: n(row[1], 1),
    constellation: n(row[3], 0),
    ascension: n(row[2], 0),
    talent: { auto: n(row[4], 1), skill: n(row[5], 1), burst: n(row[6], 1) },
  }))
}

// ------------------------------------------------------------------- weapons
// Row: [weapon, level, ascension, refinement, location character, lock]

const WEAPON_DEFAULTS: readonly KeyRef[] = [0, 1, 0, 1, 0, 0]

export function encodeWeapons(weapons: readonly GoodWeapon[]): KeyRef[][] {
  return weapons
    .map((w) =>
      trimDefaults(
        [
          toRef(WEAPONS, w.key),
          w.level,
          w.ascension,
          w.refinement,
          toRef(CHARACTERS, w.location),
          w.lock ? 1 : 0,
        ],
        WEAPON_DEFAULTS,
      ),
    )
    .sort(compareTuples)
}

export function decodeWeapons(rows: readonly KeyRef[][]): GoodWeapon[] {
  return rows.map((row) => ({
    key: fromRef(WEAPONS, row[0]!),
    level: n(row[1], 1),
    ascension: n(row[2], 0),
    refinement: n(row[3], 1),
    location: fromRef(CHARACTERS, row[4] ?? 0),
    lock: row[5] === 1,
  }))
}

// ------------------------------------------------------------ bases & deltas
// Materials, artifacts and achievement times change a little on most
// snapshots, so a snapshot usually stores only how its section differs from a
// full "base" section of the same kind (for materials, the "keyframe"), whose
// hash the delta names in `b`. Deltas always point straight at a full base,
// never at another delta, so decoding needs at most two sections and
// snapshots can be imported in any order. A new snapshot is a delta against
// the base of the account's latest snapshot, so the delta is cumulative: it
// grows with each change until storing a new base is cheaper.
//
// When that is: a base costs B bytes (deflated) once, and each later snapshot
// that changes the section stores a delta of about d0 + g·n bytes after n such
// snapshots (d0 ≈ 60 B, mostly the base's hash). Over a run of N snapshots on
// one base, the cost per snapshot is B/N + d0 + g(N+1)/2, lowest at
// N ≈ √(2B/g), where the delta has grown by √(2gB). So a new base is stored
// once the delta passes √(2gB). With g = 25 B (the materials delta's measured
// growth per snapshot) that is ≈ 590 B for a 7 KB materials keyframe, ≈ 635 B
// for an 8 KB achievement-times base and ≈ 245 B for a 1.2 KB artifacts base.
// The optimum is flat: g off by 2x in either direction costs about 6% more,
// so one g serves all three kinds (achievement times grow slower, artifacts
// faster, and the square root already scales the threshold with B).

/** Bytes a delta grows by per changed snapshot, in the base-or-delta cost model above. */
export const DELTA_GROWTH_BYTES = 25

/** True while storing a `deltaBytes` delta beats storing a new `baseBytes` base. */
export function deltaPaysOff(deltaBytes: number, baseBytes: number): boolean {
  return deltaBytes * deltaBytes <= 2 * DELTA_GROWTH_BYTES * baseBytes
}

// ----------------------------------------------------------------- artifacts
// Artifacts themselves live in the per-account catalog; a snapshot stores one
// entry per artifact it held: catalog id, plus the state it had *then*.
// `i` = delta-encoded sorted catalog ids, `l` = location character, `f` = flags.
// Identical pieces share a catalog id, so an id can have several rows.
//
// A delta (`b` set) lists, for every id whose rows differ from the base's,
// all of that id's rows now; an id with no rows left is listed once with
// flags -1. Decoding replaces the base's rows of each listed id.

export interface ArtifactsSection {
  /** Base this delta applies to; absent when the section is full. */
  b?: string
  i: number[]
  l: KeyRef[]
  f: number[]
}

export interface ArtifactRef {
  id: number
  state: ArtifactState
}

/** One stored artifact entry: [catalog id, location, flags]. */
export type ArtifactRow = [number, KeyRef, number]

const LOCK = 1
const ASTRAL_MARK = 2
/** In an artifacts delta, flags of -1 mean the id has no rows any more. */
const NO_ROWS = -1

export function encodeArtifacts(refs: readonly ArtifactRef[]): ArtifactsSection {
  return sectionOfRows(
    refs.map(
      (r): ArtifactRow => [
        r.id,
        toRef(CHARACTERS, r.state.location),
        (r.state.lock ? LOCK : 0) | (r.state.astralMark ? ASTRAL_MARK : 0),
      ],
    ),
  )
}

/** `full` (a full section) as a delta against the full section `base`. */
export function encodeArtifactsDelta(
  full: ArtifactsSection,
  base: ArtifactsSection,
  baseHash: string,
): ArtifactsSection {
  const now = rowsById(artifactRows(full))
  const before = rowsById(artifactRows(base))
  const rows: ArtifactRow[] = []
  for (const [id, current] of now) {
    if (!sameRows(current, before.get(id))) rows.push(...current)
  }
  for (const id of before.keys()) if (!now.has(id)) rows.push([id, 0, NO_ROWS])
  return { b: baseHash, ...sectionOfRows(rows) }
}

/**
 * Every entry of a section, as its full form lists them (sorted). A delta
 * needs the full section it names as `base`.
 */
export function artifactRows(
  section: ArtifactsSection,
  base: ArtifactsSection | null = null,
): ArtifactRow[] {
  const own = deltaDecode(section.i).map(
    (id, index): ArtifactRow => [id, section.l[index] ?? 0, section.f[index] ?? 0],
  )
  if (section.b === undefined) return own
  if (!base || base.b !== undefined) throw new Error(`Artifacts delta needs base ${section.b}`)
  const listed = new Set(own.map((row) => row[0]))
  return [
    ...artifactRows(base).filter((row) => !listed.has(row[0])),
    ...own.filter((row) => row[2] !== NO_ROWS),
  ].sort(compareTuples)
}

export function decodeArtifacts(
  section: ArtifactsSection,
  catalog: ReadonlyMap<number, ArtifactIdentity>,
  base: ArtifactsSection | null = null,
): GoodArtifact[] {
  return artifactRows(section, base).map(([id, location, flags]) => {
    const identity = catalog.get(id)
    if (!identity) throw new Error(`Artifact ${id} is missing from the catalog`)
    return {
      setKey: identity.setKey,
      slotKey: identity.slotKey,
      level: identity.level,
      rarity: identity.rarity,
      mainStatKey: identity.mainStatKey,
      location: fromRef(CHARACTERS, location),
      lock: (flags & LOCK) !== 0,
      substats: identity.substats,
      totalRolls: identity.totalRolls,
      astralMark: (flags & ASTRAL_MARK) !== 0,
      elixerCrafted: identity.elixerCrafted,
      unactivatedSubstats: identity.unactivatedSubstats,
    }
  })
}

function sectionOfRows(rows: ArtifactRow[]): ArtifactsSection {
  rows.sort(compareTuples)
  return {
    i: deltaEncode(rows.map((r) => r[0])),
    l: rows.map((r) => r[1]),
    f: rows.map((r) => r[2]),
  }
}

function rowsById(rows: readonly ArtifactRow[]): Map<number, ArtifactRow[]> {
  const byId = new Map<number, ArtifactRow[]>()
  for (const row of rows) {
    const list = byId.get(row[0])
    if (list) list.push(row)
    else byId.set(row[0], [row])
  }
  return byId
}

/** Both lists are sorted (they come from sorted sections). */
function sameRows(a: readonly ArtifactRow[], b: readonly ArtifactRow[] | undefined): boolean {
  return (
    b !== undefined && a.length === b.length && a.every((row, i) => compareTuples(row, b[i]!) === 0)
  )
}

// ----------------------------------------------------------------- materials
// Materials change a little on almost every snapshot (median 3 of ~1,400), so
// most snapshots store only the difference from a full "keyframe" section,
// named by `b` (see "bases & deltas" above). A count of -1 in a delta means
// the key is absent.

export interface MaterialsSection {
  /** Keyframe this delta applies to; absent when this section is a keyframe. */
  b?: string
  m: [KeyRef, number][]
}

export interface MaterialsKeyframe {
  hash: string
  materials: ReadonlyMap<string, number>
}

const REMOVED = -1

export function encodeMaterialsFull(
  materials: ReadonlyMap<string, number>,
  dictionary: KeyDictionary,
): MaterialsSection {
  return { m: sortEntries([...materials].map(([key, count]) => [toRef(dictionary, key), count])) }
}

/**
 * `materials` as a delta against `keyframe`. Compared by key, not by stored
 * ref: a key the dictionary learned since the keyframe was written is a raw
 * string there and an id here, yet the same material.
 */
export function encodeMaterialsDelta(
  materials: ReadonlyMap<string, number>,
  dictionary: KeyDictionary,
  keyframe: MaterialsKeyframe,
): MaterialsSection {
  const delta: [KeyRef, number][] = []
  for (const [key, count] of materials) {
    if (keyframe.materials.get(key) !== count) delta.push([toRef(dictionary, key), count])
  }
  for (const key of keyframe.materials.keys()) {
    if (!materials.has(key)) delta.push([toRef(dictionary, key), REMOVED])
  }
  return { b: keyframe.hash, m: sortEntries(delta) }
}

export function decodeMaterials(
  section: MaterialsSection,
  dictionary: KeyDictionary,
  keyframe: MaterialsSection | null,
): Map<string, number> {
  if (section.b === undefined) return applyEntries(new Map(), section.m, dictionary)
  if (!keyframe || keyframe.b !== undefined) {
    throw new Error(`Materials delta needs keyframe ${section.b}`)
  }
  return applyEntries(applyEntries(new Map(), keyframe.m, dictionary), section.m, dictionary)
}

function applyEntries(
  materials: Map<string, number>,
  entries: readonly [KeyRef, number][],
  dictionary: KeyDictionary,
): Map<string, number> {
  for (const [ref, count] of entries) {
    const key = fromRef(dictionary, ref)
    if (count === REMOVED) materials.delete(key)
    else materials.set(key, count)
  }
  return materials
}

function sortEntries(entries: [KeyRef, number][]): [KeyRef, number][] {
  return entries.sort((a, b) => compareTuples(a, b))
}

// -------------------------------------------------------------- achievements
// Delta-encoded sorted achievement ids (GOOD's `gi_achievements` is a set).

export function encodeAchievements(ids: readonly number[]): number[] {
  return deltaEncode(ids)
}

export function decodeAchievements(deltas: readonly number[]): number[] {
  return deltaDecode(deltas)
}

// -------------------------------------------------------------------- player
// irminsul's `gi_player`, stored as normalizeGood leaves it: an object of the
// fields that passed their checks, keys in a fixed order (normalize's
// PLAYER_FIELDS) so equal values give equal bytes. A few dozen bytes; a new
// field is a new key.

export function decodePlayer(section: GiPlayer): GiPlayer {
  return { ...section }
}

// ---------------------------------------------------------- achievementTimes
// irminsul's `gi_achievement_times`: `i` = delta-encoded sorted achievement
// ids, `t` = each one's finish time in unix seconds. ~1,800 high-entropy
// times make this the largest section, and a snapshot usually adds one or two,
// so it is stored as a delta against a full base like materials (see "bases &
// deltas" above): a delta lists the ids whose time is new or changed, and a
// time of -1 for an id that is gone.

export interface AchievementTimesSection {
  /** Base this delta applies to; absent when the section is full. */
  b?: string
  i: number[]
  t: number[]
}

export function encodeAchievementTimes(
  times: readonly (readonly [number, number])[],
): AchievementTimesSection {
  const sorted = [...times].sort((a, b) => a[0] - b[0])
  return { i: deltaEncode(sorted.map((t) => t[0])), t: sorted.map((t) => t[1]) }
}

/** `full` (a full section) as a delta against the full section `base`. */
export function encodeAchievementTimesDelta(
  full: AchievementTimesSection,
  base: AchievementTimesSection,
  baseHash: string,
): AchievementTimesSection {
  const now = new Map(decodeAchievementTimes(full))
  const before = new Map(decodeAchievementTimes(base))
  const changed: [number, number][] = []
  for (const [id, at] of now) if (before.get(id) !== at) changed.push([id, at])
  for (const id of before.keys()) if (!now.has(id)) changed.push([id, REMOVED])
  return { b: baseHash, ...encodeAchievementTimes(changed) }
}

/**
 * Achievement id -> unix seconds, ascending by id. A delta needs the full
 * section it names as `base`.
 */
export function decodeAchievementTimes(
  section: AchievementTimesSection,
  base: AchievementTimesSection | null = null,
): [number, number][] {
  const own = deltaDecode(section.i).map((id, index): [number, number] => [
    id,
    section.t[index] ?? 0,
  ])
  if (section.b === undefined) return own
  if (!base || base.b !== undefined) {
    throw new Error(`Achievement times delta needs base ${section.b}`)
  }
  const times = new Map(decodeAchievementTimes(base))
  for (const [id, at] of own) {
    if (at === REMOVED) times.delete(id)
    else times.set(id, at)
  }
  return [...times].sort((a, b) => a[0] - b[0])
}

// ----------------------------------------------------------- characterExtras
// irminsul's `gi_characters`. Row: [character, friendship, obtained at (unix
// seconds)], 0 where unknown, trailing zeros trimmed.

const CHARACTER_EXTRA_DEFAULTS: readonly KeyRef[] = [0, 0, 0]

export function encodeCharacterExtras(extras: ReadonlyMap<string, GiCharacter>): KeyRef[][] {
  return [...extras]
    .map(([key, extra]) =>
      trimDefaults(
        [toRef(CHARACTERS, key), extra.friendship ?? 0, extra.obtainedAt ?? 0],
        CHARACTER_EXTRA_DEFAULTS,
      ),
    )
    .sort(compareTuples)
}

export function decodeCharacterExtras(rows: readonly KeyRef[][]): Map<string, GiCharacter> {
  const extras = new Map<string, GiCharacter>()
  for (const row of rows) {
    const extra: GiCharacter = {}
    const friendship = n(row[1], 0)
    const obtainedAt = n(row[2], 0)
    if (friendship > 0) extra.friendship = friendship
    if (obtainedAt > 0) extra.obtainedAt = obtainedAt
    extras.set(fromRef(CHARACTERS, row[0]!), extra)
  }
  return extras
}
