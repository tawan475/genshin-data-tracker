/**
 * Account sharing routes (docs/plans/account-sharing.md, README "Account
 * sharing"):
 *
 * - `GET /api/accounts/:id/members`: the owner and everyone it is shared
 *   with (pending invites included); any access.
 * - `POST /api/accounts/:id/members {username, role}`: invite (owner).
 * - `PATCH /api/accounts/:id/members/:userId {role}`: change a role (owner).
 * - `DELETE /api/accounts/:id/members/:userId`: the owner removes a member or
 *   cancels an invite; a member removing themselves leaves.
 * - `GET /api/invitations`, `POST /api/invitations/:accountId/accept|decline`.
 *
 * Every change tells both sides' pages (`accounts` event): the switcher and
 * the invitations follow at once.
 */

import {
  ACCOUNT_MEMBER_LIMIT,
  accountInvite,
  accountMemberPatch,
  type AccountMemberResponse,
  type InvitationResponse,
} from '@gdt/shared'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { ApiError, idParam, notFound, parseJson, rateLimit } from '../lib/http'
import { requireUser } from '../lib/session'
import { assertAccount, ownerOnly } from '../services/accounts'
import { notifyUser } from '../services/live'
import {
  INVITE_TTL_MS,
  PENDING_INVITE_LIMIT,
  invitationsFromRows,
  invitationsStatement,
  membersFromRows,
  membersStatement,
} from '../services/sharing'

async function members(c: Context<AppEnv>, accountId: number): Promise<AccountMemberResponse[]> {
  const { results } = await membersStatement(c.env.DB, accountId, Date.now()).all()
  return membersFromRows(results)
}

/** The account's owner id (the caller's access was checked already). */
async function ownerOf(d1: D1Database, accountId: number): Promise<number> {
  const row = await d1
    .prepare('SELECT user_id FROM genshin_accounts WHERE id = ?1')
    .bind(accountId)
    .first<{ user_id: number }>()
  if (!row) throw notFound('Account')
  return row.user_id
}

export const accountSharing = new Hono<AppEnv>()
  .use(requireUser)

  .get('/:id/members', async (c) => {
    const id = idParam(c, 'id')
    const access = await assertAccount(getDb(c.env.DB), c.get('userId'), id, 'view')
    const list = await members(c, id)
    // Pending invites are the owner's business.
    return c.json(access === 'owner' ? list : list.filter((m) => m.acceptedAt !== null))
  })

  .post('/:id/members', async (c) => {
    const id = idParam(c, 'id')
    const userId = c.get('userId')
    const { username, role } = await parseJson(c, accountInvite)
    await assertAccount(getDb(c.env.DB), userId, id, 'own')
    await rateLimit(c.env.AUTH_LIMITER, `invite:${userId}`)
    const now = Date.now()
    const d1 = c.env.DB
    const [invitee, counts] = await d1.batch<Record<string, unknown>>([
      d1.prepare('SELECT id FROM users WHERE username_key = ?1').bind(username.toLowerCase()),
      d1
        .prepare(
          `SELECT
             (SELECT count(*) FROM account_members WHERE account_id = ?1
               AND (accepted_at IS NOT NULL OR created_at > ?3)) AS members,
             (SELECT count(*) FROM account_members WHERE invited_by = ?2
               AND accepted_at IS NULL AND created_at > ?3) AS pending`,
        )
        .bind(id, userId, now - INVITE_TTL_MS),
    ])
    const target = invitee!.results[0] as { id: number } | undefined
    if (!target) {
      throw new ApiError(404, 'user_not_found', 'No user has that name', [
        { path: 'username', message: 'No user has that name' },
      ])
    }
    if (target.id === userId) {
      throw new ApiError(400, 'cannot_invite_self', 'That is you', [
        { path: 'username', message: 'That is you' },
      ])
    }
    const count = counts!.results[0] as { members: number; pending: number }
    if (count.members >= ACCOUNT_MEMBER_LIMIT) {
      throw new ApiError(
        409,
        'member_limit',
        `An account can be shared with ${ACCOUNT_MEMBER_LIMIT} people`,
      )
    }
    if (count.pending >= PENDING_INVITE_LIMIT) {
      throw new ApiError(409, 'invite_limit', 'Too many invites waiting: cancel some first')
    }
    // An expired invite to the same person is replaced; a live one or a member is kept.
    const inserted = await d1
      .prepare(
        `INSERT INTO account_members (account_id, user_id, role, invited_by, created_at, accepted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL)
         ON CONFLICT (account_id, user_id) DO UPDATE SET
           role = excluded.role, invited_by = excluded.invited_by, created_at = excluded.created_at
         WHERE account_members.accepted_at IS NULL AND account_members.created_at <= ?6
         RETURNING 1 AS ok`,
      )
      .bind(id, target.id, role, userId, now, now - INVITE_TTL_MS)
      .first()
    if (!inserted) {
      throw new ApiError(409, 'already_member', 'Already shared with them', [
        { path: 'username', message: 'Already shared with them' },
      ])
    }
    notifyUser(c, target.id, { type: 'accounts' })
    return c.json(await members(c, id), 201)
  })

  .patch('/:id/members/:userId', async (c) => {
    const id = idParam(c, 'id')
    const member = idParam(c, 'userId')
    const { role } = await parseJson(c, accountMemberPatch)
    await assertAccount(getDb(c.env.DB), c.get('userId'), id, 'own')
    const changed = await c.env.DB.prepare(
      'UPDATE account_members SET role = ?3 WHERE account_id = ?1 AND user_id = ?2 RETURNING 1',
    )
      .bind(id, member, role)
      .first()
    if (!changed) throw notFound('Member')
    notifyUser(c, member, { type: 'accounts' })
    return c.json(await members(c, id))
  })

  .delete('/:id/members/:userId', async (c) => {
    const id = idParam(c, 'id')
    const member = idParam(c, 'userId')
    const userId = c.get('userId')
    const access = await assertAccount(getDb(c.env.DB), userId, id, 'view')
    // A member may only remove themselves (leave); the owner anyone.
    if (access !== 'owner' && member !== userId) throw ownerOnly()
    const removed = await c.env.DB.prepare(
      'DELETE FROM account_members WHERE account_id = ?1 AND user_id = ?2 RETURNING 1',
    )
      .bind(id, member)
      .first()
    if (!removed) throw notFound('Member')
    notifyUser(c, member, { type: 'accounts' })
    if (access !== 'owner') notifyUser(c, await ownerOf(c.env.DB, id), { type: 'accounts' })
    return c.body(null, 204)
  })

export const invitations = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => {
    const { results } = await invitationsStatement(c.env.DB, c.get('userId'), Date.now()).all()
    return c.json<InvitationResponse[]>(invitationsFromRows(results))
  })

  .post('/:accountId/accept', async (c) => {
    const id = idParam(c, 'accountId')
    const now = Date.now()
    const accepted = await c.env.DB.prepare(
      `UPDATE account_members SET accepted_at = ?3
       WHERE account_id = ?1 AND user_id = ?2 AND accepted_at IS NULL AND created_at > ?4
       RETURNING (SELECT user_id FROM genshin_accounts WHERE id = ?1) AS owner`,
    )
      .bind(id, c.get('userId'), now, now - INVITE_TTL_MS)
      .first<{ owner: number }>()
    if (!accepted) throw notFound('Invitation')
    notifyUser(c, c.get('userId'), { type: 'accounts' })
    notifyUser(c, accepted.owner, { type: 'accounts' })
    return c.body(null, 204)
  })

  .post('/:accountId/decline', async (c) => {
    const id = idParam(c, 'accountId')
    const declined = await c.env.DB.prepare(
      `DELETE FROM account_members WHERE account_id = ?1 AND user_id = ?2 AND accepted_at IS NULL
       RETURNING (SELECT user_id FROM genshin_accounts WHERE id = ?1) AS owner`,
    )
      .bind(id, c.get('userId'))
      .first<{ owner: number }>()
    if (!declined) throw notFound('Invitation')
    notifyUser(c, declined.owner, { type: 'accounts' })
    return c.body(null, 204)
  })
