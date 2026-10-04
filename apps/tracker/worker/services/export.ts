/**
 * Reading snapshots back. The bundle path sends stored bytes untouched (the
 * browser decodes); the GOOD path decodes one snapshot server-side for tools
 * that just want a file.
 */

import {
  decodeSnapshot,
  expandSubstats,
  deltaDecode,
  inflateRaw,
  storedSnapshotOf,
  writeBundle,
  type ArtifactIdentity,
  type ArtifactsSection,
  type BundleSnapshot,
  type Good,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { notFound } from '../lib/http'

export const SECTION_NAMES = [
  'characters',
  'weapons',
  'artifacts',
  'materials',
  'achievements',
  'player',
  'achievementTimes',
  'characterExtras',
] as const
export type SectionName = (typeof SECTION_NAMES)[number]

/** Most snapshots one bundle request may cover; sections dedupe, so this is still small. */
export const MAX_BUNDLE_SNAPSHOTS = 5000

interface SnapshotRow {
  id: number
  taken_at: number
  last_seen_at: number
  format: string
  version: number
  source: string
  characters_hash: string
  weapons_hash: string
  artifacts_hash: string
  materials_hash: string
  materials_keyframe_hash: string
  achievements_hash: string | null
  player_hash: string | null
  achievement_times_hash: string | null
  character_extras_hash: string | null
}

const SNAPSHOT_COLUMNS = `id, taken_at, last_seen_at, format, version, source, characters_hash,
  weapons_hash, artifacts_hash, materials_hash, materials_keyframe_hash, achievements_hash,
  player_hash, achievement_times_hash, character_extras_hash`

function toBundleSnapshot(row: SnapshotRow): BundleSnapshot {
  return {
    id: row.id,
    takenAt: row.taken_at,
    lastSeenAt: row.last_seen_at,
    format: row.format,
    version: row.version,
    source: row.source,
    characters: row.characters_hash,
    weapons: row.weapons_hash,
    artifacts: row.artifacts_hash,
    materials: row.materials_hash,
    materialsKeyframe: row.materials_keyframe_hash,
    achievements: row.achievements_hash,
    player: row.player_hash,
    achievementTimes: row.achievement_times_hash,
    characterExtras: row.character_extras_hash,
  }
}

function blobHashes(row: SnapshotRow, sections: ReadonlySet<SectionName>): string[] {
  const hashes: string[] = []
  if (sections.has('characters')) hashes.push(row.characters_hash)
  if (sections.has('weapons')) hashes.push(row.weapons_hash)
  if (sections.has('artifacts')) hashes.push(row.artifacts_hash)
  if (sections.has('materials')) hashes.push(row.materials_hash, row.materials_keyframe_hash)
  if (sections.has('achievements') && row.achievements_hash) hashes.push(row.achievements_hash)
  if (sections.has('player') && row.player_hash) hashes.push(row.player_hash)
  if (sections.has('achievementTimes') && row.achievement_times_hash) {
    hashes.push(row.achievement_times_hash)
  }
  if (sections.has('characterExtras') && row.character_extras_hash) {
    hashes.push(row.character_extras_hash)
  }
  return hashes
}

async function loadBlobs(d1: D1Database, accountId: number, hashes: string[]) {
  const { results } = await d1
    .prepare(
      `SELECT hash, data FROM blobs WHERE account_id = ?1
       AND hash IN (SELECT value FROM json_each(?2))`,
    )
    .bind(accountId, JSON.stringify(hashes))
    .all<{ hash: string; data: ArrayBuffer | Uint8Array | number[] }>()
  return new Map(results.map((row) => [row.hash, toBytes(row.data)]))
}

function toBytes(data: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (Array.isArray(data)) return Uint8Array.from(data)
  return new Uint8Array(data)
}

/** Live snapshots (all, or `ids`) and the requested sections, as a GDT1 bundle. */
export async function buildBundle(
  d1: D1Database,
  accountId: number,
  ids: number[] | null,
  sections: ReadonlySet<SectionName>,
): Promise<Uint8Array<ArrayBuffer>> {
  const { results: rows } = await d1
    .prepare(
      `SELECT ${SNAPSHOT_COLUMNS} FROM snapshots
       WHERE account_id = ?1 AND deleted_at IS NULL
       AND (?2 IS NULL OR id IN (SELECT value FROM json_each(?2)))
       ORDER BY taken_at, id LIMIT ?3`,
    )
    .bind(accountId, ids ? JSON.stringify(ids) : null, MAX_BUNDLE_SNAPSHOTS)
    .all<SnapshotRow>()

  const hashes = [...new Set(rows.flatMap((row) => blobHashes(row, sections)))]
  const blobs = hashes.length > 0 ? await loadBlobs(d1, accountId, hashes) : new Map()
  return writeBundle(
    { snapshots: rows.map(toBundleSnapshot), blobs: hashes.filter((hash) => blobs.has(hash)) },
    blobs,
  )
}

/** One live snapshot (or the latest) rebuilt as a GOOD file. */
export async function buildGood(
  d1: D1Database,
  accountId: number,
  snapshotId: number | 'latest',
): Promise<{ good: Good; takenAt: number }> {
  const row = await d1
    .prepare(
      `SELECT ${SNAPSHOT_COLUMNS} FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
       AND (?2 IS NULL OR id = ?2) ORDER BY taken_at DESC, id DESC LIMIT 1`,
    )
    .bind(accountId, snapshotId === 'latest' ? null : snapshotId)
    .first<SnapshotRow>()
  if (!row) throw notFound('Snapshot')

  const hashes = blobHashes(row, new Set(SECTION_NAMES))
  const blobs = await loadBlobs(d1, accountId, hashes)
  const texts = new Map(
    await Promise.all(
      [...new Set(hashes)].map(async (hash) => {
        const data = blobs.get(hash)
        if (!data) throw new Error(`Snapshot ${row.id} is missing section ${hash}`)
        return [hash, await inflateRaw(data)] as const
      }),
    ),
  )
  const stored = storedSnapshotOf(toBundleSnapshot(row), (hash) => texts.get(hash)!)

  const artifactIds = [
    ...new Set(deltaDecode((JSON.parse(stored.artifacts) as ArtifactsSection).i)),
  ]
  const catalog = await loadCatalogEntries(d1, accountId, artifactIds)

  return { good: decodeSnapshot(stored, catalog, MATERIALS), takenAt: row.taken_at }
}

async function loadCatalogEntries(
  d1: D1Database,
  accountId: number,
  ids: number[],
): Promise<Map<number, ArtifactIdentity>> {
  const { results } = await d1
    .prepare(
      `SELECT id, set_key, slot_key, level, rarity, main_stat_key, substats, total_rolls,
         elixer_crafted, unactivated_substats
       FROM artifacts WHERE account_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(accountId, JSON.stringify(ids))
    .all<Record<string, unknown>>()
  return new Map(
    results.map((r) => [
      r.id as number,
      {
        setKey: r.set_key as string,
        slotKey: r.slot_key as string,
        level: r.level as number,
        rarity: r.rarity as number,
        mainStatKey: r.main_stat_key as string,
        substats: expandSubstats(JSON.parse(r.substats as string)),
        totalRolls: r.total_rolls as number,
        elixerCrafted: r.elixer_crafted === 1,
        unactivatedSubstats: expandSubstats(JSON.parse(r.unactivated_substats as string)),
      },
    ]),
  )
}

/**
 * The whole catalog as a JSON array of CatalogRow. Substats are spliced in as
 * the JSON text they are stored as, so the response is built without parsing
 * and re-serialising thousands of arrays.
 */
export async function catalogJson(d1: D1Database, accountId: number): Promise<string> {
  const rows = await d1
    .prepare(
      `SELECT id, set_key, slot_key, level, rarity, main_stat_key, substats, total_rolls,
         elixer_crafted, unactivated_substats
       FROM artifacts WHERE account_id = ?1 ORDER BY id`,
    )
    .bind(accountId)
    .raw<[number, string, string, number, number, string, string, number, number, string]>()
  const parts = rows.map(
    (r) =>
      `[${r[0]},${JSON.stringify(r[1])},${JSON.stringify(r[2])},${r[3]},${r[4]},${JSON.stringify(r[5])},` +
      `${r[6]},${r[7]},${r[8]},${r[9]}]`,
  )
  return `[${parts.join(',')}]`
}

/** Gives a GOOD download a stable, sortable file name. */
export function goodFileName(takenAt: number): string {
  return `GDT_export-${new Date(takenAt)
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '')}.json`
}
