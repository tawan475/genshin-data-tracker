/**
 * Daily housekeeping, run by the cron trigger in wrangler.jsonc.
 *
 * - Deleted snapshots are kept for TRASH_DAYS (deleting is a soft delete, so a
 *   mistaken bulk delete can still be restored by hand), then purged.
 * - Sections no snapshot references any more (live or in the trash), as a
 *   section or as the base of one, are garbage-collected: v1 blobs by hash,
 *   v2 section blobs by id (one pass over the snapshot rows, no index needed).
 *   Sections are shared between snapshots, which is why a delete cannot free
 *   them on the spot.
 * - One-time links (auth_tokens) are purged a day after they expired; used
 *   ones go then too.
 * - When REPACK_CRON_LIMIT is set (a number), up to that many v1 rows are
 *   converted to storage format v2 (services/repack.ts). Off by default: the
 *   first conversion is started by hand, after a backup.
 *
 * Account counters stay exact through all of this: the triggers from
 * migrations 0002 and 0016 adjust them for every row actually deleted.
 */

import { KEEP_EXPIRED_MS } from './auth-tokens'
import { COLLECT_LEGACY_BLOBS, repack, type RepackResult } from './repack'
import { REFS_SQL, withLegacySchema } from './storage'

export const TRASH_DAYS = 30

export interface MaintenanceResult {
  snapshots: number
  /** v1 and v2 sections collected. */
  blobs: number
  tokens: number
  repack?: RepackResult
}

/**
 * v2 sections no snapshot row names, directly or as the base (or the base's
 * dictionary) of one it names.
 */
export const COLLECT_SECTION_BLOBS = `WITH RECURSIVE live(id) AS (
    SELECT j.value FROM snapshots AS s, json_each(json_array(${REFS_SQL})) AS j
    WHERE j.value IS NOT NULL
    UNION SELECT b.base_id FROM section_blobs AS b JOIN live ON b.id = live.id
      WHERE b.base_id IS NOT NULL)
  DELETE FROM section_blobs WHERE id NOT IN (SELECT id FROM live)`

export async function runMaintenance(
  d1: D1Database,
  now = Date.now(),
  options: { repackLimit?: number } = {},
): Promise<MaintenanceResult> {
  // One batch: a failure (the v1 tables gone, say) leaves nothing half done.
  const [snapshots, sections, tokens, legacy] = await withLegacySchema((withV1) =>
    d1.batch([
      d1
        .prepare('DELETE FROM snapshots WHERE deleted_at IS NOT NULL AND deleted_at < ?1')
        .bind(now - TRASH_DAYS * 86_400_000),
      d1.prepare(COLLECT_SECTION_BLOBS),
      d1.prepare('DELETE FROM auth_tokens WHERE expires_at < ?1').bind(now - KEEP_EXPIRED_MS),
      ...(withV1 ? [d1.prepare(COLLECT_LEGACY_BLOBS)] : []),
    ]),
  )
  const result: MaintenanceResult = {
    snapshots: snapshots!.meta.changes,
    blobs: sections!.meta.changes + (legacy?.meta.changes ?? 0),
    tokens: tokens!.meta.changes,
  }
  if (options.repackLimit && options.repackLimit > 0) {
    result.repack = await repack(d1, { limit: options.repackLimit })
  }
  return result
}
