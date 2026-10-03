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
import type { GoodArtifact, GoodCharacter, GoodWeapon } from '../good'
import { sha256Hex128 } from '../hash'
import { compareTuples, deltaDecode, deltaEncode, trimDefaults } from './order'

export type SectionKind = 'characters' | 'weapons' | 'artifacts' | 'materials' | 'achievements'

export interface Section {
  kind: SectionKind
  /** Content address: 128-bit SHA-256 of `kind:json`. */
  hash: string
  json: string
}

export function makeSection(kind: SectionKind, value: unknown): Section {
  const json = JSON.stringify(value)
  return { kind, json, hash: sha256Hex128(`${kind}:${json}`) }
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

// ----------------------------------------------------------------- artifacts
// Artifacts themselves live in the per-account catalog; a snapshot stores one
// entry per artifact it held: catalog id, plus the state it had *then*.
// `i` = delta-encoded sorted catalog ids, `l` = location character, `f` = flags.

export interface ArtifactsSection {
  i: number[]
  l: KeyRef[]
  f: number[]
}

export interface ArtifactRef {
  id: number
  state: ArtifactState
}

const LOCK = 1
const ASTRAL_MARK = 2

export function encodeArtifacts(refs: readonly ArtifactRef[]): ArtifactsSection {
  const rows = refs
    .map((r): [number, KeyRef, number] => [
      r.id,
      toRef(CHARACTERS, r.state.location),
      (r.state.lock ? LOCK : 0) | (r.state.astralMark ? ASTRAL_MARK : 0),
    ])
    .sort(compareTuples)
  return {
    i: deltaEncode(rows.map((r) => r[0])),
    l: rows.map((r) => r[1]),
    f: rows.map((r) => r[2]),
  }
}

export function decodeArtifacts(
  section: ArtifactsSection,
  catalog: ReadonlyMap<number, ArtifactIdentity>,
): GoodArtifact[] {
  return deltaDecode(section.i).map((id, index) => {
    const identity = catalog.get(id)
    if (!identity) throw new Error(`Artifact ${id} is missing from the catalog`)
    const flags = section.f[index] ?? 0
    return {
      setKey: identity.setKey,
      slotKey: identity.slotKey,
      level: identity.level,
      rarity: identity.rarity,
      mainStatKey: identity.mainStatKey,
      location: fromRef(CHARACTERS, section.l[index] ?? 0),
      lock: (flags & LOCK) !== 0,
      substats: identity.substats,
      totalRolls: identity.totalRolls,
      astralMark: (flags & ASTRAL_MARK) !== 0,
      elixerCrafted: identity.elixerCrafted,
      unactivatedSubstats: identity.unactivatedSubstats,
    }
  })
}

// ----------------------------------------------------------------- materials
// Materials change a little on almost every snapshot (median 3 of ~1,400), so
// most snapshots store only the difference from a full "keyframe" section,
// named by `b`. Deltas always point straight at a keyframe, never at another
// delta, so decoding needs at most two sections and snapshots can be imported
// in any order. A count of -1 in a delta means the key is absent.

export interface MaterialsSection {
  /** Keyframe this delta applies to; absent when this section is a keyframe. */
  b?: string
  m: [KeyRef, number][]
}

export interface MaterialsKeyframe {
  hash: string
  materials: ReadonlyMap<string, number>
}

/** Above this many changed entries a new keyframe is cheaper than the delta. */
export const MATERIALS_MAX_DELTA = 200

const REMOVED = -1

export function encodeMaterialsFull(
  materials: ReadonlyMap<string, number>,
  dictionary: KeyDictionary,
): MaterialsSection {
  return { m: sortEntries([...materials].map(([key, count]) => [toRef(dictionary, key), count])) }
}

export function encodeMaterials(
  materials: ReadonlyMap<string, number>,
  dictionary: KeyDictionary,
  keyframe: MaterialsKeyframe | null,
): MaterialsSection {
  if (keyframe) {
    const delta: [KeyRef, number][] = []
    for (const [key, count] of materials) {
      if (keyframe.materials.get(key) !== count) delta.push([toRef(dictionary, key), count])
    }
    for (const key of keyframe.materials.keys()) {
      if (!materials.has(key)) delta.push([toRef(dictionary, key), REMOVED])
    }
    if (delta.length <= MATERIALS_MAX_DELTA) return { b: keyframe.hash, m: sortEntries(delta) }
  }
  return encodeMaterialsFull(materials, dictionary)
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
