/**
 * Who an upload comes from, for every irminsul route that writes: an
 * import key (`x-import-key`; routes/public) or a signed-in irminsul's
 * access token (`Authorization: Bearer`; routes/irminsul), resolved to the
 * same owner shape (services/upload-as):
 * - an account key, or a session whose uploads go to one account: that
 *   account;
 * - a user key, or a session in uid mode: the user and all their accounts,
 *   routed by the upload's UID (made on the first upload of a new UID).
 * A stopped user (suspended, uploads blocked) is refused here; an ended
 * session is 401 `session_revoked`, an expired token 401 `token_expired`
 * (irminsul refreshes and retries). One D1 round trip either way.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../env'
import {
  findImportKeyOwner,
  hashImportKey,
  uploadsRefused,
  type ImportKeyOwner,
  type KeyAccount,
  type UploadOwner,
} from '../services/accounts'
import { configUrl, loadUploadSession } from '../services/irminsul'
import { ApiError, clientIp, rateLimit } from './http'
import {
  bearerToken,
  irminsulSessionEnded,
  readAccessToken,
  type IrminsulClaims,
} from './irminsul-auth'

/** The key's owner; `limiter` is the per-minute budget of this route, per key. */
export async function keyOwner(
  c: Context<AppEnv>,
  limiter: RateLimit | undefined,
): Promise<ImportKeyOwner> {
  const key = c.req.header('x-import-key')
  if (!key) throw new ApiError(401, 'missing_import_key', 'Missing x-import-key header')
  const hash = await hashImportKey(key)
  await rateLimit(limiter, `key:${hash}`)
  const owner = await findImportKeyOwner(c.env.DB, hash)
  if (!owner) {
    await rateLimit(c.env.AUTH_LIMITER, `bad-key:${clientIp(c)}`)
    throw new ApiError(401, 'invalid_import_key', 'Unknown import key')
  }
  // Staff stopped this user's uploads (the staff dashboard).
  if (owner.blocked) throw uploadsRefused(owner.blocked)
  return owner
}

/**
 * The owner a live irminsul session uploads as: its one account, or its
 * user (uid mode). 409 `upload_target_missing` when that account is gone.
 */
export async function sessionOwner(
  c: Context<AppEnv>,
  claims: IrminsulClaims,
): Promise<UploadOwner> {
  const found = await loadUploadSession(c.env.DB, claims)
  if (!found) throw irminsulSessionEnded()
  const { session, accounts } = found
  if (session.block) throw uploadsRefused(session.block)
  if (session.upload_mode === 'account') {
    const account = accounts.find((a) => a.id === session.upload_account_id)
    if (!account) {
      const where = configUrl(new URL(c.req.url).origin, claims.sid)
      throw new ApiError(
        409,
        'upload_target_missing',
        `The account this PC uploads to was deleted. Choose where uploads go: ${where}`,
      )
    }
    return { scope: 'account', account, userId: claims.userId }
  }
  return { scope: 'user', user: { id: claims.userId, username: session.username }, accounts }
}

/**
 * The request's owner, by its Bearer token when it has one, else by its
 * import key. `limiter` is this route's per-minute budget, per key or per
 * session (`bucket` names the route in the session's limiter key).
 */
export async function uploaderOf(
  c: Context<AppEnv>,
  limiter: RateLimit | undefined,
  bucket: string,
): Promise<UploadOwner> {
  const token = bearerToken(c)
  if (!token) return keyOwner(c, limiter)
  const claims = await readAccessToken(c, token)
  if (claims === 'expired') throw new ApiError(401, 'token_expired', 'Access token expired')
  if (claims === 'invalid') throw new ApiError(401, 'invalid_token', 'Not an irminsul token')
  await rateLimit(limiter, `irminsul-${bucket}:${claims.sid}`)
  return sessionOwner(c, claims)
}

/** The owner's user id. */
export function uploaderUserId(owner: UploadOwner): number {
  return owner.scope === 'account' ? owner.userId : owner.user.id
}

/**
 * The account a UID's records belong to, without making one: an account
 * owner's own account (409 `uid_mismatch` when it has another UID), or the
 * user's account with that UID (null when there is none).
 */
export function uploaderAccount(owner: UploadOwner, uid: string): KeyAccount | null {
  if (owner.scope === 'account') {
    const linked = owner.account.uid?.trim()
    if (linked && linked !== uid) {
      throw new ApiError(
        409,
        'uid_mismatch',
        `These records are UID ${uid}, but uploads here go to the account with UID ${linked}.`,
      )
    }
    return owner.account
  }
  const matches = owner.accounts.filter((a) => a.uid?.trim() === uid)
  if (matches.length > 1) {
    throw new ApiError(
      409,
      'ambiguous_uid',
      `More than one of your accounts has UID ${uid}. Give each a different UID, or use the account's own key.`,
    )
  }
  return matches[0] ?? null
}
