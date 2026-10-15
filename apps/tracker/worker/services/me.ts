import type { UserSettingsPatch } from '@gdt/shared'
import type { users } from '../db/schema'
import { permissionsOf, roleFromRow, standingOf, userRolesStatement } from './roles'

type User = typeof users.$inferSelect

/** What MeResponse is made from (routes/auth `toMe`). */
export type MeSource = Pick<
  User,
  'id' | 'username' | 'email' | 'emailVerified' | 'settings' | 'importKeyHash' | 'passwordHash'
>

interface MeRow {
  id: number
  username: string
  email: string | null
  email_verified: number
  settings: string
  import_key_hash: string | null
  password_hash: string
}

/**
 * The signed-in user's row and roles: two statements for one `batch()` (one
 * D1 round trip), read with `meFromResults`.
 */
export function meStatements(
  d1: D1Database,
  userId: number,
): [D1PreparedStatement, D1PreparedStatement] {
  return [
    d1
      .prepare(
        `SELECT id, username, email, email_verified, settings, import_key_hash, password_hash
         FROM users WHERE id = ?1`,
      )
      .bind(userId),
    userRolesStatement(d1, userId),
  ]
}

/** The user (null: gone) and their permission nodes from `meStatements`' results. */
export function meFromResults(
  userId: number,
  user: D1Result | undefined,
  roles: D1Result | undefined,
): { user: MeSource; permissions: string[] } | null {
  const row = user?.results[0] as MeRow | undefined
  if (!row) return null
  const rows = (roles?.results ?? []) as Record<string, unknown>[]
  return {
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      emailVerified: row.email_verified === 1,
      settings: JSON.parse(row.settings) as UserSettingsPatch,
      importKeyHash: row.import_key_hash,
      passwordHash: row.password_hash,
    },
    permissions: permissionsOf(standingOf(userId, rows.map(roleFromRow))),
  }
}
