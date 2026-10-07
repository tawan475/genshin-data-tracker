import { deepMerge, userSettingsPatch, type ImportKeyResponse } from '@gdt/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { ApiError, parseJson } from '../lib/http'
import { requireUser } from '../lib/session'
import { newImportKey } from '../services/accounts'
import { toMe } from './auth'

export const me = new Hono<AppEnv>()
  .use(requireUser)

  .patch('/settings', async (c) => {
    const patch = await parseJson(c, userSettingsPatch)
    const db = getDb(c.env.DB)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, c.get('userId')))
    if (!user) throw new ApiError(401, 'unauthenticated', 'Not signed in')
    const settings = deepMerge(user.settings, patch)
    await db.update(users).set({ settings }).where(eq(users.id, user.id))
    return c.json(toMe({ ...user, settings }, c.env))
  })

  /**
   * The user's Irminsul key for all their accounts (see routes/public): a new
   * one replaces the old, which stops working at once. Shown once; only its
   * hash is stored.
   */
  .post('/import-key', async (c) => {
    const { key, hash } = await newImportKey('user')
    const [updated] = await getDb(c.env.DB)
      .update(users)
      .set({ importKeyHash: hash })
      .where(eq(users.id, c.get('userId')))
      .returning({ id: users.id })
    if (!updated) throw new ApiError(401, 'unauthenticated', 'Not signed in')
    return c.json<ImportKeyResponse>({ importKey: key })
  })

  /** Revokes the user's key; accounts' own keys keep working. */
  .delete('/import-key', async (c) => {
    await getDb(c.env.DB)
      .update(users)
      .set({ importKeyHash: null })
      .where(eq(users.id, c.get('userId')))
    return c.body(null, 204)
  })
