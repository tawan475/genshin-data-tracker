/**
 * Routes authenticated by an import key rather than a session.
 * Paths and shapes are irminsul's wire contract (`irminsul/src/monitor.rs`):
 * the key arrives in `x-import-key`; any 2xx is success; 401/403 makes
 * irminsul re-verify its key; `verify-key` is read from the top level.
 * Responses only ever gain fields (irminsul ignores unknown ones): an import
 * answers with `warnings` when the file's UID is not the account's, and with
 * the `account` it went to.
 *
 * Two kinds of key: an account's own key uploads to that account; a user's
 * key uploads to the user's account whose UID is the file's `gi_player.uid`,
 * making that account on the first upload of a new UID.
 *
 * Limits (irminsul shows the message of any refusal): 20 uploads a minute
 * per key (KEY_IMPORT_LIMITER; irminsul uploads at most every few seconds,
 * and only when the game sent new data), 60 verifications a minute per key,
 * 20 unknown keys a minute per IP; per file GOOD_LIMITS (422) and the
 * owner's daily and storage quotas (429 / 413, services/upload-limits.ts).
 */

import type { ImportResponse, PreparedSnapshot, VerifyKeyResponse } from '@gdt/shared'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../env'
import { ApiError, clientIp, rateLimit } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { readUpload } from '../lib/upload'
import {
  accountForUid,
  findImportKeyOwner,
  hashImportKey,
  uploadsRefused,
  type ImportKeyOwner,
  type KeyAccount,
} from '../services/accounts'
import { importSnapshot, parseUpload } from '../services/import'
import { notifyUser } from '../services/live'

/** The key's owner; `limiter` is the per-minute budget of this route, per key. */
async function keyOwner(
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

export const publicImport = new Hono<AppEnv>()
  .get('/verify-key', async (c) => {
    const owner = await keyOwner(c, c.env.IMPORT_LIMITER)
    // Same origin the request came in on, so links are right for any deployment.
    if (owner.scope === 'user') {
      return c.json<VerifyKeyResponse>({
        accountId: null,
        accountName: `${owner.user.username} · all accounts`,
        uid: null,
        server: null,
        dashboardUrl: new URL('/app', c.req.url).href,
        scope: 'user',
      })
    }
    const { account } = owner
    return c.json<VerifyKeyResponse>({
      accountId: account.id,
      accountName: account.name,
      uid: account.uid,
      server: account.server,
      dashboardUrl: new URL(`/app/a/${account.id}`, c.req.url).href,
      scope: 'account',
    })
  })

  .post('/import-by-key', async (c) => {
    const owner = await keyOwner(c, c.env.KEY_IMPORT_LIMITER)
    const upload = await readUpload(c)
    const meter = new D1Meter()
    let account: KeyAccount
    let userId: number
    let created = false
    let parsed: PreparedSnapshot | undefined
    if (owner.scope === 'account') {
      account = owner.account
      userId = owner.userId
    } else {
      userId = owner.user.id
      parsed = await parseUpload(upload.text)
      const uid = parsed.good.player?.uid
      if (uid === undefined) {
        throw new ApiError(
          422,
          'uid_required',
          "This file has no UID (gi_player.uid), so your all-accounts key can't tell which account it is. Update Irminsul, or use the account's own import key.",
        )
      }
      ;({ account, created } = await accountForUid(
        c.env.DB,
        meter,
        owner.user.id,
        String(uid),
        owner.accounts,
      ))
    }
    const { response, dataVersion, listener } = await importSnapshot(
      c.env.DB,
      account,
      upload,
      meter,
      parsed,
    ).catch((error: unknown) => {
      // The account this upload made stays, whatever happened to the file.
      if (created) notifyUser(c, userId, { type: 'accounts' })
      throw error
    })
    meter.report(c)
    // Only when someone listens (read in the import's own batch). A new
    // account is in the list now even when its first file changed nothing.
    if (dataVersion !== null || created) {
      notifyUser(
        c,
        userId,
        { type: 'data', accountId: account.id, dataVersion, takenAt: response.takenAt },
        listener,
      )
    }
    return c.json<ImportResponse>(
      { ...response, account: { id: account.id, name: account.name, uid: account.uid, created } },
      response.status === 'created' ? 201 : 200,
    )
  })
