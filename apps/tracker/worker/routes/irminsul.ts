/**
 * A signed-in irminsul's routes, under /api/irminsul (README "Sign in from
 * irminsul"). `Authorization: Bearer <access>` only: a browser's cookies are
 * no use here, and these tokens are no use anywhere else (lib/irminsul-auth).
 *
 * - `GET /whoami`: who is signed in and where uploads go (the verify-key
 *   answer's fields, plus `user` and `configUrl`: the page that changes the
 *   target; irminsul never changes it).
 * - `POST /import`: the same body, limits and answers as `import-by-key`
 *   (routes/public, services/upload-as): uid mode is a user key's routing,
 *   account mode an account key's. 20 uploads a minute per session.
 *
 * Both read the session row in the one D1 round trip they make before the
 * import (an import key's lookup costs the same): an ended session is 401
 * `session_revoked`, a suspended user 403 `account_suspended`, blocked uploads
 * 403 `uploads_blocked`, as with keys.
 */

import type { IrminsulWhoami } from '@gdt/shared'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../env'
import type { IrminsulClaims } from '../lib/irminsul-auth'
import { irminsulSessionEnded, requireIrminsul } from '../lib/irminsul-auth'
import { ApiError, rateLimit } from '../lib/http'
import { readUpload } from '../lib/upload'
import { uploadsRefused, type UploadOwner } from '../services/accounts'
import { configUrl, loadSession, loadUploadSession, whoamiOf } from '../services/irminsul'
import { uploadAs } from '../services/upload-as'

function claimsOf(c: Context<AppEnv>): IrminsulClaims {
  return { userId: c.get('userId'), sid: c.get('sessionId')!, ver: c.get('tokenVersion')! }
}

export const irminsul = new Hono<AppEnv>()
  .use(requireIrminsul)

  .get('/whoami', async (c) => {
    const claims = claimsOf(c)
    await rateLimit(c.env.IMPORT_LIMITER, `irminsul-whoami:${claims.sid}`)
    const session = await loadSession(c.env.DB, claims)
    if (!session) throw irminsulSessionEnded()
    // As verify-key does for a stopped key's owner.
    if (session.block) throw uploadsRefused(session.block)
    c.header('Cache-Control', 'no-store')
    return c.json<IrminsulWhoami>(whoamiOf(new URL(c.req.url).origin, claims.sid, session))
  })

  .post('/import', async (c) => {
    const claims = claimsOf(c)
    await rateLimit(c.env.KEY_IMPORT_LIMITER, `irminsul:${claims.sid}`)
    const found = await loadUploadSession(c.env.DB, claims)
    if (!found) throw irminsulSessionEnded()
    const { session, accounts } = found
    if (session.block) throw uploadsRefused(session.block)
    const where = configUrl(new URL(c.req.url).origin, claims.sid)
    let owner: UploadOwner
    if (session.upload_mode === 'account') {
      const account = accounts.find((a) => a.id === session.upload_account_id)
      if (!account) {
        throw new ApiError(
          409,
          'upload_target_missing',
          `The account this PC uploads to was deleted. Choose where uploads go: ${where}`,
        )
      }
      owner = { scope: 'account', account, userId: claims.userId }
    } else {
      owner = { scope: 'user', user: { id: claims.userId, username: session.username }, accounts }
    }
    return uploadAs(c, owner, await readUpload(c), {
      uidRequired: `This file has no UID (gi_player.uid), so it can't be matched to an account. Update Irminsul, or choose one account for this PC: ${where}`,
    })
  })
