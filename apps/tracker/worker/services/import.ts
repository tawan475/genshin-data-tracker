/**
 * The import pipeline: one GOOD file in, one snapshot (or nothing) out.
 *
 * Round trips to D1, typical case:
 *   1. batch: latest snapshot, same-capture-time snapshot, catalog ids
 *   2. batch: insert new artifacts + read their ids      (only if any are new)
 *   3. batch: materials keyframe + which sections exist  (only if storing)
 *   4. batch: new sections, the snapshot row, account recompute (atomic)
 * An unchanged re-upload stops after step 1 plus one small update.
 */

import {
  GoodFormatError,
  calculateCV,
  calculateRV,
  decodeMaterials,
  deflateRaw,
  encodeSnapshot,
  inflateRaw,
  prepareSnapshot,
  resolveImportTimestamp,
  withMaterialsKeyframe,
  type ArtifactIdentity,
  type ImportResponse,
  type MaterialsKeyframe,
  type MaterialsSection,
  type PreparedSnapshot,
  type Section,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { ApiError, isUniqueViolation } from '../lib/http'
import { recomputeAccount } from './accounts'

export interface Upload {
  text: string
  rawSize: number
  /** The uploader's explicit capture time, if it sent one. */
  timestamp: unknown
}

interface LatestRow {
  id: number
  taken_at: number
  content_hash: string
  materials_keyframe_hash: string
}

/** Artifacts per INSERT statement; keeps each bound JSON parameter well under D1's limits. */
const ARTIFACT_INSERT_CHUNK = 400

export async function importSnapshot(
  d1: D1Database,
  accountId: number,
  upload: Upload,
): Promise<ImportResponse> {
  const prepared = await parseUpload(upload.text)
  const takenAt = resolveImportTimestamp(upload.timestamp, prepared.good.timestamp)

  // Catalog entry for each distinct artifact identity in this upload.
  const identities = new Map<string, ArtifactIdentity>()
  prepared.artifactHashes.forEach((hash, i) => {
    if (!identities.has(hash)) identities.set(hash, prepared.good.artifacts[i]!.identity)
  })
  const hashes = [...identities.keys()]

  // 1.
  const [latestResult, sameTimeResult, idsResult] = await d1.batch<Record<string, unknown>>([
    d1
      .prepare(
        `SELECT id, taken_at, content_hash, materials_keyframe_hash FROM snapshots
         WHERE account_id = ?1 AND deleted_at IS NULL ORDER BY taken_at DESC, id DESC LIMIT 1`,
      )
      .bind(accountId),
    d1
      .prepare(
        `SELECT id, content_hash FROM snapshots
         WHERE account_id = ?1 AND taken_at = ?2 AND deleted_at IS NULL`,
      )
      .bind(accountId, takenAt),
    selectArtifactIds(d1, accountId, hashes),
  ])
  const latest = (latestResult!.results[0] as LatestRow | undefined) ?? null
  const sameTime = sameTimeResult!.results[0] as { id: number; content_hash: string } | undefined
  const artifactIds = idMap(idsResult!.results)

  // 2.
  const missing = hashes.filter((hash) => !artifactIds.has(hash))
  if (missing.length > 0) {
    for (const [hash, id] of await insertArtifacts(d1, accountId, missing, identities)) {
      artifactIds.set(hash, id)
    }
  }

  let encoded = await encodeSnapshot(prepared, artifactIds, MATERIALS)
  const response = (status: ImportResponse['status'], snapshotId: number, storedSize = 0) => ({
    status,
    snapshotId,
    takenAt,
    rawSize: upload.rawSize,
    storedSize,
  })

  if (sameTime) {
    // A re-upload of the same capture is a no-op, so uploaders can retry freely.
    if (sameTime.content_hash === encoded.contentHash) return response('unchanged', sameTime.id)
    throw new ApiError(
      409,
      'duplicate_capture',
      'A different snapshot exists for this capture time',
    )
  }

  if (latest && latest.content_hash === encoded.contentHash && takenAt > latest.taken_at) {
    // Same inventory captured again later: remember when it was last seen
    // instead of storing a duplicate snapshot.
    await d1.batch([
      d1
        .prepare('UPDATE snapshots SET last_seen_at = max(last_seen_at, ?1) WHERE id = ?2')
        .bind(takenAt, latest.id),
      d1
        .prepare('UPDATE genshin_accounts SET data_version = data_version + 1 WHERE id = ?1')
        .bind(accountId),
    ])
    return response('unchanged', latest.id)
  }

  // 3.
  const fullSections = sectionsOf(encoded)
  const [keyframeResult, existingResult] = await d1.batch<Record<string, unknown>>([
    d1
      .prepare('SELECT data FROM blobs WHERE account_id = ?1 AND hash = ?2')
      .bind(accountId, latest?.materials_keyframe_hash ?? ''),
    d1
      .prepare(
        `SELECT hash FROM blobs WHERE account_id = ?1
         AND hash IN (SELECT value FROM json_each(?2))`,
      )
      .bind(accountId, JSON.stringify(fullSections.map((s) => s.hash))),
  ])
  const keyframe = await readKeyframe(latest?.materials_keyframe_hash, keyframeResult!.results[0])
  encoded = await withMaterialsKeyframe(encoded, prepared, MATERIALS, keyframe)
  const existing = new Set(existingResult!.results.map((row) => row.hash as string))
  const toStore = sectionsOf(encoded).filter((section) => !existing.has(section.hash))
  const compressed = await Promise.all(toStore.map((section) => deflateRaw(section.json)))
  const storedSize = compressed.reduce((sum, bytes) => sum + bytes.length, 0)

  // 4.
  const materialsKeyframeHash = encoded.materialsIsKeyframe
    ? encoded.materials.hash
    : keyframe!.hash
  const statements = toStore.map((section, i) =>
    d1
      .prepare(
        `INSERT INTO blobs (account_id, hash, kind, data, raw_size) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT DO NOTHING`,
      )
      .bind(accountId, section.hash, section.kind, compressed[i]!, section.json.length),
  )
  statements.push(
    d1
      .prepare(
        `INSERT INTO snapshots (account_id, taken_at, last_seen_at, created_at, format, version, source,
           raw_size, stored_size, content_hash, characters_hash, weapons_hash, artifacts_hash,
           materials_hash, materials_keyframe_hash, achievements_hash, summary)
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         RETURNING id`,
      )
      .bind(
        accountId,
        takenAt,
        Date.now(),
        prepared.good.format,
        prepared.good.version,
        prepared.good.source,
        upload.rawSize,
        storedSize,
        encoded.contentHash,
        encoded.characters.hash,
        encoded.weapons.hash,
        encoded.artifacts.hash,
        encoded.materials.hash,
        materialsKeyframeHash,
        encoded.achievements?.hash ?? null,
        JSON.stringify(prepared.summary),
      ),
    recomputeAccount(d1, accountId),
  )

  let results: D1Result<Record<string, unknown>>[]
  try {
    results = await d1.batch<Record<string, unknown>>(statements)
  } catch (error) {
    // Lost a race with a concurrent upload of the same capture time.
    if (isUniqueViolation(error, 'snapshots')) {
      const [row] = (
        await d1
          .prepare(
            `SELECT id, content_hash FROM snapshots
             WHERE account_id = ?1 AND taken_at = ?2 AND deleted_at IS NULL`,
          )
          .bind(accountId, takenAt)
          .all<{ id: number; content_hash: string }>()
      ).results
      if (row?.content_hash === encoded.contentHash) return response('unchanged', row.id)
      throw new ApiError(
        409,
        'duplicate_capture',
        'A different snapshot exists for this capture time',
      )
    }
    throw error
  }
  const snapshotId = results[toStore.length]!.results[0]!.id as number
  return response('created', snapshotId, storedSize)
}

async function parseUpload(text: string): Promise<PreparedSnapshot> {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new ApiError(400, 'invalid_json', 'The file is not valid JSON')
  }
  try {
    return await prepareSnapshot(input)
  } catch (error) {
    if (error instanceof GoodFormatError) throw new ApiError(400, 'invalid_good', error.message)
    throw error
  }
}

function sectionsOf(encoded: Awaited<ReturnType<typeof encodeSnapshot>>): Section[] {
  const sections = [encoded.characters, encoded.weapons, encoded.artifacts, encoded.materials]
  if (encoded.achievements) sections.push(encoded.achievements)
  return sections
}

function selectArtifactIds(
  d1: D1Database,
  accountId: number,
  hashes: string[],
): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT id, hash FROM artifacts WHERE account_id = ?1
       AND hash IN (SELECT value FROM json_each(?2))`,
    )
    .bind(accountId, JSON.stringify(hashes))
}

function idMap(rows: Record<string, unknown>[]): Map<string, number> {
  return new Map(rows.map((row) => [row.hash as string, row.id as number]))
}

/** Inserts catalog rows (idempotently) and returns the ids of `hashes`. */
async function insertArtifacts(
  d1: D1Database,
  accountId: number,
  hashes: string[],
  identities: ReadonlyMap<string, ArtifactIdentity>,
): Promise<Map<string, number>> {
  const now = Date.now()
  const statements: D1PreparedStatement[] = []
  for (let i = 0; i < hashes.length; i += ARTIFACT_INSERT_CHUNK) {
    const rows = hashes.slice(i, i + ARTIFACT_INSERT_CHUNK).map((hash) => {
      const a = identities.get(hash)!
      return [
        hash,
        a.setKey,
        a.slotKey,
        a.level,
        a.rarity,
        a.mainStatKey,
        a.substats,
        a.unactivatedSubstats,
        a.totalRolls,
        a.elixerCrafted ? 1 : 0,
        calculateCV(a.substats),
        calculateRV(a.substats),
      ]
    })
    statements.push(
      d1
        .prepare(
          `INSERT INTO artifacts (account_id, hash, set_key, slot_key, level, rarity, main_stat_key,
             substats, unactivated_substats, total_rolls, elixer_crafted, cv, rv, created_at)
           SELECT ?1, value->>0, value->>1, value->>2, value->>3, value->>4, value->>5,
             value->6, value->7, value->>8, value->>9, value->>10, value->>11, ?3
           FROM json_each(?2) WHERE true
           ON CONFLICT (account_id, hash) DO NOTHING`,
        )
        .bind(accountId, JSON.stringify(rows), now),
    )
  }
  statements.push(selectArtifactIds(d1, accountId, hashes))
  const results = await d1.batch<Record<string, unknown>>(statements)
  return idMap(results[results.length - 1]!.results)
}

async function readKeyframe(
  hash: string | undefined,
  row: Record<string, unknown> | undefined,
): Promise<MaterialsKeyframe | null> {
  if (!hash || !row) return null
  const data = row.data
  const bytes =
    data instanceof Uint8Array
      ? data
      : Array.isArray(data)
        ? Uint8Array.from(data as number[])
        : new Uint8Array(data as ArrayBuffer)
  const section: MaterialsSection = JSON.parse(await inflateRaw(bytes))
  if (section.b !== undefined) return null
  return { hash, materials: decodeMaterials(section, MATERIALS, null) }
}
