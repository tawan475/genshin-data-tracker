/**
 * Deleting users: by staff (one, or up to STAFF_BULK_MAX at once) or by
 * themselves (Settings). One statement deletes the rows; every foreign key
 * cascades (accounts, snapshots, sections, catalog, planner, keys, sign-ins,
 * links, roles), as `test/schema.test.ts` checks. The audit rows go in the
 * same batch. Open live sockets are closed afterwards (the hub stays empty).
 */

import { ALL_PERMISSIONS } from '@gdt/shared'
import { revokeLive } from './live'

/**
 * Deletes the users and writes `audit` in the same batch; answers the ids
 * actually deleted.
 */
export async function deleteUsers(
  env: Env,
  users: readonly { id: number; liveSince: number | null }[],
  audit: D1PreparedStatement[],
): Promise<number[]> {
  if (users.length === 0) return []
  const results = await env.DB.batch<{ id: number }>([
    ...audit,
    env.DB.prepare(
      'DELETE FROM users WHERE id IN (SELECT value FROM json_each(?1)) RETURNING id',
    ).bind(JSON.stringify(users.map((user) => user.id))),
  ])
  const deleted = results.at(-1)!.results.map((row) => Number(row.id))
  const gone = new Set(deleted)
  // No version is newer than this: every socket of theirs closes.
  await Promise.all(
    users
      .filter((user) => user.liveSince !== null && gone.has(user.id))
      .map((user) => revokeLive(env, user.id, Number.MAX_SAFE_INTEGER)),
  )
  return deleted
}

/** Whether the user holds an Owner (`*`) role that nobody else holds. */
export async function isLastOwner(d1: D1Database, userId: number): Promise<boolean> {
  const row = await d1
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM user_roles AS ur JOIN roles AS r ON r.id = ur.role_id
                 WHERE ur.user_id = ?1 AND r.built_in = 1 AND r.permissions LIKE ?2) AS owner,
         (SELECT count(DISTINCT ur.user_id) FROM user_roles AS ur JOIN roles AS r ON r.id = ur.role_id
          WHERE r.built_in = 1 AND r.permissions LIKE ?2) AS owners`,
    )
    .bind(userId, `%"${ALL_PERMISSIONS}"%`)
    .first<{ owner: number; owners: number }>()
  return row?.owner === 1 && row.owners <= 1
}
