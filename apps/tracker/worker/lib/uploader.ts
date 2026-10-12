/**
 * Who an irminsul request (`/api/wishes/*`) comes from, resolved like
 * uploads (routes/public.ts): an account's import key uploads to that
 * account, a user's key to their account with the records' UID. A stopped
 * user (suspended, uploads blocked) is refused here.
 *
 * Today only `x-import-key`. HOOK (irminsul sign-in, the `signin` branch):
 * accept `Authorization: Bearer <irminsul access token>` here too, resolving
 * the token to a user-scope owner (the user and their accounts, as
 * findImportKeyOwner answers for a user key) and checking `blocked` the same
 * way; nothing else in the wish routes needs to change.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../env'
import {
  findImportKeyOwner,
  hashImportKey,
  uploadsRefused,
  type ImportKeyOwner,
  type KeyAccount,
} from '../services/accounts'
import { ApiError, clientIp, rateLimit } from './http'

/** The request's owner; `limiter` is this route's per-minute budget, per credential. */
export async function uploaderOf(
  c: Context<AppEnv>,
  limiter: RateLimit | undefined,
): Promise<ImportKeyOwner> {
  // HOOK: `Authorization: Bearer …` (irminsul sign-in) goes here, before the key.
  const key = c.req.header('x-import-key')
  if (!key) throw new ApiError(401, 'missing_import_key', 'Missing x-import-key header')
  const hash = await hashImportKey(key)
  await rateLimit(limiter, `key:${hash}`)
  const owner = await findImportKeyOwner(c.env.DB, hash)
  if (!owner) {
    await rateLimit(c.env.AUTH_LIMITER, `bad-key:${clientIp(c)}`)
    throw new ApiError(401, 'invalid_import_key', 'Unknown import key')
  }
  if (owner.blocked) throw uploadsRefused(owner.blocked)
  return owner
}

/** The owner's user id. */
export function uploaderUserId(owner: ImportKeyOwner): number {
  return owner.scope === 'account' ? owner.userId : owner.user.id
}

/**
 * The account a UID's records belong to, without making one: an account
 * key's own account (409 `uid_mismatch` when it has another UID), or the
 * user's account with that UID (null when there is none).
 */
export function uploaderAccount(owner: ImportKeyOwner, uid: string): KeyAccount | null {
  if (owner.scope === 'account') {
    const linked = owner.account.uid?.trim()
    if (linked && linked !== uid) {
      throw new ApiError(
        409,
        'uid_mismatch',
        `This key's account is UID ${linked}, not ${uid}. Use that account's key, or your all-accounts key.`,
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
