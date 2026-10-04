import { hashArtifactIdentity, type ArtifactIdentity } from '../artifact'
import type { KeyDictionary } from '../dictionary'
import type { Good } from '../good'
import { sha256Hex128 } from '../hash'
import { normalizeGood, type NormalizedGood } from './normalize'
import {
  decodeAchievements,
  decodeAchievementTimes,
  decodeArtifacts,
  decodeCharacterExtras,
  decodeCharacters,
  decodeMaterials,
  decodePlayer,
  decodeWeapons,
  encodeAchievements,
  encodeAchievementTimes,
  encodeArtifacts,
  encodeCharacterExtras,
  encodeCharacters,
  encodeMaterials,
  encodeMaterialsFull,
  encodeWeapons,
  makeSection,
  type MaterialsKeyframe,
  type Section,
} from './sections'

/**
 * Small per-snapshot figures computed once at import, so the dashboard and
 * analysis views never have to open a snapshot's sections. Stored as JSON:
 * new fields can be added without a migration (older rows just lack them).
 */
export interface SnapshotSummary {
  characters: number
  weapons: number
  artifacts: number
  materials: number
  mora: number
  primogem: number
  /** Unlocked, unequipped 3★ / 4★ artifacts as of this snapshot. */
  fodder3: number
  fodder4: number
}

export interface PreparedSnapshot {
  good: NormalizedGood
  /** Catalog hash of each `good.artifacts` entry, in the same order. */
  artifactHashes: string[]
  summary: SnapshotSummary
}

/** Step 1 of an import: validate and hash. Needs no database. */
export async function prepareSnapshot(input: unknown): Promise<PreparedSnapshot> {
  const good = normalizeGood(input)
  const artifactHashes = await Promise.all(
    good.artifacts.map((a) => hashArtifactIdentity(a.identity)),
  )
  return { good, artifactHashes, summary: summarize(good) }
}

function summarize(good: NormalizedGood): SnapshotSummary {
  let fodder3 = 0
  let fodder4 = 0
  for (const { identity, state } of good.artifacts) {
    if (state.lock || state.location !== '') continue
    if (identity.rarity === 3) fodder3++
    else if (identity.rarity === 4) fodder4++
  }
  return {
    characters: good.characters.length,
    weapons: good.weapons.length,
    artifacts: good.artifacts.length,
    materials: good.materials.size,
    mora: good.materials.get('Mora') ?? 0,
    primogem: good.materials.get('Primogem') ?? 0,
    fodder3,
    fodder4,
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
  /** True when `materials` is a full keyframe rather than a delta. */
  materialsIsKeyframe: boolean
  /**
   * Identity of the whole inventory. Built from the *full* materials form, so
   * whether materials were stored as a keyframe or a delta never changes it.
   * A file without irminsul's extra keys hashes exactly as it did before they
   * were stored.
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
 * content hash. Materials are still a full keyframe; the content hash is final
 * here, so an unchanged inventory is detected before any keyframe is loaded.
 * Call {@link withMaterialsKeyframe} only when the snapshot will be stored.
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
  return { ...sections, artifacts, materialsIsKeyframe: true, contentHash, legacyContentHash }
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

/**
 * Re-expresses materials as a delta against `keyframe` (the keyframe the
 * account's latest snapshot uses) when the delta is small enough; otherwise
 * the snapshot keeps its own full keyframe. The content hash is unaffected.
 */
export async function withMaterialsKeyframe(
  encoded: EncodedSnapshot,
  prepared: PreparedSnapshot,
  materialsDictionary: KeyDictionary,
  keyframe: MaterialsKeyframe | null,
): Promise<EncodedSnapshot> {
  if (!keyframe) return encoded
  const stored = encodeMaterials(prepared.good.materials, materialsDictionary, keyframe)
  if (stored.b === undefined) return encoded
  return {
    ...encoded,
    materials: await makeSection('materials', stored),
    materialsIsKeyframe: false,
  }
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
  materials: string
  /** Required when `materials` is a delta. */
  materialsKeyframe: string | null
  achievements: string | null
  // irminsul's extra sections; absent or null when the snapshot has none.
  player?: string | null
  achievementTimes?: string | null
  characterExtras?: string | null
}

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
    artifacts: decodeArtifacts(JSON.parse(stored.artifacts), catalog),
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
      decodeAchievementTimes(JSON.parse(stored.achievementTimes)).map(([id, at]) => [
        String(id),
        at,
      ]),
    )
  }
  if (stored.characterExtras) {
    good.gi_characters = Object.fromEntries(
      decodeCharacterExtras(JSON.parse(stored.characterExtras)),
    )
  }
  return good
}
