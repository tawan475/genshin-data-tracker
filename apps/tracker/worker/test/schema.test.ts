import { env, SELF } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import {
  achievementMarks,
  blobs,
  genshinAccounts,
  plannerTargets,
  snapshots,
  users,
} from '../db/schema'

const db = getDb(env.DB)

async function seedAccount() {
  const name = `traveler-${crypto.randomUUID()}`
  const [user] = await db
    .insert(users)
    .values({
      username: name,
      usernameKey: name,
      email: `${name}@example.com`,
      passwordHash: '',
    })
    .returning()
  const [account] = await db
    .insert(genshinAccounts)
    .values({ userId: user!.id, importKeyHash: crypto.randomUUID() })
    .returning()
  return account!
}

const summary = {
  characters: 0,
  weapons: 0,
  artifacts: 0,
  materials: 0,
  mora: 0,
  primogem: 0,
  fodder3: 0,
  fodder4: 0,
}

function snapshotRow(accountId: number, takenAt: number) {
  return {
    accountId,
    takenAt,
    lastSeenAt: takenAt,
    format: 'GOOD',
    version: 3,
    source: 'test',
    rawSize: 1,
    storedSize: 1,
    contentHash: 'c',
    charactersHash: 'a',
    weaponsHash: 'b',
    artifactsHash: 'c',
    materialsHash: 'd',
    materialsKeyframeHash: 'd',
    summary,
  }
}

describe('worker', () => {
  it('answers /api/health', async () => {
    const response = await SELF.fetch('https://genshin-tracker.475.dev/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', db: 'ok' })
  })

  it('returns JSON 404s under /api', async () => {
    const response = await SELF.fetch('https://genshin-tracker.475.dev/api/nope')
    expect(response.status).toBe(404)
  })
})

describe('D1 schema', () => {
  it('stores and returns blob bytes unchanged', async () => {
    const account = await seedAccount()
    const data = new Uint8Array([0, 1, 2, 250, 255])
    await db
      .insert(blobs)
      .values({ accountId: account.id, hash: 'h', kind: 'materials', data, rawSize: 5 })
    const [row] = await db.select().from(blobs).where(eq(blobs.accountId, account.id))
    expect(row!.data).toBeInstanceOf(Uint8Array)
    expect([...row!.data]).toEqual([...data])
  })

  it('allows one live snapshot per capture time, but re-import after a delete', async () => {
    const account = await seedAccount()
    const [first] = await db.insert(snapshots).values(snapshotRow(account.id, 1000)).returning()
    await expect(db.insert(snapshots).values(snapshotRow(account.id, 1000))).rejects.toThrow()

    await db.update(snapshots).set({ deletedAt: Date.now() }).where(eq(snapshots.id, first!.id))
    await expect(db.insert(snapshots).values(snapshotRow(account.id, 1000))).resolves.toBeDefined()
  })

  it('deleting a user cascades to everything they own', async () => {
    const account = await seedAccount()
    await db.insert(snapshots).values(snapshotRow(account.id, 2000))
    await db.insert(achievementMarks).values({ accountId: account.id, achievementId: 81001 })
    await db.insert(plannerTargets).values({
      accountId: account.id,
      kind: 'character',
      key: 'Furina',
      target: {
        level: 90,
        ascension: 6,
        talents: { auto: 10, skill: 10, burst: 10 },
        active: true,
      },
    })
    await db.delete(users).where(eq(users.id, account.userId))
    expect(await db.select().from(snapshots).where(eq(snapshots.accountId, account.id))).toEqual([])
    expect(
      await db.select().from(achievementMarks).where(eq(achievementMarks.accountId, account.id)),
    ).toEqual([])
    expect(
      await db.select().from(plannerTargets).where(eq(plannerTargets.accountId, account.id)),
    ).toEqual([])
  })
})
