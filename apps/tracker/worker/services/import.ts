/**
 * The import pipeline: one GOOD file in, one snapshot (or nothing) out.
 *
 * D1 round trips, typical case (the Worker runs at the edge, D1 in APAC, so
 * each round trip is tens of milliseconds and dominates an import):
 *   1. one batch: latest snapshot, same-capture-time snapshot, catalog ids for
 *      the upload's artifacts, the latest materials keyframe, and which of the
 *      id-independent sections already exist
 *   2. only if some artifacts are new: insert them and read their ids
 *   3. one batch: new sections, the snapshot row, account update (atomic)
 * An unchanged re-upload stops after 1 (plus a one-row update when it is a
 * later capture of the same inventory).
 *
 * Lookups by hash are driven from json_each with CROSS JOIN, which makes
 * SQLite probe the unique index once per hash instead of scanning the
 * account's whole catalog: D1 bills, and waits on, every row read.
 */

import {
  GoodFormatError,
  compactSubstats,
  completeSnapshot,
  decodeMaterials,
  deflateRaw,
  encodeStaticSections,
  extraSectionsOf,
  inflateRaw,
  prepareSnapshot,
  resolveImportTimestamp,
  withMaterialsKeyframe,
  type ArtifactIdentity,
  type EncodedSnapshot,
  type ImportResponse,
  type ImportWarning,
  type MaterialsKeyframe,
  type MaterialsSection,
  type PreparedSnapshot,
  type Section,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { ApiError, isUniqueViolation } from '../lib/http'
import { D1Meter } from '../lib/meter'
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
  artifacts_hash: string
  materials_keyframe_hash: string
}

/** Artifacts per INSERT statement; keeps each bound JSON parameter well under D1's limits. */
const ARTIFACT_INSERT_CHUNK = 400

const LATEST_SQL = `SELECT id, taken_at, content_hash, artifacts_hash, materials_keyframe_hash
  FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
  ORDER BY taken_at DESC, id DESC LIMIT 1`

/** The account an upload goes to: its id and the UID it was given (if any). */
export interface ImportTarget {
  id: number
  uid: string | null
}

/**
 * Stores `upload` in `account`. `parsed` is the upload already parsed by
 * `parseUpload`, for a caller that had to read it first (a user key routes by
 * the file's UID).
 */
export async function importSnapshot(
  d1: D1Database,
  account: ImportTarget,
  upload: Upload,
  meter = new D1Meter(),
  parsed?: PreparedSnapshot,
): Promise<ImportResponse> {
  const accountId = account.id
  const prepared = parsed ?? (await parseUpload(upload.text))
  const takenAt = resolveImportTimestamp(upload.timestamp, prepared.good.timestamp)
  const sections = await encodeStaticSections(prepared, MATERIALS)
  const warnings = uidWarnings(account, prepared)

  // Catalog entry for each distinct artifact identity in this upload.
  const identities = new Map<string, ArtifactIdentity>()
  prepared.artifactHashes.forEach((hash, i) => {
    if (!identities.has(hash)) identities.set(hash, prepared.good.artifacts[i]!.identity)
  })
  const hashes = [...identities.keys()]
  const staticHashes = [
    sections.characters,
    sections.weapons,
    sections.materials,
    sections.achievements,
    ...extraSectionsOf(sections),
  ]
    .filter((s): s is Section => s !== null)
    .map((s) => s.hash)

  // 1.
  const [latestResult, sameTimeResult, idsResult, keyframeResult, existingResult] =
    await meter.batch(d1, 'lookup', [
      d1.prepare(LATEST_SQL).bind(accountId),
      d1
        .prepare(
          `SELECT id, content_hash FROM snapshots
           WHERE account_id = ?1 AND taken_at = ?2 AND deleted_at IS NULL`,
        )
        .bind(accountId, takenAt),
      selectArtifactIds(d1, accountId, hashes),
      d1
        .prepare(
          `SELECT hash, data FROM blobs WHERE account_id = ?1 AND hash = (
             SELECT materials_keyframe_hash FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
             ORDER BY taken_at DESC, id DESC LIMIT 1)`,
        )
        .bind(accountId),
      d1
        .prepare(
          `SELECT b.hash FROM json_each(?2) AS j
           CROSS JOIN blobs AS b ON b.account_id = ?1 AND b.hash = j.value`,
        )
        .bind(accountId, JSON.stringify(staticHashes)),
    ])
  const latest = (latestResult!.results[0] as LatestRow | undefined) ?? null
  const sameTime = sameTimeResult!.results[0] as { id: number; content_hash: string } | undefined
  const artifactIds = idMap(idsResult!.results)
  const existing = new Set(existingResult!.results.map((row) => row.hash as string))

  // 2.
  const missing = hashes.filter((hash) => !artifactIds.has(hash))
  if (missing.length > 0) {
    for (const [hash, id] of await insertArtifacts(d1, meter, accountId, missing, identities)) {
      artifactIds.set(hash, id)
    }
  }

  let encoded = await completeSnapshot(sections, prepared, artifactIds)
  const response = (
    status: ImportResponse['status'],
    snapshotId: number,
    storedSize = 0,
  ): ImportResponse => ({
    status,
    snapshotId,
    takenAt,
    rawSize: upload.rawSize,
    storedSize,
    ...(warnings.length > 0 ? { warnings } : {}),
  })
  // The same capture, also when it was stored before irminsul's extra keys
  // were kept (its hash then left them out).
  const sameCapture = (hash: string) =>
    hash === encoded.contentHash || hash === encoded.legacyContentHash

  if (sameTime) {
    // A re-upload of the same capture is a no-op, so uploaders can retry freely.
    if (sameCapture(sameTime.content_hash)) return response('unchanged', sameTime.id)
    throw new ApiError(
      409,
      'duplicate_capture',
      'A different snapshot exists for this capture time',
    )
  }

  if (latest && latest.content_hash === encoded.contentHash && takenAt > latest.taken_at) {
    // Same inventory captured again later: remember when it was last seen
    // instead of storing a duplicate snapshot.
    await meter.batch(d1, 'seen', [
      d1
        .prepare('UPDATE snapshots SET last_seen_at = max(last_seen_at, ?1) WHERE id = ?2')
        .bind(takenAt, latest.id),
      d1
        .prepare('UPDATE genshin_accounts SET data_version = data_version + 1 WHERE id = ?1')
        .bind(accountId),
    ])
    return response('unchanged', latest.id)
  }

  const keyframe = await readKeyframe(keyframeResult!.results[0])
  encoded = await withMaterialsKeyframe(encoded, prepared, MATERIALS, keyframe)

  // Sections already stored cost nothing. The artifacts section usually
  // matches the latest snapshot's; a materials delta is almost always new.
  const toStore = sectionsOf(encoded).filter(
    (s) => !existing.has(s.hash) && s.hash !== latest?.artifacts_hash,
  )
  const compressed = await Promise.all(toStore.map((section) => deflateRaw(section.json)))
  const storedSize = compressed.reduce((sum, bytes) => sum + bytes.length, 0)

  // 3.
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
           materials_hash, materials_keyframe_hash, achievements_hash, summary, player_hash,
           achievement_times_hash, character_extras_hash)
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
           ?18, ?19)
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
        encoded.player?.hash ?? null,
        encoded.achievementTimes?.hash ?? null,
        encoded.characterExtras?.hash ?? null,
      ),
    recomputeAccount(d1, accountId),
  )

  let results: D1Result<Record<string, unknown>>[]
  try {
    results = await meter.batch(d1, 'store', statements)
  } catch (error) {
    // Lost a race with a concurrent upload of the same capture time.
    if (isUniqueViolation(error, 'snapshots')) {
      const row = await d1
        .prepare(
          `SELECT id, content_hash FROM snapshots
           WHERE account_id = ?1 AND taken_at = ?2 AND deleted_at IS NULL`,
        )
        .bind(accountId, takenAt)
        .first<{ id: number; content_hash: string }>()
      if (row && sameCapture(row.content_hash)) return response('unchanged', row.id)
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

/** Parses and normalises a GOOD file; malformed input is a 400. */
export async function parseUpload(text: string): Promise<PreparedSnapshot> {
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

function sectionsOf(encoded: EncodedSnapshot): Section[] {
  const sections = [encoded.characters, encoded.weapons, encoded.artifacts, encoded.materials]
  if (encoded.achievements) sections.push(encoded.achievements)
  return [...sections, ...extraSectionsOf(encoded)]
}

/**
 * A capture whose `gi_player.uid` is not the account's UID is probably another
 * account's inventory. It is stored anyway (the key decides where an upload
 * goes, and irminsul warns its user too); the response and the log say so.
 * An account without a UID has nothing to compare.
 */
function uidWarnings(account: ImportTarget, prepared: PreparedSnapshot): ImportWarning[] {
  const captured = prepared.good.player?.uid
  const linked = account.uid?.trim()
  if (captured === undefined || !linked || linked === String(captured)) return []
  console.warn('uid_mismatch', JSON.stringify({ accountId: account.id, linked, captured }))
  return [
    {
      code: 'uid_mismatch',
      message: `This file is UID ${captured}, but the account is UID ${linked}. Stored anyway.`,
    },
  ]
}

function selectArtifactIds(
  d1: D1Database,
  accountId: number,
  hashes: string[],
): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT a.id, a.hash FROM json_each(?2) AS j
       CROSS JOIN artifacts AS a ON a.account_id = ?1 AND a.hash = j.value`,
    )
    .bind(accountId, JSON.stringify(hashes))
}

function idMap(rows: Record<string, unknown>[]): Map<string, number> {
  return new Map(rows.map((row) => [row.hash as string, row.id as number]))
}

/** Inserts catalog rows (idempotently) and returns the ids of `hashes`. */
async function insertArtifacts(
  d1: D1Database,
  meter: D1Meter,
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
        compactSubstats(a.substats),
        compactSubstats(a.unactivatedSubstats),
        a.totalRolls,
        a.elixerCrafted ? 1 : 0,
      ]
    })
    statements.push(
      d1
        .prepare(
          `INSERT INTO artifacts (account_id, hash, set_key, slot_key, level, rarity, main_stat_key,
             substats, unactivated_substats, total_rolls, elixer_crafted, created_at)
           SELECT ?1, value->>0, value->>1, value->>2, value->>3, value->>4, value->>5,
             value->6, value->7, value->>8, value->>9, ?3
           FROM json_each(?2) WHERE true
           ON CONFLICT (account_id, hash) DO NOTHING`,
        )
        .bind(accountId, JSON.stringify(rows), now),
    )
  }
  statements.push(selectArtifactIds(d1, accountId, hashes))
  const results = await meter.batch(d1, 'catalog', statements)
  return idMap(results[results.length - 1]!.results)
}

async function readKeyframe(
  row: Record<string, unknown> | undefined,
): Promise<MaterialsKeyframe | null> {
  if (!row) return null
  const data = row.data
  const bytes =
    data instanceof Uint8Array
      ? data
      : Array.isArray(data)
        ? Uint8Array.from(data as number[])
        : new Uint8Array(data as ArrayBuffer)
  const section: MaterialsSection = JSON.parse(await inflateRaw(bytes))
  if (section.b !== undefined) return null
  return { hash: row.hash as string, materials: decodeMaterials(section, MATERIALS, null) }
}
