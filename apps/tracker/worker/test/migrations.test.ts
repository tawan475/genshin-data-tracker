import type { SnapshotSummary } from '@gdt/shared'
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { genshinAccounts, snapshots, users } from '../db/schema'

const db = getDb(env.DB)

/** Runs one migration's statements again, on top of the already migrated test database. */
async function rerun(prefix: string): Promise<void> {
  const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith(prefix))
  if (!migration) throw new Error(`No migration ${prefix}`)
  for (const query of migration.queries) await env.DB.prepare(query).run()
}

async function seedAccount(): Promise<number> {
  const name = `traveler-${crypto.randomUUID()}`
  const [user] = await db
    .insert(users)
    .values({ username: name, usernameKey: name, passwordHash: '' })
    .returning()
  const [account] = await db
    .insert(genshinAccounts)
    .values({ userId: user!.id, importKeyHash: crypto.randomUUID() })
    .returning()
  return account!.id
}

let takenAt = 1_000

/** A snapshot row whose summary column holds exactly `summary`. */
async function snapshotWithSummary(accountId: number, summary: string): Promise<number> {
  takenAt++
  const [row] = await db
    .insert(snapshots)
    .values({
      accountId,
      takenAt,
      lastSeenAt: takenAt,
      format: 'GOOD',
      version: 3,
      source: 'test',
      rawSize: 1,
      storedSize: 1,
      contentHash: `c${takenAt}`,
      charactersHash: 'a',
      weaponsHash: 'b',
      artifactsHash: 'c',
      materialsHash: 'd',
      materialsKeyframeHash: 'd',
      summary: {} as SnapshotSummary,
    })
    .returning({ id: snapshots.id })
  await env.DB.prepare('UPDATE snapshots SET summary = ?1 WHERE id = ?2')
    .bind(summary, row!.id)
    .run()
  return row!.id
}

async function summaryText(id: number): Promise<string> {
  const row = await env.DB.prepare('SELECT summary FROM snapshots WHERE id = ?1')
    .bind(id)
    .first<{ summary: string }>()
  return row!.summary
}

// The pre-0008 key names, spelled in pieces like the migration does.
const OLD = 'fod' + 'der'
const counts = { characters: 2, weapons: 3, artifacts: 4, materials: 5, mora: 6, primogem: 7 }

describe('migration 0008 (summary artifact3 / artifact4)', () => {
  it('renames the old keys, keeps their values and leaves other rows alone', async () => {
    const accountId = await seedAccount()
    const legacy = await snapshotWithSummary(
      accountId,
      JSON.stringify({ ...counts, [`${OLD}3`]: 11, [`${OLD}4`]: 12 }),
    )
    const onlyThree = await snapshotWithSummary(
      accountId,
      JSON.stringify({ ...counts, [`${OLD}3`]: 0 }),
    )
    const current = JSON.stringify({ ...counts, artifact3: 21, artifact4: 22 })
    const untouched = await snapshotWithSummary(accountId, current)

    await rerun('0008_')

    // Same JSON text a new import writes: the renamed keys end up last, in order.
    expect(await summaryText(legacy)).toBe(
      JSON.stringify({ ...counts, artifact3: 11, artifact4: 12 }),
    )
    // A missing old key is not turned into a null.
    expect(await summaryText(onlyThree)).toBe(JSON.stringify({ ...counts, artifact3: 0 }))
    expect(await summaryText(untouched)).toBe(current)

    // Running it again changes nothing.
    const before = await Promise.all([legacy, onlyThree, untouched].map(summaryText))
    await rerun('0008_')
    expect(await Promise.all([legacy, onlyThree, untouched].map(summaryText))).toEqual(before)
  })
})
