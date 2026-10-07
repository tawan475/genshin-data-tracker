import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { genshinAccounts, users } from '../db/schema'

const db = getDb(env.DB)

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

describe('migration 0017 (drop storage v1)', () => {
  /** The statements 0017 starts with: they fail while any snapshot row is still v1. */
  async function guard(): Promise<void> {
    const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0017_'))
    if (!migration) throw new Error('No migration 0017')
    const queries = migration.queries.filter((q) => q.includes('_storage_v1_guard'))
    expect(queries).toHaveLength(3)
    for (const query of queries) await env.DB.prepare(query).run()
  }

  it('refuses to run while a row that repack has not converted is left', async () => {
    await guard()
    const accountId = await seedAccount()
    // A row naming no v2 sections: what an unconverted v1 row looks like.
    const row = await env.DB.prepare(
      `INSERT INTO snapshots (account_id, taken_at, last_seen_at, created_at, raw_size, stored_size)
       VALUES (?1, 1, 1, 1, 1, 1) RETURNING id`,
    )
      .bind(accountId)
      .first<{ id: number }>()
    await expect(guard()).rejects.toThrow(/CHECK constraint failed/)
    await env.DB.prepare('DELETE FROM snapshots WHERE id = ?1').bind(row!.id).run()
    await guard()
  })
})

describe('migrations from 0018 on', () => {
  // Production holds real data. drizzle-kit rebuilds a table it cannot ALTER
  // (CREATE `__new_x`, copy, DROP x), and on D1 that DROP cascades into every
  // child row (`PRAGMA foreign_keys=OFF` is ignored there). From 0018 on a
  // migration only adds: tables, indexes, columns, and seed rows (0020's
  // built-in roles). One that truly needs more is hand-written (as 0003's
  // column swap was) and named in HAND_WRITTEN here, with its reason.
  const HAND_WRITTEN = new Set<string>()

  it('only create tables and indexes, add columns and seed rows, never rebuild or drop', () => {
    const later = env.TEST_MIGRATIONS.filter(
      (m) => Number(m.name.slice(0, 4)) >= 18 && !HAND_WRITTEN.has(m.name),
    )
    expect(later.map((m) => m.name)).toContain('0018_upload_limits.sql')
    for (const migration of later) {
      for (const query of migration.queries) {
        const sql = query.replace(/--.*$/gm, '')
        expect(sql, migration.name).not.toMatch(/\bDROP\b|__new_|\bRENAME\b/i)
        expect(sql.trim(), migration.name).toMatch(
          /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE `?\w+`? ADD\b|INSERT INTO\b)/i,
        )
      }
    }
  })
})
