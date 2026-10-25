/**
 * Account sharing (docs/plans/account-sharing.md): the owner invites a user
 * by username as viewer or editor, the invite waits until they accept, and
 * either side can end it (remove, cancel, decline, leave). Access itself is
 * checked in services/accounts (`loadAccount`); this is the membership.
 */

import type { AccountMemberResponse, AccountRole, InvitationResponse } from '@gdt/shared'

/** An invite not accepted within this long is gone (maintenance deletes it). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000
/** Pending invites one owner may have out at once, across their accounts. */
export const PENDING_INVITE_LIMIT = 20

/** The owner first, then members and invites in the order they were made. */
export function membersStatement(
  d1: D1Database,
  accountId: number,
  now: number,
): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT u.id AS user_id, u.username, 'owner' AS access, a.created_at, a.created_at AS accepted_at
         FROM genshin_accounts AS a JOIN users AS u ON u.id = a.user_id WHERE a.id = ?1
       UNION ALL
       SELECT u.id, u.username, m.role, m.created_at, m.accepted_at
         FROM account_members AS m JOIN users AS u ON u.id = m.user_id
         WHERE m.account_id = ?1 AND (m.accepted_at IS NOT NULL OR m.created_at > ?2)`,
    )
    .bind(accountId, now - INVITE_TTL_MS)
}

export function membersFromRows(rows: readonly Record<string, unknown>[]): AccountMemberResponse[] {
  const list = rows.map((row) => ({
    userId: Number(row.user_id),
    username: String(row.username),
    access: row.access as AccountMemberResponse['access'],
    createdAt: Number(row.created_at),
    acceptedAt: row.accepted_at === null ? null : Number(row.accepted_at),
  }))
  return [
    ...list.filter((m) => m.access === 'owner'),
    ...list.filter((m) => m.access !== 'owner').sort((a, b) => a.createdAt - b.createdAt),
  ]
}

/** Invites waiting for `userId`, newest first. */
export function invitationsStatement(
  d1: D1Database,
  userId: number,
  now: number,
): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT a.id AS account_id, a.name, a.uid, o.username AS owner, m.role, m.created_at
       FROM account_members AS m JOIN genshin_accounts AS a ON a.id = m.account_id
       JOIN users AS o ON o.id = a.user_id
       WHERE m.user_id = ?1 AND m.accepted_at IS NULL AND m.created_at > ?2
       ORDER BY m.created_at DESC`,
    )
    .bind(userId, now - INVITE_TTL_MS)
}

export function invitationsFromRows(
  rows: readonly Record<string, unknown>[],
): InvitationResponse[] {
  return rows.map((row) => ({
    accountId: Number(row.account_id),
    accountName: (row.name as string | null) ?? null,
    uid: (row.uid as string | null) ?? null,
    owner: String(row.owner),
    role: row.role as AccountRole,
    invitedAt: Number(row.created_at),
  }))
}

/** Maintenance: invites nobody accepted in time. */
export function expiredInvitesStatement(d1: D1Database, now: number): D1PreparedStatement {
  return d1
    .prepare('DELETE FROM account_members WHERE accepted_at IS NULL AND created_at <= ?1')
    .bind(now - INVITE_TTL_MS)
}
