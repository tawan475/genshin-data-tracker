/**
 * Routes authenticated by an account's import key rather than a session.
 * Paths and shapes are irminsul's wire contract (`irminsul/src/monitor.rs`):
 * the key arrives in `x-import-key`; any 2xx is success; 401/403 makes
 * irminsul re-verify its key; `verify-key` is read from the top level.
 */

import type { VerifyKeyResponse } from '@gdt/shared'
import { eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import { genshinAccounts } from '../db/schema'
import type { AppEnv } from '../env'
import { ApiError, clientIp, rateLimit } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { readUpload } from '../lib/upload'
import { hashImportKey } from '../services/accounts'
import { importSnapshot } from '../services/import'

async function accountForKey(c: Context<AppEnv>) {
  const key = c.req.header('x-import-key')
  if (!key) throw new ApiError(401, 'missing_import_key', 'Missing x-import-key header')
  const hash = await hashImportKey(key)
  await rateLimit(c.env.IMPORT_LIMITER, `key:${hash}`)
  const [account] = await getDb(c.env.DB)
    .select({
      id: genshinAccounts.id,
      name: genshinAccounts.name,
      uid: genshinAccounts.uid,
      server: genshinAccounts.server,
    })
    .from(genshinAccounts)
    .where(eq(genshinAccounts.importKeyHash, hash))
    .limit(1)
  if (!account) {
    await rateLimit(c.env.AUTH_LIMITER, `bad-key:${clientIp(c)}`)
    throw new ApiError(401, 'invalid_import_key', 'Unknown import key')
  }
  return account
}

export const publicImport = new Hono<AppEnv>()
  .get('/verify-key', async (c) => {
    const account = await accountForKey(c)
    return c.json<VerifyKeyResponse>({
      accountId: account.id,
      accountName: account.name,
      uid: account.uid,
      server: account.server,
      // Same origin the request came in on, so it is right for any deployment.
      dashboardUrl: new URL(`/app/a/${account.id}`, c.req.url).href,
    })
  })

  .post('/import-by-key', async (c) => {
    const account = await accountForKey(c)
    const meter = new D1Meter()
    const result = await importSnapshot(c.env.DB, account.id, await readUpload(c), meter)
    meter.report(c)
    return c.json(result, result.status === 'created' ? 201 : 200)
  })
