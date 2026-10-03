import { deepMerge, userSettingsPatch } from '@gdt/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { ApiError, parseJson } from '../lib/http'
import { requireUser } from '../lib/session'
import { toMe } from './auth'

export const me = new Hono<AppEnv>().use(requireUser).patch('/settings', async (c) => {
  const patch = await parseJson(c, userSettingsPatch)
  const db = getDb(c.env.DB)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, c.get('userId')))
  if (!user) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  const settings = deepMerge(user.settings, patch)
  await db.update(users).set({ settings }).where(eq(users.id, user.id))
  return c.json(toMe({ ...user, settings }))
})
