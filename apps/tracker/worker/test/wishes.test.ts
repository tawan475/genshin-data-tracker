import {
  PAIMON_CSV_HEADER,
  buildPaimonCsv,
  decodeWishChunk,
  fromBase64,
  isSyntheticWishId,
  parseWishFile,
  toBase64Url,
  type AccountCreatedResponse,
  type IrminsulTokenResponse,
  type UploadTarget,
  type AccountResponse,
  type ImportKeyResponse,
  type WishCursorResponse,
  type WishHistoryResponse,
  type WishImportResponse,
  type WishPull,
  type WishRecord,
} from '@gdt/shared'
import { env, SELF } from 'cloudflare:test'
import { sign } from 'hono/jwt'
import { describe, expect, it } from 'vitest'
import { randomToken } from '../lib/crypto'
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

/** An import key, or `{ bearer }`: a signed-in irminsul's access token. */
type Credential = string | { bearer: string }
const authOf = (credential: Credential): Record<string, string> =>
  typeof credential === 'string'
    ? { 'x-import-key': credential }
    : { authorization: `Bearer ${credential.bearer}` }

async function cursor(key: Credential, uid = UID) {
  const response = await SELF.fetch(`${ORIGIN}/api/wishes/cursor?uid=${uid}`, {
    headers: { ...authOf(key), 'x-diag-key': DIAG },
  })
  return { response, cost: costOf(response) }
}

async function sync(key: Credential, records: WishRecord[], body: Record<string, unknown> = {}) {
  const response = await SELF.fetch(`${ORIGIN}/api/wishes/import`, {
    method: 'POST',
    headers: { ...authOf(key), 'x-diag-key': DIAG, 'content-type': 'application/json' },
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
      newestTime: { '100': null, '200': null, '301': null, '302': null, '500': null },
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
    // The newest pull's time too, as the game's records write it (UTC+8 here).
    for (const banner of ['301', '302', '200', '100', '500'] as const) {
      expect(after.newestTime[banner]).toBe(newestFirst(banner)[0]!.time)
    }
  }, 60_000)

  it("answers the newest time on the account's server clock, in one read", async () => {
    const { importKey } = await setup()
    const banner = newestFirst('302')
    // Records on UTC (timezone 0) make the history's clock UTC; the server's is UTC+8.
    await ok((await sync(importKey, banner.slice(0, 50), { timezone: 0 })).response)
    const { response, cost } = await cursor(importKey)
    const body = await ok<WishCursorResponse>(response)
    const at = Date.parse(banner[0]!.time.replace(' ', 'T') + 'Z') + 8 * 3600_000
    expect(body.newestTime['302']).toBe(new Date(at).toISOString().slice(0, 19).replace('T', ' '))
    expect(body.newestTime['301']).toBeNull()
    expect(cost['round-trips']).toBe(1)
  }, 60_000)

  it('reads the newest time from the last chunk where it predates the column', async () => {
    const { importKey, account } = await setup()
    const banner = newestFirst('301')
    await ok((await sync(importKey, banner.slice(0, 700))).response)
    await env.DB.prepare('UPDATE wish_chunks SET newest_time = NULL WHERE account_id = ?1')
      .bind(account.id)
      .run()
    const { response, cost } = await cursor(importKey)
    const body = await ok<WishCursorResponse>(response)
    expect(body.newestTime['301']).toBe(banner[0]!.time)
    expect(cost['round-trips']).toBe(2)
    // An import that adds pulls writes the column again: back to one read.
    await ok((await sync(importKey, banner.slice(0, 702))).response)
    const healed = await cursor(importKey)
    expect(healed.cost['round-trips']).toBe(1)
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

  it("drops records of another UID; an account key's account takes the sync's UID", async () => {
    const { importKey, client, account } = await setup()
    const records = newestFirst('200').slice(0, 5)
    const mixed = [...records, { ...records[0]!, id: '1999999999999999999', uid: '822222222' }]
    const body = await ok<WishImportResponse>((await sync(importKey, mixed)).response)
    expect(body).toMatchObject({ added: 5, skipped: 1 })

    // Like its snapshots: the account picked is this data's, whatever UID it had.
    const moved = await cursor(importKey, '822222222')
    expect(moved.response.status).toBe(200)
    expect((await client.json<AccountResponse>(`/api/accounts/${account.id}`)).uid).toBe(
      '822222222',
    )
    expect((await sync(importKey, [], { uid: '822222222' })).response.status).toBe(200)

    // Unless another of the owner's accounts has that UID.
    await client.json<AccountCreatedResponse>('/api/accounts', {
      method: 'POST',
      json: { name: 'Alt', uid: '833333333' },
    })
    const clash = await cursor(importKey, '833333333')
    expect(clash.response.status).toBe(409)
    expect(await errorOf(clash.response)).toBe('uid_mismatch')
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
    expect(body.updatedAt).toBeGreaterThan(Date.now() - 60_000)
    const again = await client.fetch(`/api/accounts/${account.id}/wishes`, {
      headers: { 'if-none-match': etag },
    })
    expect(again.status).toBe(304)

    const pulls = [...(await stored(client, account.id)).values()].flat()
    expect(pulls.length).toBe(1500)

    const deleted = await client.fetch(`/api/accounts/${account.id}/wishes`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const empty = await client.json<WishHistoryResponse>(`/api/accounts/${account.id}/wishes`)
    expect(empty).toMatchObject({ timezone: null, chunks: [], updatedAt: null })
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

  it('lets a sync after a backup stop at its newest pull, replacing the boundary ten-pull', async () => {
    const { importKey, client, account } = await setup()
    const records = newestFirst('301')
    // A ten-pull (one second) with newer pulls after it, about 15 from the newest.
    let k = 10
    while (
      !(
        records[k - 1]!.time !== records[k]!.time &&
        records.slice(k, k + 10).every((r) => r.time === records[k]!.time) &&
        records[k + 10]!.time !== records[k]!.time
      )
    ) {
      k++
    }
    // The backup: everything up to that ten-pull, as paimon.moe writes it (no ids).
    const backup = records.slice(k)
    const pulls = await (async () => {
      await ok((await sync(importKey, backup)).response)
      const held = (await stored(client, account.id)).get(301)!
      await client.fetch(`/api/accounts/${account.id}/wishes`, { method: 'DELETE' })
      return held
    })()
    const file = parseWishFile(buildPaimonCsv(pulls))
    await ok(
      await client.fetch(`/api/accounts/${account.id}/wishes/import`, {
        method: 'POST',
        json: { records: file.accounts[0]!.records },
      }),
    )
    const before = await ok<WishCursorResponse>((await cursor(importKey)).response)
    expect(before.newest['301']).toBeNull()
    expect(before.newestTime['301']).toBe(records[k]!.time)

    // irminsul pages until a record older than that time: the newer pulls and the ten-pull.
    const page = records.filter((r) => r.time >= before.newestTime['301']!)
    expect(page.length).toBe(k + 10)
    const real = await ok<WishImportResponse>((await sync(importKey, page)).response)
    expect(real).toMatchObject({ added: k + 10, replaced: 10 })

    const after = (await stored(client, account.id)).get(301)!
    expect(after.length).toBe(records.length)
    // No duplicates: every record once, by time and name.
    const clock = (t: number) => new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' ')
    const sorted = (list: string[]) => [...list].sort()
    expect(sorted(after.map((p) => `${clock(p.time)}|${p.item.name}`))).toEqual(
      sorted(records.map((r) => `${r.time}|${r.name}`)),
    )
    const reals = after.filter((p) => !isSyntheticWishId(p.id))
    expect(reals.map((p) => p.id.toString()).sort()).toEqual(page.map((r) => r.id).sort())
    expect(after.filter((p) => isSyntheticWishId(p.id)).length).toBe(records.length - k - 10)
    const cursorAfter = await ok<WishCursorResponse>((await cursor(importKey)).response)
    expect(cursorAfter.newest['301']).toBe(records[0]!.id)
    expect(cursorAfter.newestTime['301']).toBe(records[0]!.time)
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

/** Signs irminsul in for `client`'s user (the /link page's Allow, then the code exchange). */
async function signIn(client: Client, upload: UploadTarget = { mode: 'uid' }) {
  const verifier = randomToken(32)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const redirect = 'http://127.0.0.1:53682/callback'
  const { redirect: back } = await client.json<{ redirect: string }>('/api/oauth/authorize', {
    method: 'POST',
    json: {
      client_id: 'irminsul',
      redirect_uri: redirect,
      state: 'state-0123456789abcdefghijklmnopqrstuvwxyz',
      code_challenge: toBase64Url(new Uint8Array(digest)),
      code_challenge_method: 'S256',
      device: 'GAMING-PC',
      upload,
    },
  })
  const response = await SELF.fetch(`${ORIGIN}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: 'irminsul',
      code: new URL(back).searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: redirect,
    }),
  })
  expect(response.status).toBe(200)
  return (await response.json()) as IrminsulTokenResponse
}

describe('wish sync signed in (Bearer)', () => {
  it("routes by the records' UID in uid mode, making the account, as uploads do", async () => {
    const { client } = await signUp()
    const tokens = await signIn(client)
    const bearer = { bearer: tokens.access_token }
    const before = await ok<WishCursorResponse>((await cursor(bearer)).response)
    expect(before.accountId).toBeNull()
    const records = newestFirst('302').slice(0, 25)
    const body = await ok<WishImportResponse>((await sync(bearer, records)).response)
    expect(body.added).toBe(25)
    const accounts = await client.json<AccountResponse[]>('/api/accounts')
    expect(accounts.map((a) => [a.id, a.uid])).toEqual([[body.accountId, UID]])
    const after = await cursor(bearer)
    expect((await ok<WishCursorResponse>(after.response)).newest['302']).toBe(records[0]!.id)
    // The newest ids; the owner lookup (session + accounts) is one more, as for a key.
    expect(after.cost['round-trips']).toBe(1)
    const again = await sync(bearer, records)
    expect(await ok<WishImportResponse>(again.response)).toMatchObject({ added: 0, known: 25 })
    expect(again.cost['round-trips']).toBe(1)
  })

  it("uploads to the session's one account in account mode, which takes another UID", async () => {
    const { client } = await signUp()
    const { account } = await client.json<AccountCreatedResponse>('/api/accounts', {
      method: 'POST',
      json: { name: 'Main', uid: UID, server: 'ASIA' },
    })
    const tokens = await signIn(client, { mode: 'account', account_id: account.id })
    const bearer = { bearer: tokens.access_token }
    const body = await ok<WishImportResponse>((await sync(bearer, history.slice(0, 10))).response)
    expect(body).toMatchObject({ accountId: account.id, added: 10 })
    const other = await sync(bearer, [], { uid: '822222222' })
    expect(other.response.status).toBe(200)
    expect((await client.json<AccountResponse>(`/api/accounts/${account.id}`)).uid).toBe(
      '822222222',
    )

    // Its account deleted: nowhere to go until another target is chosen.
    await client.fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    const gone = await sync(bearer, history.slice(0, 3))
    expect(gone.response.status).toBe(409)
    expect(await errorOf(gone.response)).toBe('upload_target_missing')
  })

  it('answers 401 token_expired and session_revoked, and refuses stopped users', async () => {
    const { client, me } = await signUp()
    const tokens = await signIn(client)
    const sid = Number(/^gdt_irt_(\d+)_/.exec(tokens.refresh_token)![1])
    const now = Math.floor(Date.now() / 1000)
    const claims = { sub: String(me.id), sid, ver: 0, typ: 'irminsul', aud: 'irminsul' }
    const expired = await sign({ ...claims, iat: now - 1000, exp: now - 10 }, env.JWT_SECRET)
    const late = await cursor({ bearer: expired })
    expect(late.response.status).toBe(401)
    expect(await errorOf(late.response)).toBe('token_expired')
    expect((await cursor({ bearer: 'not-a-token' })).response.status).toBe(401)

    await env.DB.prepare('UPDATE user_sessions SET revoked_at = ?2 WHERE id = ?1')
      .bind(sid, Date.now())
      .run()
    const ended = await sync({ bearer: tokens.access_token }, history.slice(0, 2))
    expect(ended.response.status).toBe(401)
    expect(await errorOf(ended.response)).toBe('session_revoked')

    const other = await signUp()
    const live = await signIn(other.client)
    await env.DB.prepare('UPDATE users SET uploads_blocked_at = 1 WHERE id = ?1')
      .bind(other.me.id)
      .run()
    const blocked = await sync({ bearer: live.access_token }, history.slice(0, 2))
    expect(blocked.response.status).toBe(403)
    expect(await errorOf(blocked.response)).toBe('uploads_blocked')
  })
})
