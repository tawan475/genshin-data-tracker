/**
 * Daily housekeeping, run by the cron trigger in wrangler.jsonc.
 *
 * - Deleted snapshots are kept for TRASH_DAYS (deleting is a soft delete, so a
 *   mistaken bulk delete can still be restored by hand), then purged.
 * - Sections no snapshot references any more (live or in the trash) are
 *   garbage-collected. Sections are shared between snapshots, which is why a
 *   delete cannot free them on the spot.
 *
 * Account counters stay exact through all of this: the triggers from
 * migration 0002 adjust them for every row actually deleted.
 */

export const TRASH_DAYS = 30

export interface MaintenanceResult {
  snapshots: number
  blobs: number
}

export async function runMaintenance(d1: D1Database, now = Date.now()): Promise<MaintenanceResult> {
  const [snapshots, blobs] = await d1.batch([
    d1
      .prepare('DELETE FROM snapshots WHERE deleted_at IS NOT NULL AND deleted_at < ?1')
      .bind(now - TRASH_DAYS * 86_400_000),
    d1.prepare(
      `DELETE FROM blobs WHERE NOT EXISTS (
         SELECT 1 FROM snapshots s WHERE s.account_id = blobs.account_id AND blobs.hash IN (
           s.characters_hash, s.weapons_hash, s.artifacts_hash, s.materials_hash,
           s.materials_keyframe_hash, s.achievements_hash)
       )`,
    ),
  ])
  return {
    snapshots: snapshots!.meta.changes,
    blobs: blobs!.meta.changes,
  }
}
