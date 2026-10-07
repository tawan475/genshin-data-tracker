import { hashArtifactIdentity, type ArtifactIdentity } from '../artifact'
import type { KeyDictionary } from '../dictionary'
import type { Good } from '../good'
import { sha256Hex128 } from '../hash'
import { deflateRaw } from './compress'
import { normalizeGood, type NormalizedGood, type NormalizeOptions } from './normalize'
import {
  decodeAchievements,
  decodeAchievementTimes,
  decodeArtifacts,
  decodeCharacterExtras,
  decodeCharacters,
  decodeMaterials,
  decodePlayer,
  decodeWeapons,
  deltaPaysOff,
  encodeAchievements,
  encodeAchievementTimes,
  encodeAchievementTimesDelta,
  encodeArtifacts,
  encodeArtifactsDelta,
  encodeCharacterExtras,
  encodeCharacters,
  encodeMaterialsDelta,
  encodeMaterialsFull,
  encodeWeapons,
  makeSection,
  type AchievementTimesSection,
  type ArtifactsSection,
  type MaterialsSection,
  type Section,
} from './sections'

/**
 * Small per-snapshot figures computed once at import, so the dashboard and
 * analysis views never have to open a snapshot's sections. Stored in the
 * row's `meta` (snapshot-meta.ts; v1 rows: JSON): a new field means a new
 * meta format byte there (older rows just lack the field).
 */
export interface SnapshotSummary {
  characters: number
  weapons: number
  artifacts: number
  materials: number
  mora: number
  primogem: number
  /**
   * Unlocked, unequipped 3★ / 4★ artifacts as of this snapshot (named this way
   * since migration 0008, which renamed the keys in stored rows).
   */
  artifact3: number
  artifact4: number
}

export interface PreparedSnapshot {
  good: NormalizedGood
  /** Catalog hash of each `good.artifacts` entry, in the same order. */
  artifactHashes: string[]
  summary: SnapshotSummary
}

/**
 * Step 1 of an import: validate and hash. Needs no database. The server
 * passes the material dictionary (`options.materials`), so a known material
 * key is never refused for its length.
 */
export async function prepareSnapshot(
  input: unknown,
  options: NormalizeOptions = {},
): Promise<PreparedSnapshot> {
  const good = normalizeGood(input, options)
  const artifactHashes = await Promise.all(
    good.artifacts.map((a) => hashArtifactIdentity(a.identity)),
  )
  return { good, artifactHashes, summary: summarize(good) }
}

function summarize(good: NormalizedGood): SnapshotSummary {
  let artifact3 = 0
  let artifact4 = 0
  for (const { identity, state } of good.artifacts) {
    if (state.lock || state.location !== '') continue
    if (identity.rarity === 3) artifact3++
    else if (identity.rarity === 4) artifact4++
  }
  return {
    characters: good.characters.length,
    weapons: good.weapons.length,
    artifacts: good.artifacts.length,
    materials: good.materials.size,
    mora: good.materials.get('Mora') ?? 0,
    primogem: good.materials.get('Primogem') ?? 0,
    artifact3,
    artifact4,
  }
}

/** irminsul's own top-level keys, one optional section each. */
export interface ExtraSections {
  player: Section | null
  achievementTimes: Section | null
  characterExtras: Section | null
}

export interface EncodedSnapshot extends ExtraSections {
  characters: Section
  weapons: Section
  artifacts: Section
  materials: Section
  achievements: Section | null
  /**
   * For each section that can be stored as a delta (see `withBases`): the
   * full section it is a delta of, or null when it is stored in full.
   */
  materialsBase: string | null
  artifactsBase: string | null
  achievementTimesBase: string | null
  /**
   * Identity of the whole inventory. Built from the *full* form of every
   * section, so whether a section was stored in full or as a delta never
   * changes it. A file without irminsul's extra keys hashes exactly as it did
   * before they were stored.
   */
  contentHash: string
  /**
   * The content hash with the extra sections left out (equal to `contentHash`
   * when there are none): what a snapshot of this same capture has if it was
   * stored before the extras were kept, so re-uploading it stays a no-op.
   */
  legacyContentHash: string
}

/** The sections that do not depend on catalog ids, materials in full. */
export interface StaticSections extends ExtraSections {
  characters: Section
  weapons: Section
  materials: Section
  achievements: Section | null
}

/** The extra sections that are present, in a fixed order. */
export function extraSectionsOf(sections: ExtraSections): Section[] {
  return [sections.player, sections.achievementTimes, sections.characterExtras].filter(
    (s): s is Section => s !== null,
  )
}

/**
 * Step 2a: everything that needs no catalog ids. A server can compute these
 * hashes before its first query and ask which sections already exist in the
 * same round trip as the catalog lookup.
 */
export async function encodeStaticSections(
  prepared: PreparedSnapshot,
  materialsDictionary: KeyDictionary,
): Promise<StaticSections> {
  const { good } = prepared
  const [characters, weapons, materials, achievements, player, achievementTimes, characterExtras] =
    await Promise.all([
      makeSection('characters', encodeCharacters(good.characters)),
      makeSection('weapons', encodeWeapons(good.weapons)),
      makeSection('materials', encodeMaterialsFull(good.materials, materialsDictionary)),
      good.achievements ? makeSection('achievements', encodeAchievements(good.achievements)) : null,
      good.player ? makeSection('player', good.player) : null,
      good.achievementTimes
        ? makeSection('achievementTimes', encodeAchievementTimes(good.achievementTimes))
        : null,
      good.characterExtras
        ? makeSection('characterExtras', encodeCharacterExtras(good.characterExtras))
        : null,
    ])
  return {
    characters,
    weapons,
    materials,
    achievements,
    player,
    achievementTimes,
    characterExtras,
  }
}

/**
 * Step 2b, once the catalog has assigned ids: the artifacts section and the
 * content hash. Every section is still in full; the content hash is final
 * here, so an unchanged inventory is detected before any base is loaded.
 * Call {@link withBases} only when the snapshot will be stored.
 */
export async function completeSnapshot(
  sections: StaticSections,
  prepared: PreparedSnapshot,
  artifactIds: ReadonlyMap<string, number>,
): Promise<EncodedSnapshot> {
  const { good, artifactHashes } = prepared
  const refs = good.artifacts.map((artifact, index) => {
    const hash = artifactHashes[index]!
    const id = artifactIds.get(hash)
    if (id === undefined) throw new Error(`No catalog id for artifact ${hash}`)
    return { id, state: artifact.state }
  })
  const artifacts = await makeSection('artifacts', encodeArtifacts(refs))
  const base = [
    sections.characters.hash,
    sections.weapons.hash,
    artifacts.hash,
    sections.materials.hash,
    sections.achievements?.hash ?? '',
  ]
  const legacyContentHash = await sha256Hex128(base.join(':'))
  // Appended only when present, so a file without them keeps its old hash.
  const extras = [sections.player, sections.achievementTimes, sections.characterExtras]
  const contentHash = extras.some((s) => s !== null)
    ? await sha256Hex128([...base, ...extras.map((s) => s?.hash ?? '')].join(':'))
    : legacyContentHash
  return {
    ...sections,
    artifacts,
    materialsBase: null,
    artifactsBase: null,
    achievementTimesBase: null,
    contentHash,
    legacyContentHash,
  }
}

/** Steps 2a and 2b together. */
export async function encodeSnapshot(
  prepared: PreparedSnapshot,
  artifactIds: ReadonlyMap<string, number>,
  materialsDictionary: KeyDictionary,
): Promise<EncodedSnapshot> {
  return completeSnapshot(
    await encodeStaticSections(prepared, materialsDictionary),
    prepared,
    artifactIds,
  )
}

/** A full section stored earlier, which a new snapshot's section may be a delta of. */
export interface SectionBase {
  hash: string
  /** The section's JSON (inflated). */
  json: string
  /** What it takes in storage: its deflated size in bytes. */
  size: number
}

/** The bases a new snapshot may use: those of the account's latest snapshot. */
export interface SnapshotBases {
  materials: SectionBase | null
  artifacts: SectionBase | null
  achievementTimes: SectionBase | null
}

/**
 * Step 3, only for a snapshot that will be stored: re-expresses materials,
 * artifacts and achievement times as deltas against `bases` where that is
 * cheaper (see "bases & deltas" in sections.ts). A section stays in full when
 * there is no base, when its full form is already stored (`isStored`; then it
 * costs nothing, as when nothing changed since the base), or when its delta
 * has grown past the point where a new base pays off. A delta that is already
 * stored (the latest snapshot's, when the section did not change since) is
 * always used. The content hash is unaffected.
 */
export async function withBases(
  encoded: EncodedSnapshot,
  prepared: PreparedSnapshot,
  materialsDictionary: KeyDictionary,
  bases: SnapshotBases,
  isStored: (hash: string) => boolean = () => false,
): Promise<EncodedSnapshot> {
  const times = encoded.achievementTimes
  const [materials, artifacts, achievementTimes] = await Promise.all([
    rebase(encoded.materials, bases.materials, isStored, (base) => {
      const keyframe = JSON.parse(base.json) as MaterialsSection
      if (keyframe.b !== undefined) return null
      return encodeMaterialsDelta(prepared.good.materials, materialsDictionary, {
        hash: base.hash,
        materials: decodeMaterials(keyframe, materialsDictionary, null),
      })
    }),
    rebase(encoded.artifacts, bases.artifacts, isStored, (base) => {
      const full = JSON.parse(base.json) as ArtifactsSection
      if (full.b !== undefined) return null
      return encodeArtifactsDelta(JSON.parse(encoded.artifacts.json), full, base.hash)
    }),
    times
      ? rebase(times, bases.achievementTimes, isStored, (base) => {
          const full = JSON.parse(base.json) as AchievementTimesSection
          if (full.b !== undefined) return null
          return encodeAchievementTimesDelta(JSON.parse(times.json), full, base.hash)
        })
      : { section: null, base: null },
  ])
  return {
    ...encoded,
    materials: materials.section,
    materialsBase: materials.base,
    artifacts: artifacts.section,
    artifactsBase: artifacts.base,
    achievementTimes: achievementTimes.section,
    achievementTimesBase: achievementTimes.base,
  }
}

/** `full`, or its delta against `base` when that is cheaper. */
async function rebase(
  full: Section,
  base: SectionBase | null,
  isStored: (hash: string) => boolean,
  delta: (base: SectionBase) => object | null,
): Promise<{ section: Section; base: string | null }> {
  const asFull = { section: full, base: null }
  if (!base || full.hash === base.hash || isStored(full.hash)) return asFull
  // A base that is itself a delta cannot be built on (never happens: bases are
  // read from a snapshot's base columns, which only ever name full sections).
  const value = delta(base)
  if (!value) return asFull
  const section = await makeSection(full.kind, value)
  if (isStored(section.hash)) return { section, base: base.hash }
  const size = (await deflateRaw(section.json)).length
  return deltaPaysOff(size, base.size) ? { section, base: base.hash } : asFull
}

/** A snapshot as read back from storage, sections already inflated to JSON text. */
export interface StoredSnapshot {
  format: string
  version: number
  source: string
  takenAt: number
  characters: string
  weapons: string
  artifacts: string
  /** Required when `artifacts` is a delta; absent or null when it is full. */
  artifactsBase?: string | null
  materials: string
  /** Required when `materials` is a delta. */
  materialsKeyframe: string | null
  achievements: string | null
  // irminsul's extra sections; absent or null when the snapshot has none.
  player?: string | null
  achievementTimes?: string | null
  /** Required when `achievementTimes` is a delta; absent or null when it is full. */
  achievementTimesBase?: string | null
  characterExtras?: string | null
}

const parseOrNull = <T>(text: string | null | undefined): T | null =>
  text ? (JSON.parse(text) as T) : null

/** Rebuilds the GOOD file a stored snapshot came from. Runs in the browser. */
export function decodeSnapshot(
  stored: StoredSnapshot,
  catalog: ReadonlyMap<number, ArtifactIdentity>,
  materialsDictionary: KeyDictionary,
): Good {
  const materials = decodeMaterials(
    JSON.parse(stored.materials),
    materialsDictionary,
    stored.materialsKeyframe === null ? null : JSON.parse(stored.materialsKeyframe),
  )
  const good: Good = {
    format: stored.format,
    version: stored.version,
    source: stored.source,
    characters: decodeCharacters(JSON.parse(stored.characters)),
    artifacts: decodeArtifacts(
      JSON.parse(stored.artifacts),
      catalog,
      parseOrNull(stored.artifactsBase),
    ),
    weapons: decodeWeapons(JSON.parse(stored.weapons)),
    materials: Object.fromEntries(materials),
  }
  if (stored.achievements !== null) {
    good.gi_achievements = decodeAchievements(JSON.parse(stored.achievements))
  }
  good.timestamp = stored.takenAt
  // After `timestamp`, where irminsul writes them.
  if (stored.player) good.gi_player = decodePlayer(JSON.parse(stored.player))
  if (stored.achievementTimes) {
    good.gi_achievement_times = Object.fromEntries(
      decodeAchievementTimes(
        JSON.parse(stored.achievementTimes),
        parseOrNull(stored.achievementTimesBase),
      ).map(([id, at]) => [String(id), at]),
    )
  }
  if (stored.characterExtras) {
    good.gi_characters = Object.fromEntries(
      decodeCharacterExtras(JSON.parse(stored.characterExtras)),
    )
  }
  return good
}
