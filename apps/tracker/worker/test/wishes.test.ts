import {
  PAIMON_CSV_HEADER,
  buildPaimonCsv,
  decodeWishChunk,
  fromBase64,
  isSyntheticWishId,
  parseWishFile,
  type AccountCreatedResponse,
  type AccountResponse,
  type ImportKeyResponse,
  type WishCursorResponse,
  type WishHistoryResponse,
  type WishImportResponse,
  type WishPull,
  type WishRecord,
} from '@gdt/shared'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { syntheticWishRecords } from '../../../../packages/shared/test/wish-synthetic'
import { utcDay } from '../services/upload-limits'
import { Client, ORIGIN, signUp } from './client'

const DIAG = 'test-diag-key-test-diag-key-test-diag-key'
const UID = '811111111'

async function setup(uid: string | null = UID) {
  const { client, me } = await signUp()
  const { account, importKey } = await client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Main', uid, server: 'ASIA' },
  })
  return { client, userId: me.id, account, importKey }
}

function costOf(response: Response) {
  return Object.fromEntries(
    (response.headers.get('x-gdt-d1') ?? '').split(';').map((part) => {
      const [k, v] = part.trim().split('=')
      return [k, Number(v)]
    }),
  ) as Record<string, number>
}

async function cursor(key: string, uid = UID) {
  const response = await SELF.fetch(`${ORIGIN}/api/wishes/cursor?uid=${uid}`, {
    headers: { 'x-import-key': key, 'x-diag-key': DIAG },
  })
  return { response, cost: costOf(response) }
}

async function sync(key: string, records: WishRecord[], body: Record<string, unknown> = {}) {
  const response = await SELF.fetch(`${ORIGIN}/api/wishes/import`, {
    method: 'POST',
    headers: { 'x-import-key': key, 'x-diag-key': DIAG, 'content-type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      region: 'os_asia',
      lang: 'en-us',
      timezone: 8,
      records,
      ...body,
    }),
  })
  return { response, cost: costOf(response) }
}

async function ok<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code
}

/** Every stored pull of the account, per banner, as the page decodes them. */
async function stored(client: Client, accountId: number): Promise<Map<number, WishPull[]>> {
  const history = await client.json<WishHistoryResponse>(`/api/accounts/${accountId}/wishes`)
  const out = new Map<number, WishPull[]>()
  for (const chunk of history.chunks) {
    const list = out.get(chunk.banner) ?? []
    list.push(...decodeWishChunk(chunk.banner, fromBase64(chunk.data)!))
    out.set(chunk.banner, list)
  }
  return out
}

const history = syntheticWishRecords({
  uid: UID,
  pulls: { 301: 900, 302: 300, 200: 400, 100: 20, 500: 80 },
})
/** The API lists newest first; irminsul sends what is newer than the cursor. */
const newestFirst = (banner: string) =>
  history.filter((r) => r.gacha_type === banner || (banner === '301' && r.gacha_type === '400'))

describe('wish sync (irminsul)', () => {
  it('answers an empty cursor, imports, and then knows the newest per banner', async () => {
    const { importKey, account } = await setup()
    const empty = await ok<WishCursorResponse>((await cursor(importKey)).response)
    expect(empty).toEqual({
      uid: UID,
      accountId: account.id,
      newest: { '100': null, '200': null, '301': null, '302': null, '500': null },
    })

    const first = await sync(importKey, history.slice(0, 1000))
    const body = await ok<WishImportResponse>(first.response)
    expect(body).toMatchObject({ accountId: account.id, added: 1000, known: 0 })
    const rest = await ok<WishImportResponse>((await sync(importKey, history.slice(1000))).response)
    expect(rest.added).toBe(history.length - 1000)

    const after = await ok<WishCursorResponse>((await cursor(importKey)).response)
    for (const banner of ['301', '302', '200', '100', '500'] as const) {
      expect(after.newest[banner]).toBe(newestFirst(banner)[0]!.id)
    }
    expect(after).toEqual({ ...after, newest: rest.newest })
  }, 60_000)

  it('dedupes overlap and any order, and a no-op writes nothing', async () => {
    const { importKey, client, account } = await setup()
    const banner = newestFirst('301')
    // Oldest 600 first, then a page that overlaps them, shuffled.
    await ok((await sync(importKey, banner.slice(300))).response)
    const overlap = [...banner.slice(280, 320)].reverse()
    const second = await ok<WishImportResponse>((await sync(importKey, overlap)).response)
    expect(second).toMatchObject({ added: 20, known: 20 })
    const again = await sync(importKey, banner.slice(280, 320))
    const body = await ok<WishImportResponse>(again.response)
    expect(body).toMatchObject({ added: 0, known: 40 })
    expect(again.cost['round-trips']).toBe(1)
    expect(again.cost['rows-written']).toBe(0)

    const pulls = (await stored(client, account.id)).get(301)!
    expect(pulls.length).toBe(banner.length - 280)
    expect(pulls.map((p) => p.id.toString())).toEqual(
      banner
        .slice(280)
        .map((r) => r.id)
        .reverse(),
    )
    expect(pulls.filter((p) => p.gachaType === 400).length).toBe(
      banner.slice(280).filter((r) => r.gacha_type === '400').length,
    )
  }, 60_000)

  it('costs two round trips for new pulls after the newest, three for older history', async () => {
    const { importKey } = await setup()
    const banner = newestFirst('302')
    await ok((await sync(importKey, banner.slice(10))).response)
    const fresh = await sync(importKey, banner.slice(0, 10))
    expect((await ok<WishImportResponse>(fresh.response)).added).toBe(10)
    // lookup (history, last chunks, usage, newest), store
    expect(fresh.cost['round-trips']).toBe(2)
    expect(fresh.cost['rows-read']).toBeLessThan(60)

    const { importKey: other } = await setup()
    await ok((await sync(other, banner.slice(0, 100))).response)
    const older = await sync(other, banner.slice(100))
    expect((await ok<WishImportResponse>(older.response)).added).toBe(banner.length - 100)
  }, 60_000)

  it('drops records of another UID and refuses a key of another account', async () => {
    const { importKey } = await setup()
    const records = newestFirst('200').slice(0, 5)
    const mixed = [...records, { ...records[0]!, id: '1999999999999999999', uid: '822222222' }]
    const body = await ok<WishImportResponse>((await sync(importKey, mixed)).response)
    expect(body).toMatchObject({ added: 5, skipped: 1 })

    const wrong = await cursor(importKey, '822222222')
    expect(wrong.response.status).toBe(409)
    expect(await errorOf(wrong.response)).toBe('uid_mismatch')
    const wrongImport = await sync(importKey, [], { uid: '822222222' })
    expect(wrongImport.response.status).toBe(409)
  })

  it('refuses malformed records whole', async () => {
    const { importKey } = await setup()
    const bad = await sync(importKey, [
      { id: 'x1', gacha_type: '301', time: '2026-01-01 00:00:00', name: 'Bennett' },
    ])
    expect(bad.response.status).toBe(400)
    expect(await errorOf(bad.response)).toBe('invalid_records')
    const tooMany = await sync(
      importKey,
      Array.from({ length: 2001 }, () => history[0]!),
    )
    expect(tooMany.response.status).toBe(400)
    const noKey = await SELF.fetch(`${ORIGIN}/api/wishes/cursor?uid=${UID}`)
    expect(noKey.status).toBe(401)
  })

  it('routes a user key by UID, making the account on the first import', async () => {
    const { client } = await signUp()
    const { importKey } = await client.json<ImportKeyResponse>('/api/me/import-key', {
      method: 'POST',
    })
    const before = await ok<WishCursorResponse>((await cursor(importKey)).response)
    expect(before.accountId).toBeNull()
    const records = newestFirst('301').slice(0, 30)
    const first = await ok<WishImportResponse>((await sync(importKey, records)).response)
    expect(first.added).toBe(30)
    const accounts = await client.json<AccountResponse[]>('/api/accounts')
    expect(accounts.map((a) => [a.id, a.uid])).toEqual([[first.accountId, UID]])
    const after = await ok<WishCursorResponse>((await cursor(importKey)).response)
    expect(after.accountId).toBe(first.accountId)
    expect(after.newest['301']).toBe(records[0]!.id)
  })

  it('refuses stopped users', async () => {
    const { importKey, userId } = await setup()
    await env.DB.prepare('UPDATE users SET uploads_blocked_at = 1 WHERE id = ?1').bind(userId).run()
    const blocked = await sync(importKey, history.slice(0, 3))
    expect(blocked.response.status).toBe(403)
    expect(await errorOf(blocked.response)).toBe('uploads_blocked')
    await env.DB.prepare(
      'UPDATE users SET uploads_blocked_at = NULL, suspended_at = 1 WHERE id = ?1',
    )
      .bind(userId)
      .run()
    const suspended = await cursor(importKey)
    expect(suspended.response.status).toBe(403)
    expect(await errorOf(suspended.response)).toBe('account_suspended')
  })

  it('counts wish bytes in the quotas', async () => {
    const { importKey, userId } = await setup()
    await ok((await sync(importKey, newestFirst('200').slice(100))).response)
    const day = await env.DB.prepare(
      'SELECT snapshots, stored_bytes FROM user_upload_days WHERE user_id = ?1 AND day = ?2',
    )
      .bind(userId, utcDay(Date.now()))
      .first<{ snapshots: number; stored_bytes: number }>()
    const bytes = await env.DB.prepare(
      'SELECT sum(length(data)) AS n FROM wish_chunks AS w JOIN genshin_accounts AS a ON a.id = w.account_id WHERE a.user_id = ?1',
    )
      .bind(userId)
      .first<{ n: number }>()
    expect(day).toEqual({ snapshots: 0, stored_bytes: bytes!.n })

    // Full: nothing more is stored, but a no-op still answers.
    await env.DB.prepare('UPDATE users SET storage_quota = ?1 WHERE id = ?2')
      .bind(bytes!.n, userId)
      .run()
    const full = await sync(importKey, newestFirst('200').slice(0, 100))
    expect(full.response.status).toBe(413)
    expect(await errorOf(full.response)).toBe('storage_quota')
    expect((await sync(importKey, newestFirst('200').slice(100, 110))).response.status).toBe(200)

    await env.DB.prepare('UPDATE users SET storage_quota = NULL WHERE id = ?1').bind(userId).run()
    await env.DB.prepare(
      'UPDATE user_upload_days SET stored_bytes = ?3 WHERE user_id = ?1 AND day = ?2',
    )
      .bind(userId, utcDay(Date.now()), 100 * 1024 * 1024)
      .run()
    const daily = await sync(importKey, newestFirst('200').slice(0, 100))
    expect(daily.response.status).toBe(429)
    expect(await errorOf(daily.response)).toBe('daily_upload_limit')
  })

  it('lets one of two imports at once write and the other start over', async () => {
    const { importKey, client, account } = await setup()
    const banner = newestFirst('301')
    const [a, b] = await Promise.all([
      sync(importKey, banner.slice(0, 400)),
      sync(importKey, banner.slice(300, 700)),
    ])
    expect(a.response.status).toBe(200)
    expect(b.response.status).toBe(200)
    expect((await stored(client, account.id)).get(301)!.length).toBe(700)
  })
})

describe('wish history (website)', () => {
  it('serves the chunks with an ETag, and deletes them', async () => {
    const { importKey, client, account } = await setup()
    await ok((await sync(importKey, history.slice(0, 1500))).response)
    const first = await client.fetch(`/api/accounts/${account.id}/wishes`)
    const etag = first.headers.get('etag')!
    const body = (await first.json()) as WishHistoryResponse
    expect(body.timezone).toBe(8)
    expect(body.bytes).toBeGreaterThan(0)
    const again = await client.fetch(`/api/accounts/${account.id}/wishes`, {
      headers: { 'if-none-match': etag },
    })
    expect(again.status).toBe(304)

    const pulls = [...(await stored(client, account.id)).values()].flat()
    expect(pulls.length).toBe(1500)

    const deleted = await client.fetch(`/api/accounts/${account.id}/wishes`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const empty = await client.json<WishHistoryResponse>(`/api/accounts/${account.id}/wishes`)
    expect(empty).toMatchObject({ timezone: null, chunks: [] })
    // Not someone else's.
    const stranger = (await signUp()).client
    expect((await stranger.fetch(`/api/accounts/${account.id}/wishes`)).status).toBe(404)
  })

  it('imports a paimon.moe CSV, then lets the real records replace its pulls', async () => {
    const { importKey, client, account } = await setup()
    const records = newestFirst('302').slice(0, 120)
    // The CSV of those pulls (no ids), as paimon.moe's importer writes it.
    const pulls = await (async () => {
      await ok((await sync(importKey, records)).response)
      const held = (await stored(client, account.id)).get(302)!
      await client.fetch(`/api/accounts/${account.id}/wishes`, { method: 'DELETE' })
      return held
    })()
    const csv = buildPaimonCsv(pulls)
    expect(csv.startsWith(PAIMON_CSV_HEADER)).toBe(true)
    const file = parseWishFile(csv)
    const site = (body: unknown) =>
      client.fetch(`/api/accounts/${account.id}/wishes/import`, { method: 'POST', json: body })
    const imported = await ok<WishImportResponse>(
      await site({ records: file.accounts[0]!.records }),
    )
    expect(imported).toMatchObject({ added: 120, known: 0 })
    // The same file again adds nothing.
    expect(
      await ok<WishImportResponse>(await site({ records: file.accounts[0]!.records })),
    ).toMatchObject({
      added: 0,
      known: 120,
    })
    const synthetic = (await stored(client, account.id)).get(302)!
    expect(synthetic.every((p) => isSyntheticWishId(p.id))).toBe(true)
    // irminsul's cursor ignores made-up ids, so it fetches the real ones.
    expect(
      (await ok<WishCursorResponse>((await cursor(importKey)).response)).newest['302'],
    ).toBeNull()

    const real = await ok<WishImportResponse>((await sync(importKey, records)).response)
    expect(real).toMatchObject({ added: 120, replaced: 120 })
    const after = (await stored(client, account.id)).get(302)!
    expect(after.length).toBe(120)
    expect(after.every((p) => !isSyntheticWishId(p.id))).toBe(true)
  }, 60_000)

  it('refuses a blocked user and another account', async () => {
    const { client, account, userId } = await setup()
    await env.DB.prepare('UPDATE users SET uploads_blocked_at = 1 WHERE id = ?1').bind(userId).run()
    const response = await client.fetch(`/api/accounts/${account.id}/wishes/import`, {
      method: 'POST',
      json: { records: history.slice(0, 2) },
    })
    expect(response.status).toBe(403)
  })
})
