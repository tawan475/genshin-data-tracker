import type { AccountResponse } from '@gdt/shared'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { genshinAccounts, snapshots } from '../db/schema'
import { randomToken, sha256Hex } from '../lib/crypto'
import { notFound } from '../lib/http'

export type AccountRow = typeof genshinAccounts.$inferSelect

/** Loads an account only if `userId` owns it; anything else is a 404. */
export async function loadOwnedAccount(
  db: Db,
  userId: number,
  accountId: number,
): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(genshinAccounts)
    .where(and(eq(genshinAccounts.id, accountId), eq(genshinAccounts.userId, userId)))
    .limit(1)
  if (!account) throw notFound('Account')
  return account
}

/** Accounts with their latest snapshot, in one query. */
export async function listAccounts(
  db: Db,
  userId: number,
  accountId?: number,
): Promise<AccountResponse[]> {
  const rows = await db
    .select({
      account: genshinAccounts,
      latest: {
        id: snapshots.id,
        takenAt: snapshots.takenAt,
        lastSeenAt: snapshots.lastSeenAt,
        summary: snapshots.summary,
      },
    })
    .from(genshinAccounts)
    .leftJoin(snapshots, eq(snapshots.id, genshinAccounts.latestSnapshotId))
    .where(
      accountId === undefined
        ? eq(genshinAccounts.userId, userId)
        : and(eq(genshinAccounts.userId, userId), eq(genshinAccounts.id, accountId)),
    )
    .orderBy(genshinAccounts.id)
  return rows.map(({ account, latest }) => ({
    id: account.id,
    name: account.name,
    uid: account.uid,
    server: account.server,
    createdAt: account.createdAt,
    dataVersion: account.dataVersion,
    snapshotCount: account.snapshotCount,
    rawBytes: account.rawBytes,
    storedBytes: account.storedBytes,
    latest: latest && latest.id !== null ? latest : null,
  }))
}

/**
 * Bumps the account's data version and re-points its latest snapshot. Run in
 * the same batch as any snapshot write. The counters (snapshot_count,
 * raw_bytes, stored_bytes) are kept by triggers (migration 0002), and the
 * latest-snapshot lookup reads one index row.
 */
export function recomputeAccount(d1: D1Database, accountId: number): D1PreparedStatement {
  return d1
    .prepare(
      `UPDATE genshin_accounts SET
         data_version = data_version + 1,
         latest_snapshot_id = (SELECT id FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
                               ORDER BY taken_at DESC, id DESC LIMIT 1)
       WHERE id = ?1`,
    )
    .bind(accountId)
}

const IMPORT_KEY_PREFIX = 'gdt_ik_'

/** A fresh import key and the hash that is stored for it. */
export async function newImportKey(): Promise<{ key: string; hash: string }> {
  const key = IMPORT_KEY_PREFIX + randomToken(32)
  return { key, hash: await sha256Hex(key) }
}

export function hashImportKey(key: string): Promise<string> {
  return sha256Hex(key.trim())
}
