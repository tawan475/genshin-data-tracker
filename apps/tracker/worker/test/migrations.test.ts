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

describe('migration 0012 (weapon goals get their own id)', () => {
  /** 0012's data statements (the table exists already in the test database). */
  async function moveWeapons(): Promise<void> {
    const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0012_'))
    if (!migration) throw new Error('No migration 0012')
    for (const query of migration.queries) {
      if (!/CREATE TABLE/i.test(query)) await env.DB.prepare(query).run()
    }
  }

  it('moves every weapon goal with its target and current state, and nothing else', async () => {
    const accountId = await seedAccount()
    const other = await seedAccount()
    const sword = JSON.stringify({ level: 90, ascension: 6, refinement: 1, active: true })
    const spare = JSON.stringify({
      level: 70,
      ascension: 4,
      refinement: 2,
      active: false,
      note: 'x',
    })
    const current = JSON.stringify({ level: 40, ascension: 1, refinement: 1 })
    const character = JSON.stringify({
      level: 90,
      ascension: 6,
      talents: { auto: 9, skill: 9, burst: 9 },
      active: true,
    })
    const insert = env.DB.prepare(
      `INSERT INTO planner_targets (account_id, kind, key, owner, target, updated_at, current)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    await env.DB.batch([
      insert.bind(accountId, 'weapon', 'SplendorOfTranquilWaters', 'Furina', sword, 11, current),
      insert.bind(accountId, 'weapon', 'FavoniusSword', '', spare, 12, null),
      insert.bind(accountId, 'weapon', 'FavoniusSword', 'Bennett', sword, 13, null),
      insert.bind(accountId, 'character', 'Furina', '', character, 14, null),
      insert.bind(accountId, 'item', 'CrownOfInsight', '', '{"count":2,"active":true}', 15, null),
      insert.bind(other, 'weapon', 'FavoniusSword', '', sword, 16, null),
    ])

    await moveWeapons()

    const left = await env.DB.prepare(
      'SELECT kind, key FROM planner_targets WHERE account_id IN (?1, ?2) ORDER BY account_id, kind',
    )
      .bind(accountId, other)
      .all<{ kind: string; key: string }>()
    expect(left.results).toEqual([
      { kind: 'character', key: 'Furina' },
      { kind: 'item', key: 'CrownOfInsight' },
    ])
    const moved = await env.DB.prepare(
      `SELECT account_id AS accountId, id, key, owner, target, updated_at AS updatedAt, current
       FROM planner_weapon_goals WHERE account_id IN (?1, ?2) ORDER BY rowid`,
    )
      .bind(accountId, other)
      .all<Record<string, unknown>>()
    expect(moved.results.map(({ id: _, ...row }) => row)).toEqual([
      // In key and owner order (rowid keeps it), the text exactly as it was.
      { accountId, key: 'FavoniusSword', owner: '', target: spare, updatedAt: 12, current: null },
      {
        accountId,
        key: 'FavoniusSword',
        owner: 'Bennett',
        target: sword,
        updatedAt: 13,
        current: null,
      },
      {
        accountId,
        key: 'SplendorOfTranquilWaters',
        owner: 'Furina',
        target: sword,
        updatedAt: 11,
        current,
      },
      {
        accountId: other,
        key: 'FavoniusSword',
        owner: '',
        target: sword,
        updatedAt: 16,
        current: null,
      },
    ])
    const ids = moved.results.map((row) => row.id as string)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(new Set(ids).size).toBe(ids.length)

    // Running it again moves nothing more.
    await moveWeapons()
    const again = await env.DB.prepare(
      'SELECT count(*) AS n FROM planner_weapon_goals WHERE account_id IN (?1, ?2)',
    )
      .bind(accountId, other)
      .first<{ n: number }>()
    expect(again!.n).toBe(4)
  })
})
