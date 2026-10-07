import { serverFromUid, type AccountResponse, type GenshinServer } from '@gdt/shared'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { genshinAccounts } from '../db/schema'
import { randomToken, sha256Hex } from '../lib/crypto'
import { ApiError, notFound } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { metaOf, withLegacySchema } from './storage'

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

/**
 * Ownership check that reads one column, for routes that don't need the row
 * (`loadOwnedAccount` selects all of it, settings JSON included).
 */
export async function assertOwnsAccount(db: Db, userId: number, accountId: number): Promise<void> {
  const [row] = await db
    .select({ id: genshinAccounts.id })
    .from(genshinAccounts)
    .where(and(eq(genshinAccounts.id, accountId), eq(genshinAccounts.userId, userId)))
    .limit(1)
  if (!row) throw notFound('Account')
}

interface AccountListRow {
  id: number
  name: string | null
  uid: string | null
  server: GenshinServer | null
  created_at: number
  data_version: number
  snapshot_count: number
  raw_bytes: number
  stored_bytes: number
  latest_id: number | null
  taken_at: number | null
  last_seen_at: number | null
  summary?: string | null
  meta: unknown
}

/**
 * Accounts with their latest snapshot: one round trip, reading each account
 * (by the user index) and its latest snapshot (by primary key). The app also
 * re-reads this list to catch up after missing live events, so it stays this
 * cheap.
 */
export async function listAccounts(
  d1: D1Database,
  userId: number,
  accountId?: number,
  meter = new D1Meter(),
): Promise<AccountResponse[]> {
  const result = await withLegacySchema(async (legacy) => {
    const [rows] = await meter.batch<AccountListRow>(d1, 'accounts', [
      d1
        .prepare(
          `SELECT a.id, a.name, a.uid, a.server, a.created_at, a.data_version, a.snapshot_count,
             a.raw_bytes, a.stored_bytes, s.id AS latest_id, s.taken_at, s.last_seen_at,
             ${legacy ? 's.summary, ' : ''}s.meta
           FROM genshin_accounts AS a LEFT JOIN snapshots AS s ON s.id = a.latest_snapshot_id
           WHERE a.user_id = ?1 AND (?2 IS NULL OR a.id = ?2)
           ORDER BY a.id`,
        )
        .bind(userId, accountId ?? null),
    ])
    return rows
  })
  return result!.results.map((row) => ({
    id: row.id,
    name: row.name,
    uid: row.uid,
    server: row.server,
    createdAt: row.created_at,
    dataVersion: row.data_version,
    snapshotCount: row.snapshot_count,
    rawBytes: row.raw_bytes,
    storedBytes: row.stored_bytes,
    latest:
      row.latest_id === null
        ? null
        : {
            id: row.latest_id,
            takenAt: row.taken_at!,
            lastSeenAt: row.last_seen_at!,
            summary: metaOf(row).summary,
          },
  }))
}

/**
 * Bumps the account's data version and re-points its latest snapshot. Run in
 * the same batch as any snapshot write; it answers with the new version (for
 * the live event). The counters (snapshot_count, raw_bytes, stored_bytes) are
 * kept by triggers (migration 0002), and the latest-snapshot lookup reads one
 * index row.
 */
export function recomputeAccount(d1: D1Database, accountId: number): D1PreparedStatement {
  return d1
    .prepare(
      `UPDATE genshin_accounts SET
         data_version = data_version + 1,
         latest_snapshot_id = (SELECT id FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL
                               ORDER BY taken_at DESC, id DESC LIMIT 1)
       WHERE id = ?1 RETURNING data_version`,
    )
    .bind(accountId)
}

/** The data version a batch's `recomputeAccount` statement answered with. */
export function dataVersionOf(result: D1Result | undefined): number | undefined {
  const value = (result?.results[0] as { data_version?: unknown } | undefined)?.data_version
  return typeof value === 'number' ? value : undefined
}

/** An account's own key: uploads always go to that account. */
const ACCOUNT_KEY_PREFIX = 'gdt_ik_'
/** A user's key: uploads go to their account with the capture's UID. */
const USER_KEY_PREFIX = 'gdt_uk_'

/**
 * A fresh import key and the hash that is stored for it. The prefix only
 * tells people (and logs) the two kinds apart; lookups go by hash.
 */
export async function newImportKey(
  scope: 'account' | 'user' = 'account',
): Promise<{ key: string; hash: string }> {
  const key = (scope === 'user' ? USER_KEY_PREFIX : ACCOUNT_KEY_PREFIX) + randomToken(32)
  return { key, hash: await sha256Hex(key) }
}

export function hashImportKey(key: string): Promise<string> {
  return sha256Hex(key.trim())
}

/** What an import key upload needs to know about an account. */
export interface KeyAccount {
  id: number
  name: string | null
  uid: string | null
  server: GenshinServer | null
}

export type ImportKeyOwner =
  | { scope: 'account'; account: KeyAccount; userId: number }
  | {
      scope: 'user'
      user: { id: number; username: string }
      /** All of the user's accounts: few rows, and read in the same round trip. */
      accounts: KeyAccount[]
    }

/**
 * Who an import key (by hash) belongs to: an account first, then a user. One
 * D1 round trip either way.
 */
export async function findImportKeyOwner(
  d1: D1Database,
  hash: string,
): Promise<ImportKeyOwner | null> {
  const [account, user, accounts] = await d1.batch<Record<string, unknown>>([
    d1
      .prepare(
        'SELECT id, name, uid, server, user_id FROM genshin_accounts WHERE import_key_hash = ?1',
      )
      .bind(hash),
    d1.prepare('SELECT id, username FROM users WHERE import_key_hash = ?1').bind(hash),
    d1
      .prepare(
        `SELECT a.id, a.name, a.uid, a.server FROM users AS u
         JOIN genshin_accounts AS a ON a.user_id = u.id
         WHERE u.import_key_hash = ?1 ORDER BY a.id`,
      )
      .bind(hash),
  ])
  const ownAccount = account!.results[0] as (KeyAccount & { user_id: number }) | undefined
  if (ownAccount) {
    const { user_id: userId, ...rest } = ownAccount
    return { scope: 'account', account: rest, userId }
  }
  const owner = user!.results[0] as { id: number; username: string } | undefined
  if (!owner) return null
  return {
    scope: 'user',
    user: { id: owner.id, username: owner.username },
    accounts: accounts!.results as unknown as KeyAccount[],
  }
}

/**
 * The user's account with this UID, made when there is none (no name, so the
 * app shows the UID; the server read off the UID). Two first uploads at once
 * cannot make two: the (user_id, uid) unique index lets one INSERT through and
 * both read the row back in the same batch.
 */
export async function accountForUid(
  d1: D1Database,
  meter: D1Meter,
  userId: number,
  uid: string,
  accounts: readonly KeyAccount[],
): Promise<{ account: KeyAccount; created: boolean }> {
  const matches = accounts.filter((a) => a.uid?.trim() === uid)
  if (matches.length === 1) return { account: matches[0]!, created: false }
  if (matches.length > 1) throw ambiguousUid(uid)
  // A leaked user key must not mint accounts without end (the import rate
  // limit alone allows 60 a minute). Accounts made by hand are not capped.
  if (accounts.length >= AUTO_ACCOUNT_LIMIT) {
    throw new ApiError(
      409,
      'account_limit',
      `You already have ${accounts.length} accounts, so a new one for UID ${uid} was not made. Create it yourself, or use its account key.`,
    )
  }

  // The account still gets a key of its own (the column is required); nobody
  // sees this one, and rotating it in account settings shows a new one.
  const { hash } = await newImportKey()
  const [inserted, found] = await meter.batch(d1, 'account', [
    d1
      .prepare(
        `INSERT INTO genshin_accounts (user_id, name, uid, server, import_key_hash, settings, created_at)
         VALUES (?1, NULL, ?2, ?3, ?4, '{}', ?5)
         ON CONFLICT DO NOTHING RETURNING id`,
      )
      .bind(userId, uid, serverFromUid(uid), hash, Date.now()),
    d1
      .prepare('SELECT id, name, uid, server FROM genshin_accounts WHERE user_id = ?1 AND uid = ?2')
      .bind(userId, uid),
  ])
  const rows = found!.results as unknown as KeyAccount[]
  if (rows.length > 1) throw ambiguousUid(uid)
  // Only a clash of the random key hash could ignore the INSERT and leave none.
  if (rows.length === 0) throw new Error(`No account for UID ${uid} after inserting one`)
  return { account: rows[0]!, created: inserted!.results.length > 0 }
}

/** Accounts a user may have before a user-key upload stops making new ones. */
export const AUTO_ACCOUNT_LIMIT = 20

const ambiguousUid = (uid: string) =>
  new ApiError(
    409,
    'ambiguous_uid',
    `More than one of your accounts has UID ${uid}. Give each a different UID, or use the account's own key.`,
  )

/** Account create/update that would give two of a user's accounts one UID. */
export const uidTaken = () =>
  new ApiError(409, 'uid_taken', 'Another of your accounts already has this UID', [
    { path: 'uid', message: 'Another account has this UID' },
  ])
