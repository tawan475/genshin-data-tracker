import { hashArtifactIdentity, type ArtifactIdentity } from '../artifact'
import type { KeyDictionary } from '../dictionary'
import type { Good } from '../good'
import { sha256Hex128 } from '../hash'
import { normalizeGood, type NormalizedGood } from './normalize'
import {
  decodeAchievements,
  decodeArtifacts,
  decodeCharacters,
  decodeMaterials,
  decodeWeapons,
  encodeAchievements,
  encodeArtifacts,
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

export interface EncodedSnapshot {
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
   */
  contentHash: string
}

/**
 * Step 2, once the catalog has assigned ids: build the stored sections.
 * `keyframe` is the materials keyframe the account's latest snapshot uses, if
 * any; the result stores a delta against it when that is small enough.
 */
export async function encodeSnapshot(
  prepared: PreparedSnapshot,
  artifactIds: ReadonlyMap<string, number>,
  materialsDictionary: KeyDictionary,
  keyframe: MaterialsKeyframe | null,
): Promise<EncodedSnapshot> {
  const { good, artifactHashes } = prepared
  const refs = good.artifacts.map((artifact, index) => {
    const hash = artifactHashes[index]!
    const id = artifactIds.get(hash)
    if (id === undefined) throw new Error(`No catalog id for artifact ${hash}`)
    return { id, state: artifact.state }
  })

  const [characters, weapons, artifacts, fullMaterials, achievements] = await Promise.all([
    makeSection('characters', encodeCharacters(good.characters)),
    makeSection('weapons', encodeWeapons(good.weapons)),
    makeSection('artifacts', encodeArtifacts(refs)),
    makeSection('materials', encodeMaterialsFull(good.materials, materialsDictionary)),
    good.achievements ? makeSection('achievements', encodeAchievements(good.achievements)) : null,
  ])

  const stored = encodeMaterials(good.materials, materialsDictionary, keyframe)
  const materialsIsKeyframe = stored.b === undefined
  const materials = materialsIsKeyframe ? fullMaterials : await makeSection('materials', stored)

  const contentHash = await sha256Hex128(
    [
      characters.hash,
      weapons.hash,
      artifacts.hash,
      fullMaterials.hash,
      achievements?.hash ?? '',
    ].join(':'),
  )

  return {
    characters,
    weapons,
    artifacts,
    materials,
    achievements,
    materialsIsKeyframe,
    contentHash,
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
  return good
}
