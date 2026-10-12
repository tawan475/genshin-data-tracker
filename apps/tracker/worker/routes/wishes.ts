/**
 * Wish history routes.
 *
 * irminsul (`/api/wishes/*`, the contract in its docs: an import key now,
 * its sign-in token later, see lib/uploader.ts):
 * - `GET /cursor?uid=`: the newest game id held per banner, so irminsul
 *   pages the game's history only until it reaches a pull the tracker has.
 *   A UID without an account answers `accountId: null` and no ids (a user
 *   key makes the account on import, as uploads do).
 * - `POST /import`: up to 2,000 records as the game's API lists them;
 *   merged by id, so overlap and order don't matter.
 *
 * The website (`/api/accounts/:id/wishes`, signed in):
 * - `GET`: the stored chunks (base64; the browser decodes them), with an
 *   ETag on the history's version.
 * - `POST /import`: records converted in the browser from a UIGF or
 *   paimon.moe file (up to 20,000 a request).
 * - `DELETE`: the whole history.
 *
 * Every import that stores something counts against the owner's daily and
 * storage quotas, and tells their open pages (`wishes` live event).
 */

import {
  wishImportRequest,
  wishSiteImportRequest,
  type WishCursorResponse,
  type WishHistoryResponse,
  type WishImportResponse,
} from '@gdt/shared'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { checkEtag } from '../lib/etag'
import { ApiError, idParam, parseJson, rateLimit } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { requireUser } from '../lib/session'
import { uploaderAccount, uploaderOf, uploaderUserId } from '../lib/uploader'
import { accountForUid, loadOwnedAccount, uploadsRefused } from '../services/accounts'
import { listenerOf, listenerStatement, notifyUser, senderTab } from '../services/live'
import { importWishes, readWishHistory, wishCursor } from '../services/wishes'
import { uploadBlock } from './accounts'

const EMPTY_NEWEST = { '100': null, '200': null, '301': null, '302': null, '500': null }

/** Bodies above this are refused before they are read (2,000 records are well under 1 MB). */
const SYNC_BODY_LIMIT = 2 * 1024 * 1024
const SITE_BODY_LIMIT = 12 * 1024 * 1024

function limitBody(c: Context, limit: number): void {
  if (Number(c.req.header('content-length') ?? 0) > limit) {
    throw new ApiError(413, 'too_large', 'Too many records in one request')
  }
}

const uidQuery = (c: Context): string => {
  const uid = c.req.query('uid')?.trim() ?? ''
  if (!/^\d{9,10}$/.test(uid)) throw new ApiError(400, 'invalid_uid', 'A UID is 9 or 10 digits')
  return uid
}

export const wishSync = new Hono<AppEnv>()
  .get('/cursor', async (c) => {
    const uid = uidQuery(c)
    const owner = await uploaderOf(c, c.env.IMPORT_LIMITER)
    const account = uploaderAccount(owner, uid)
    const meter = new D1Meter()
    const newest = account ? await wishCursor(c.env.DB, meter, account.id) : { ...EMPTY_NEWEST }
    meter.report(c)
    return c.json<WishCursorResponse>({ uid, accountId: account?.id ?? null, newest })
  })

  .post('/import', async (c) => {
    limitBody(c, SYNC_BODY_LIMIT)
    const owner = await uploaderOf(c, c.env.KEY_IMPORT_LIMITER)
    const body = await parseJson(c, wishImportRequest)
    const meter = new D1Meter()
    const userId = uploaderUserId(owner)
    let account = uploaderAccount(owner, body.uid)
    let created = false
    if (!account && owner.scope === 'user') {
      ;({ account, created } = await accountForUid(
        c.env.DB,
        meter,
        owner.user.id,
        body.uid,
        owner.accounts,
      ))
    }
    if (!account) throw new Error('No account for a wish import')
    if (created) notifyUser(c, userId, { type: 'accounts' })
    const { response, changed, listener } = await importWishes(
      c.env.DB,
      account,
      { uid: body.uid, timezone: body.timezone, records: body.records },
      meter,
    )
    meter.report(c)
    if (changed) notifyUser(c, userId, { type: 'wishes', accountId: account.id }, listener)
    return c.json<WishImportResponse>({ accountId: account.id, ...response })
  })

/** ETag of an account's history: its version and when it moved (a delete starts over at 0). */
async function historyEtag(d1: D1Database, accountId: number): Promise<string> {
  const row = await d1
    .prepare('SELECT version, updated_at FROM wish_histories WHERE account_id = ?1')
    .bind(accountId)
    .first<{ version: number; updated_at: number }>()
  return row ? `W/"w${accountId}.v${row.version}.${row.updated_at}"` : `W/"w${accountId}.none"`
}

export const wishAccounts = new Hono<AppEnv>()
  .use(requireUser)

  .get('/:id/wishes', async (c) => {
    const id = idParam(c, 'id')
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const cached = checkEtag(c, await historyEtag(c.env.DB, id))
    if (cached) return cached
    return c.json<WishHistoryResponse>(await readWishHistory(c.env.DB, id))
  })

  .post('/:id/wishes/import', async (c) => {
    const id = idParam(c, 'id')
    limitBody(c, SITE_BODY_LIMIT)
    const [account, blocked] = await Promise.all([
      loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id),
      uploadBlock(c.env.DB, c.get('userId')),
    ])
    if (blocked) throw uploadsRefused(blocked)
    await rateLimit(c.env.IMPORT_LIMITER, `wishes:account:${id}`)
    const body = await parseJson(c, wishSiteImportRequest)
    const meter = new D1Meter()
    const { response, changed, listener } = await importWishes(
      c.env.DB,
      account,
      { uid: body.uid, timezone: body.timezone, records: body.records },
      meter,
    )
    meter.report(c)
    if (changed) {
      notifyUser(c, c.get('userId'), { type: 'wishes', accountId: id, ...senderTab(c) }, listener)
    }
    return c.json<WishImportResponse>({ accountId: id, ...response })
  })

  .delete('/:id/wishes', async (c) => {
    const id = idParam(c, 'id')
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const [chunks, , listening] = await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM wish_chunks WHERE account_id = ?1').bind(id),
      c.env.DB.prepare('DELETE FROM wish_histories WHERE account_id = ?1').bind(id),
      listenerStatement(c.env.DB, id),
    ])
    notifyUser(
      c,
      c.get('userId'),
      { type: 'wishes', accountId: id, ...senderTab(c) },
      listenerOf(listening),
    )
    return c.json({ deleted: chunks!.meta.changes })
  })
