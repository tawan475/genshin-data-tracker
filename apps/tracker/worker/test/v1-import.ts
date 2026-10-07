/**
 * The import as it was before storage v2 (services/import.ts at 9199f61),
 * kept for tests: it writes exactly the v1 rows production holds (snapshot
 * rows by hex hash, deflated JSON in `blobs`, one `artifacts` row per
 * identity), so repack and the readers can be tested on real v1 data.
 */

import {
  compactSubstats,
  completeSnapshot,
  deflateRaw,
  encodeStaticSections,
  extraSectionsOf,
  inflateRaw,
  prepareSnapshot,
  withBases,
  type ArtifactIdentity,
  type EncodedSnapshot,
  type Good,
  type Section,
  type SectionBase,
  type SnapshotBases,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { recomputeAccount } from '../services/accounts'
import { toBytes } from '../services/storage'

const LATEST_SQL = `SELECT id, taken_at, content_hash, artifacts_hash, materials_hash,
    achievement_times_hash
  FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
  ORDER BY taken_at DESC, id DESC LIMIT 1`

const BASES_SQL = `SELECT b.kind, b.hash, b.data FROM (
    SELECT materials_keyframe_hash AS m, coalesce(artifacts_base_hash, artifacts_hash) AS a,
      coalesce(achievement_times_base_hash, achievement_times_hash) AS t
    FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
    ORDER BY taken_at DESC, id DESC LIMIT 1) AS latest
  CROSS JOIN blobs AS b ON b.account_id = ?1 AND b.hash IN (latest.m, latest.a, latest.t)`

/** Stores `good` the v1 way; returns the new snapshot id (null when it changed nothing). */
export async function importV1(
  d1: D1Database,
  accountId: number,
  good: Good,
  takenAt: number,
): Promise<number | null> {
  const text = JSON.stringify(good)
  const prepared = await prepareSnapshot(good)
  const sections = await encodeStaticSections(prepared, MATERIALS)
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

  const [latestResult, sameTimeResult, , basesResult, existingResult] = await d1.batch<
    Record<string, unknown>
  >([
    d1.prepare(LATEST_SQL).bind(accountId),
    d1
      .prepare(
        'SELECT id FROM snapshots WHERE account_id = ?1 AND taken_at = ?2 AND deleted_at IS NULL',
      )
      .bind(accountId, takenAt),
    d1.prepare('SELECT 1'),
    d1.prepare(BASES_SQL).bind(accountId),
    d1
      .prepare(
        `SELECT b.hash FROM json_each(?2) AS j
         CROSS JOIN blobs AS b ON b.account_id = ?1 AND b.hash = j.value`,
      )
      .bind(accountId, JSON.stringify(staticHashes)),
  ])
  if (sameTimeResult!.results.length > 0) return null
  const latest = latestResult!.results[0] as Record<string, string | undefined> | undefined

  // The catalog, as v1 wrote it (insert, then read every id back).
  const rows = hashes.map((hash) => {
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
  const statements: D1PreparedStatement[] = []
  for (let i = 0; i < rows.length; i += 400) {
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
        .bind(accountId, JSON.stringify(rows.slice(i, i + 400)), Date.now()),
    )
  }
  statements.push(
    d1
      .prepare(
        `SELECT a.id, a.hash FROM json_each(?2) AS j
         CROSS JOIN artifacts AS a ON a.account_id = ?1 AND a.hash = j.value`,
      )
      .bind(accountId, JSON.stringify(hashes)),
  )
  const catalog = await d1.batch<Record<string, unknown>>(statements)
  const artifactIds = new Map(
    catalog.at(-1)!.results.map((row) => [row.hash as string, row.id as number]),
  )

  let encoded = await completeSnapshot(sections, prepared, artifactIds)
  const bases: SnapshotBases = { materials: null, artifacts: null, achievementTimes: null }
  for (const row of basesResult!.results) {
    const kind = row.kind as keyof SnapshotBases
    const bytes = toBytes(row.data)
    const base: SectionBase = {
      hash: row.hash as string,
      json: await inflateRaw(bytes),
      size: bytes.length,
    }
    bases[kind] = base
  }
  const stored = new Set(existingResult!.results.map((row) => row.hash as string))
  for (const hash of [
    latest?.artifacts_hash,
    latest?.materials_hash,
    latest?.achievement_times_hash,
  ]) {
    if (hash) stored.add(hash)
  }
  for (const base of Object.values(bases)) if (base) stored.add(base.hash)
  encoded = await withBases(encoded, prepared, MATERIALS, bases, (hash) => stored.has(hash))

  const toStore = sectionsOf(encoded).filter((s) => !stored.has(s.hash))
  const compressed = await Promise.all(toStore.map((section) => deflateRaw(section.json)))
  const storedSize = compressed.reduce((sum, bytes) => sum + bytes.length, 0)
  const writes = toStore.map((section, i) =>
    d1
      .prepare(
        `INSERT INTO blobs (account_id, hash, kind, data, raw_size) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT DO NOTHING`,
      )
      .bind(accountId, section.hash, section.kind, compressed[i]!, section.json.length),
  )
  writes.push(
    d1
      .prepare(
        `INSERT INTO snapshots (account_id, taken_at, last_seen_at, created_at, format, version, source,
           raw_size, stored_size, content_hash, characters_hash, weapons_hash, artifacts_hash,
           materials_hash, materials_keyframe_hash, achievements_hash, summary, player_hash,
           achievement_times_hash, character_extras_hash, artifacts_base_hash,
           achievement_times_base_hash)
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
           ?18, ?19, ?20, ?21)
         RETURNING id`,
      )
      .bind(
        accountId,
        takenAt,
        Date.now(),
        prepared.good.format,
        prepared.good.version,
        prepared.good.source,
        text.length,
        storedSize,
        encoded.contentHash,
        encoded.characters.hash,
        encoded.weapons.hash,
        encoded.artifacts.hash,
        encoded.materials.hash,
        encoded.materialsBase ?? encoded.materials.hash,
        encoded.achievements?.hash ?? null,
        JSON.stringify(prepared.summary),
        encoded.player?.hash ?? null,
        encoded.achievementTimes?.hash ?? null,
        encoded.characterExtras?.hash ?? null,
        encoded.artifactsBase,
        encoded.achievementTimesBase,
      ),
    recomputeAccount(d1, accountId),
  )
  const results = await d1.batch<Record<string, unknown>>(writes)
  return results[toStore.length]!.results[0]!.id as number
}

function sectionsOf(encoded: EncodedSnapshot): Section[] {
  const sections = [encoded.characters, encoded.weapons, encoded.artifacts, encoded.materials]
  if (encoded.achievements) sections.push(encoded.achievements)
  return [...sections, ...extraSectionsOf(encoded)]
}
