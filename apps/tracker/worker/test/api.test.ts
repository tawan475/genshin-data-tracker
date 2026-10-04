import {
  catalogFromRows,
  decodeSnapshot,
  inflateBundle,
  readBundle,
  storedSnapshotOf,
  type AccountCreatedResponse,
  type AccountResponse,
  type CatalogRow,
  type Good,
  type ImportKeyResponse,
  type ImportResponse,
  type MeResponse,
  type SnapshotResponse,
  type VerifyKeyResponse,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { env, SELF } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { genshinAccounts, users } from '../db/schema'
import { ApiError } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { hashPassword } from '../lib/password'
import { accountForUid } from '../services/accounts'
import { Client, ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

async function createAccount(client: Client) {
  return client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Main', uid: '812345678', server: 'ASIA' },
  })
}

function importByKey(key: string, good: unknown, timestamp?: number) {
  return SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
    method: 'POST',
    headers: { 'x-import-key': key },
    body: irminsulForm(good, timestamp),
  })
}

/** JSON with object keys sorted, so field order never affects a comparison. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )
}

/** Order-insensitive view of a GOOD file for comparisons. */
function canonical(good: Good) {
  const sorted = (items: unknown[]) => items.map(stableStringify).sort()
  return {
    ...good,
    characters: sorted(good.characters),
    artifacts: sorted(good.artifacts),
    weapons: sorted(good.weapons),
    materials: Object.fromEntries(Object.entries(good.materials).sort()),
  }
}

describe('auth', () => {
  it('registers, reads /me, and refuses a duplicate name', async () => {
    const { client, username, me } = await signUp()
    expect(me.username).toBe(username)
    expect(me.settings).toEqual({ theme: 'system', use24Hour: false })
    expect((await client.json<{ id: number }>('/api/auth/me')).id).toBe(me.id)

    const again = await new Client().fetch('/api/auth/register', {
      method: 'POST',
      json: { username: username.toUpperCase(), password: 'another long password' },
    })
    expect(again.status).toBe(409)
  })

  it('registers without an email, keeps email unique when given, and logs in by email', async () => {
    const password = 'correct horse battery staple'
    const register = (username: string, email?: string | null) =>
      new Client().fetch('/api/auth/register', {
        method: 'POST',
        json: { username, ...(email === undefined ? {} : { email }), password },
      })
    const tag = crypto.randomUUID().slice(0, 8)

    // Several users may have no email: NULLs do not collide in the unique index.
    for (const [name, email] of [
      [`noemail-a${tag}`],
      [`noemail-b${tag}`, null],
      [`noemail-c${tag}`, ''],
    ] as const) {
      const response = await register(name, email)
      expect(response.status).toBe(201)
      expect(((await response.json()) as { email: string | null }).email).toBeNull()
    }

    const email = `Shared${tag}@Example.com`
    expect((await register(`mail-a${tag}`, email)).status).toBe(201)
    expect((await register(`mail-b${tag}`, email.toLowerCase())).status).toBe(409)
    expect((await register(`mail-c${tag}`, 'not-an-email')).status).toBe(400)

    const login = await new Client().fetch('/api/auth/login', {
      method: 'POST',
      json: { login: email, password },
    })
    expect(login.status).toBe(200)
    expect(((await login.json()) as { username: string }).username).toBe(`mail-a${tag}`)
  })

  it('stores an Argon2id hash and refuses wrong and unknown logins alike', async () => {
    const { username, password, me } = await signUp()
    const [row] = await getDb(env.DB)
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, me.id))
    expect(row!.passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    )

    const client = new Client()
    const attempt = (login: string, pass: string) =>
      client.fetch('/api/auth/login', { method: 'POST', json: { login, password: pass } })
    const wrong = await attempt(username, 'nope nope nope')
    const unknown = await attempt(`nobody-${crypto.randomUUID()}`, password)
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await unknown.json()).toEqual(await wrong.json())

    expect((await attempt(username.toUpperCase(), password)).status).toBe(200)
    expect((await client.fetch('/api/auth/me')).status).toBe(200)
  })

  it('upgrades a hash made under older Argon2 parameters at login', async () => {
    const { username, password, me } = await signUp()
    const db = getDb(env.DB)
    const stored = async () =>
      (await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id)))[0]!
        .hash
    await db
      .update(users)
      .set({ passwordHash: hashPassword(password, env.PASSWORD_PEPPER, { m: 1024, t: 1, p: 1 }) })
      .where(eq(users.id, me.id))
    expect(await stored()).toMatch(/^\$argon2id\$v=19\$m=1024,t=1,p=1\$/)

    const login = await new Client().fetch('/api/auth/login', {
      method: 'POST',
      json: { login: username, password },
    })
    expect(login.status).toBe(200)
    expect(await stored()).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('changes the username and email without asking for the password', async () => {
    const { client, username, password } = await signUp()
    const update = (json: object) => client.fetch('/api/auth/profile', { method: 'PATCH', json })
    const code = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code
    const tag = crypto.randomUUID().slice(0, 8)

    expect((await update({})).status).toBe(400)

    const renamed = await update({
      username: `Renamed${tag}`,
      email: `New${tag}@Example.com`,
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({
      username: `Renamed${tag}`,
      email: `new${tag}@example.com`,
      emailVerified: false,
    })

    // The new names log in; the old username no longer does.
    const login = (name: string) =>
      new Client().fetch('/api/auth/login', { method: 'POST', json: { login: name, password } })
    expect((await login(username)).status).toBe(401)
    expect((await login(`renamed${tag}`)).status).toBe(200)
    expect((await login(`new${tag}@example.com`)).status).toBe(200)

    // An empty email removes it.
    const cleared = await update({ email: '' })
    expect(((await cleared.json()) as { email: string | null }).email).toBeNull()

    // Someone else's names are refused, saying which one.
    const other = await signUp()
    const takenName = await update({
      username: other.username.toUpperCase(),
    })
    expect(takenName.status).toBe(409)
    expect(await code(takenName)).toBe('username_taken')
    const takenEmail = await update({
      email: `${other.username}@example.com`,
    })
    expect(takenEmail.status).toBe(409)
    expect(await code(takenEmail)).toBe('email_taken')
  })

  it('requires the CSRF header on state-changing requests', async () => {
    const { client } = await signUp()
    const response = await SELF.fetch(`${ORIGIN}/api/accounts`, {
      method: 'POST',
      headers: { cookie: `gdt_at=${client.cookie('gdt_at')}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(403)
  })

  it('refreshes with JWTs that cannot stand in for each other', async () => {
    const { client } = await signUp()
    const access = client.cookie('gdt_at')!
    const refresh = client.cookie('gdt_rt')!
    expect(access.split('.')).toHaveLength(3)
    expect(refresh.split('.')).toHaveLength(3)

    expect((await client.fetch('/api/auth/refresh', { method: 'POST' })).status).toBe(204)
    expect((await client.fetch('/api/auth/me')).status).toBe(200)

    const send = (path: string, cookie: string) =>
      SELF.fetch(`${ORIGIN}${path}`, {
        method: path.endsWith('/me') ? 'GET' : 'POST',
        headers: { cookie, 'x-gdt-csrf': '1' },
      })
    expect((await send('/api/auth/me', `gdt_at=${refresh}`)).status).toBe(401)
    expect((await send('/api/auth/refresh', `gdt_rt=${access}`)).status).toBe(401)
    const forged = refresh.replace(/[^.]+$/, 'A'.repeat(43))
    expect((await send('/api/auth/refresh', `gdt_rt=${forged}`)).status).toBe(401)
  })

  it('signs out one device, revokes others on a password change, and signs out everywhere', async () => {
    const { client: phone, username, password } = await signUp()
    const signIn = async (pass = password) => {
      const device = new Client()
      const response = await device.fetch('/api/auth/login', {
        method: 'POST',
        json: { login: username, password: pass },
      })
      return { device, status: response.status }
    }
    const refresh = (device: Client) =>
      device.fetch('/api/auth/refresh', { method: 'POST' }).then((r) => r.status)
    const { device: laptop } = await signIn()

    // Signing the phone out leaves the laptop signed in.
    expect((await phone.fetch('/api/auth/logout', { method: 'POST' })).status).toBe(204)
    expect(phone.cookie('gdt_s')).toBeUndefined()
    expect((await phone.fetch('/api/auth/me')).status).toBe(401)
    expect(await refresh(laptop)).toBe(204)

    // A password change ends every other device; this one stays signed in.
    const { device: tablet } = await signIn()
    const newPassword = 'a brand new passphrase'
    const change = (currentPassword: string) =>
      laptop.fetch('/api/auth/password', {
        method: 'POST',
        json: { currentPassword, newPassword },
      })
    expect((await change('wrong wrong wrong')).status).toBe(401)
    expect((await change(password)).status).toBe(204)
    expect(await refresh(tablet)).toBe(401)
    expect(await refresh(laptop)).toBe(204)
    expect((await signIn()).status).toBe(401)
    expect((await signIn(newPassword)).status).toBe(200)

    // Signing out everywhere also kills copies of a refresh token.
    const copied = laptop.cookie('gdt_rt')!
    expect((await laptop.fetch('/api/auth/logout-all', { method: 'POST' })).status).toBe(204)
    expect(laptop.cookie('gdt_rt')).toBeUndefined()
    const replay = await SELF.fetch(`${ORIGIN}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `gdt_rt=${copied}` },
    })
    expect(replay.status).toBe(401)
  })
})

describe('accounts and imports', () => {
  it('verifies an import key the way irminsul reads it', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const response = await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/verify-key`, {
      headers: { 'x-import-key': importKey },
    })
    expect(await response.json()).toEqual<VerifyKeyResponse>({
      accountId: account.id,
      accountName: 'Main',
      uid: '812345678',
      server: 'ASIA',
      dashboardUrl: `${ORIGIN}/app/a/${account.id}`,
      scope: 'account',
    })
    const bad = await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/verify-key`, {
      headers: { 'x-import-key': 'gdt_ik_wrong' },
    })
    expect(bad.status).toBe(401)
  })

  it('imports, dedupes re-uploads, and reconstructs the exact file', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const good = sampleGood()

    const first = await importByKey(importKey, good, 1_780_000_000_000)
    expect(first.status).toBe(201)
    const created = (await first.json()) as ImportResponse
    expect(created.status).toBe('created')

    // Same capture uploaded again (irminsul retry): a no-op, same snapshot.
    const retry = (await (
      await importByKey(importKey, good, 1_780_000_000_000)
    ).json()) as ImportResponse
    expect(retry).toMatchObject({ status: 'unchanged', snapshotId: created.snapshotId })

    // Same capture time, different inventory: refused.
    const conflict = await importByKey(
      importKey,
      sampleGood({ materials: { Mora: 1 } }),
      1_780_000_000_000,
    )
    expect(conflict.status).toBe(409)

    // Identical inventory captured later: only last-seen moves.
    const later = (await (
      await importByKey(importKey, good, 1_780_000_100_000)
    ).json()) as ImportResponse
    expect(later).toMatchObject({ status: 'unchanged', snapshotId: created.snapshotId })

    // A real change: stored as a new snapshot.
    const changed = sampleGood({ materials: { ...good.materials, Mora: 2_000_000 } })
    const second = (await (
      await importByKey(importKey, changed, 1_780_000_200_000)
    ).json()) as ImportResponse
    expect(second.status).toBe('created')

    const snapshots = await client.json<SnapshotResponse[]>(`/api/accounts/${account.id}/snapshots`)
    expect(snapshots.map((s) => s.id)).toEqual([second.snapshotId, created.snapshotId])
    expect(snapshots[1]!.lastSeenAt).toBe(1_780_000_100_000)
    expect(snapshots[0]!.summary).toMatchObject({ mora: 2_000_000, primogem: 16_000, artifact3: 1 })

    const summary = await client.json<AccountResponse>(`/api/accounts/${account.id}`)
    expect(summary).toMatchObject({ snapshotCount: 2, latest: { id: second.snapshotId } })
    expect(summary.storedBytes).toBeGreaterThan(0)

    // Server-side GOOD export of the first snapshot.
    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${created.snapshotId}/good`,
    )
    expect(canonical(exported)).toEqual(canonical({ ...good, timestamp: 1_780_000_000_000 }))

    // Browser-side export: bundle + catalog decode to the same files.
    const bundleResponse = await client.fetch(`/api/accounts/${account.id}/bundle`)
    const { manifest, blobs } = readBundle(await bundleResponse.arrayBuffer())
    const texts = await inflateBundle(blobs)
    const catalog = catalogFromRows(
      await client.json<CatalogRow[]>(`/api/accounts/${account.id}/catalog`),
    )
    const decoded = manifest.snapshots.map((s) =>
      decodeSnapshot(
        storedSnapshotOf(s, (hash) => texts.get(hash)!),
        catalog,
        MATERIALS,
      ),
    )
    expect(decoded.map(canonical)).toEqual([
      canonical({ ...good, timestamp: 1_780_000_000_000 }),
      canonical({ ...changed, timestamp: 1_780_000_200_000 }),
    ])
    // The second snapshot shares every section but materials, which is a delta.
    expect(manifest.snapshots[1]!.materials).not.toBe(manifest.snapshots[1]!.materialsKeyframe)
    expect(manifest.snapshots[1]!.characters).toBe(manifest.snapshots[0]!.characters)
  })

  it("stores irminsul's extra keys, each section shared on its own, and exports them", async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const good = sampleGood(sampleExtras())
    const first = (await (await importByKey(importKey, good, 1_000)).json()) as ImportResponse
    expect(first.status).toBe('created')
    expect(first).not.toHaveProperty('warnings')

    // Same inventory at a later login: only gi_player moved, which is a new
    // snapshot sharing every other section.
    const extras = sampleExtras()
    const relogin = sampleGood({ ...extras, gi_player: { ...extras.gi_player, resin: 160 } })
    const second = (await (await importByKey(importKey, relogin, 2_000)).json()) as ImportResponse
    expect(second.status).toBe('created')

    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${first.snapshotId}/good`,
    )
    expect(canonical(exported)).toEqual(canonical({ ...good, timestamp: 1_000 }))
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_player?.resin).toBe(160)

    const { manifest, blobs } = readBundle(
      await (await client.fetch(`/api/accounts/${account.id}/bundle`)).arrayBuffer(),
    )
    const [a, b] = manifest.snapshots
    expect(b!.player).not.toBe(a!.player)
    expect(b!.achievementTimes).toBe(a!.achievementTimes)
    expect(b!.characterExtras).toBe(a!.characterExtras)
    expect(b!.characters).toBe(a!.characters)
    const texts = await inflateBundle(blobs)
    const catalog = catalogFromRows(
      await client.json<CatalogRow[]>(`/api/accounts/${account.id}/catalog`),
    )
    expect(
      canonical(
        decodeSnapshot(
          storedSnapshotOf(b!, (h) => texts.get(h)!),
          catalog,
          MATERIALS,
        ),
      ),
    ).toEqual(canonical({ ...relogin, timestamp: 2_000 }))

    // A bundle of just the player sections.
    const players = readBundle(
      await (
        await client.fetch(`/api/accounts/${account.id}/bundle?sections=player`)
      ).arrayBuffer(),
    )
    expect(players.manifest.blobs.sort()).toEqual([a!.player, b!.player].sort())
  })

  it('keeps re-uploading a capture a no-op when it was first stored without the extras', async () => {
    const { client } = await signUp()
    const { importKey } = await createAccount(client)
    // As the tracker stored irminsul's files before it kept the extra keys.
    const created = (await (
      await importByKey(importKey, sampleGood(), 1_000)
    ).json()) as ImportResponse
    const again = await importByKey(importKey, sampleGood(sampleExtras()), 1_000)
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({
      status: 'unchanged',
      snapshotId: created.snapshotId,
    })
  })

  it("warns, and still stores the file, when its UID is not the account's", async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const other = await importByKey(importKey, sampleGood(sampleExtras(813152114)), 1_000)
    expect(other.status).toBe(201)
    const body = (await other.json()) as ImportResponse
    expect(body.warnings).toEqual([
      { code: 'uid_mismatch', message: expect.stringContaining('UID 813152114') },
    ])

    const own = (await (
      await importByKey(importKey, sampleGood(sampleExtras(812345678)), 2_000)
    ).json()) as ImportResponse
    expect(own.status).toBe('created')
    expect(own).not.toHaveProperty('warnings')
    // The account's UID is never changed by an upload.
    expect((await client.json<AccountResponse>(`/api/accounts/${account.id}`)).uid).toBe(
      '812345678',
    )

    // An account without a UID has nothing to compare.
    const alt = await client.json<AccountCreatedResponse>('/api/accounts', {
      method: 'POST',
      json: { name: 'Alt' },
    })
    const unset = (await (
      await importByKey(alt.importKey, sampleGood(sampleExtras(813152114)), 1_000)
    ).json()) as ImportResponse
    expect(unset.status).toBe('created')
    expect(unset).not.toHaveProperty('warnings')
  })

  it('revalidates derived views with ETags until the data changes', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const first = await client.fetch(`/api/accounts/${account.id}/snapshots`)
    const etag = first.headers.get('etag')!
    const again = await client.fetch(`/api/accounts/${account.id}/snapshots`, {
      headers: { 'if-none-match': etag },
    })
    expect(again.status).toBe(304)
    // A list cached in the pre-0008 shape (ETag without the format) is sent again.
    const oldShape = etag.replace(/\.snapshots\.\d+"$/, '.snapshots"')
    expect(oldShape).not.toBe(etag)
    const refetched = await client.fetch(`/api/accounts/${account.id}/snapshots`, {
      headers: { 'if-none-match': oldShape },
    })
    expect(refetched.status).toBe(200)
    await importByKey(importKey, sampleGood())
    const after = await client.fetch(`/api/accounts/${account.id}/snapshots`, {
      headers: { 'if-none-match': etag },
    })
    expect(after.status).toBe(200)
  })

  it('accepts a gzipped upload and refuses oversized ones', async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const gzipped = await new Response(
      new Blob([JSON.stringify(sampleGood())]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()
    const ok = await client.fetch(`/api/accounts/${account.id}/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      body: gzipped,
    })
    expect(ok.status).toBe(201)

    const huge = await client.fetch(`/api/accounts/${account.id}/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(11 * 1024 * 1024),
    })
    expect(huge.status).toBe(413)
  })

  it('rejects malformed files with a clear error', async () => {
    const { importKey } = await createAccount((await signUp()).client)
    const response = await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': importKey },
      body: (() => {
        const form = new FormData()
        form.set('file', new File(['{not json'], 'x.json', { type: 'application/json' }))
        return form
      })(),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_json' } })

    const notGood = await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': importKey },
      body: irminsulForm({ hello: 'world' }),
    })
    expect(notGood.status).toBe(400)
    expect(await notGood.json()).toMatchObject({ error: { code: 'invalid_good' } })
  })

  it('soft-deletes snapshots and recomputes the account', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const a = (await (await importByKey(importKey, sampleGood(), 1_000)).json()) as ImportResponse
    const b = (await (
      await importByKey(importKey, sampleGood({ materials: { Mora: 5 } }), 2_000)
    ).json()) as ImportResponse
    expect((await client.json<AccountResponse>(`/api/accounts/${account.id}`)).latest?.id).toBe(
      b.snapshotId,
    )

    const response = await client.fetch(`/api/accounts/${account.id}/snapshots/${b.snapshotId}`, {
      method: 'DELETE',
    })
    expect(response.status).toBe(204)
    const after = await client.json<AccountResponse>(`/api/accounts/${account.id}`)
    expect(after).toMatchObject({ snapshotCount: 1, latest: { id: a.snapshotId } })

    const bulk = await client.json<{ deleted: number }>(
      `/api/accounts/${account.id}/snapshots/delete`,
      { method: 'POST', json: { ids: [a.snapshotId, 999_999] } },
    )
    expect(bulk.deleted).toBe(1)
  })

  it('keeps accounts private to their owner', async () => {
    const owner = await signUp()
    const { account } = await createAccount(owner.client)
    const stranger = await signUp()
    for (const path of ['', '/snapshots', '/catalog', '/bundle', '/settings']) {
      const response = await stranger.client.fetch(`/api/accounts/${account.id}${path}`)
      expect(response.status, path).toBe(404)
    }
    expect(await stranger.client.json<unknown[]>('/api/accounts')).toEqual([])
  })

  it('stores account settings as a patch over the defaults', async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const { settings } = await client.json<{ settings: { materialsGraph: unknown } }>(
      `/api/accounts/${account.id}/settings`,
      { method: 'PATCH', json: { materialsGraph: { groupBy: 'month' } } },
    )
    expect(settings.materialsGraph).toEqual({
      selectedKeys: ['Mora', 'Primogem'],
      groupBy: 'month',
      limit: 365,
    })
  })

  it("stores the Traveler's twin, Lumine by default", async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const path = `/api/accounts/${account.id}/settings`
    const before = await client.json<{ settings: { traveler: string } }>(path)
    expect(before.settings.traveler).toBe('F')
    const after = await client.json<{ settings: { traveler: string; materialsGraph: unknown } }>(
      path,
      { method: 'PATCH', json: { traveler: 'M' } },
    )
    expect(after.settings.traveler).toBe('M')
    expect(after.settings.materialsGraph).toBeTruthy()
    const bad = await client.fetch(path, { method: 'PATCH', json: { traveler: 'X' } })
    expect(bad.status).toBe(400)
  })
})

describe('user import key', () => {
  async function newUserKey(client: Client) {
    return (await client.json<ImportKeyResponse>('/api/me/import-key', { method: 'POST' }))
      .importKey
  }

  function verify(key: string) {
    return SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/verify-key`, {
      headers: { 'x-import-key': key },
    })
  }

  /** A capture of `uid`, as irminsul ≥ d7c2bda uploads it. */
  const capture = (uid: number, overrides: Partial<Good> = {}) =>
    sampleGood({ ...sampleExtras(uid), ...overrides })

  async function upload(key: string, good: unknown, timestamp: number) {
    const response = await importByKey(key, good, timestamp)
    return { status: response.status, body: (await response.json()) as ImportResponse }
  }

  it('is made, replaced and revoked by its user, and verifies as all accounts', async () => {
    const { client, username } = await signUp()
    expect((await client.json<MeResponse>('/api/auth/me')).hasImportKey).toBe(false)

    const first = await newUserKey(client)
    expect(first).toMatch(/^gdt_uk_/)
    expect((await client.json<MeResponse>('/api/auth/me')).hasImportKey).toBe(true)
    expect(await (await verify(first)).json()).toEqual<VerifyKeyResponse>({
      accountId: null,
      accountName: `${username} · all accounts`,
      uid: null,
      server: null,
      dashboardUrl: `${ORIGIN}/app`,
      scope: 'user',
    })

    // A new key replaces the old one at once.
    const second = await newUserKey(client)
    expect(second).not.toBe(first)
    expect((await verify(first)).status).toBe(401)
    expect((await verify(second)).status).toBe(200)

    const revoked = await client.fetch('/api/me/import-key', { method: 'DELETE' })
    expect(revoked.status).toBe(204)
    expect((await verify(second)).status).toBe(401)
    expect((await importByKey(second, capture(812345678), 1_000)).status).toBe(401)
    expect((await client.json<MeResponse>('/api/auth/me')).hasImportKey).toBe(false)

    // Only a signed-in user has one.
    const anonymous = await new Client().fetch('/api/me/import-key', { method: 'POST' })
    expect(anonymous.status).toBe(401)
  })

  it("routes each upload to the account with the capture's UID, making new ones", async () => {
    const { client } = await signUp()
    const { account: main } = await createAccount(client) // UID 812345678, ASIA
    const key = await newUserKey(client)

    const own = await upload(key, capture(812345678), 1_000)
    expect(own.status).toBe(201)
    expect(own.body).toMatchObject({
      status: 'created',
      account: { id: main.id, name: 'Main', uid: '812345678', created: false },
    })
    expect(own.body).not.toHaveProperty('warnings')

    // A UID the user has no account for: a new account, named by nothing.
    const europe = await upload(key, capture(712345678), 1_000)
    expect(europe.status).toBe(201)
    expect(europe.body.account).toMatchObject({ name: null, uid: '712345678', created: true })
    const again = await upload(key, capture(712345678, { materials: { Mora: 1 } }), 2_000)
    expect(again.body.account).toEqual({ ...europe.body.account, created: false })

    // The server is read off the UID: ten digits put it second; China is unknown.
    await upload(key, capture(1812345678), 1_000)
    await upload(key, capture(112345678), 1_000)

    const list = await client.json<AccountResponse[]>('/api/accounts')
    expect(list.map((a) => [a.uid, a.name, a.server, a.snapshotCount])).toEqual([
      ['812345678', 'Main', 'ASIA', 1],
      ['712345678', null, 'EUROPE', 2],
      ['1812345678', null, 'ASIA', 1],
      ['112345678', null, null, 1],
    ])
    expect(list[1]!.id).toBe(europe.body.account!.id)

    // The made account is an ordinary one, with a key of its own to rotate.
    const rotated = await client.json<ImportKeyResponse>(
      `/api/accounts/${europe.body.account!.id}/import-key`,
      { method: 'POST' },
    )
    expect(await (await verify(rotated.importKey)).json()).toMatchObject({
      accountId: europe.body.account!.id,
      uid: '712345678',
      scope: 'account',
    })
  })

  it("never reaches another user's accounts", async () => {
    const other = await signUp()
    const { account: theirs } = await createAccount(other.client) // UID 812345678
    const { client } = await signUp()
    const key = await newUserKey(client)

    const result = await upload(key, capture(812345678), 1_000)
    expect(result.body.account).toMatchObject({ uid: '812345678', created: true })
    expect(result.body.account!.id).not.toBe(theirs.id)
    const untouched = await other.client.json<AccountResponse>(`/api/accounts/${theirs.id}`)
    expect(untouched.snapshotCount).toBe(0)
  })

  it('needs a UID in the file, and makes nothing without one', async () => {
    const { client } = await signUp()
    const key = await newUserKey(client)
    const response = await importByKey(key, sampleGood(), 1_000)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'uid_required', message: expect.stringContaining("account's own import key") },
    })
    expect(await client.json<AccountResponse[]>('/api/accounts')).toEqual([])
  })

  it('stops making accounts at the limit, but still routes to existing ones', async () => {
    const { client } = await signUp()
    const key = await newUserKey(client)
    for (let n = 0; n < 20; n++) {
      expect((await upload(key, capture(800_000_000 + n), 1_000)).status).toBe(201)
    }
    const refused = await importByKey(key, capture(899_999_999), 1_000)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ error: { code: 'account_limit' } })
    expect(await client.json<AccountResponse[]>('/api/accounts')).toHaveLength(20)
    const existing = await upload(key, capture(800_000_005, { materials: { Mora: 1 } }), 2_000)
    expect(existing.body.account).toMatchObject({ uid: '800000005', created: false })
  })

  it('makes one account when two first uploads of a UID race', async () => {
    const { client } = await signUp()
    const key = await newUserKey(client)
    const results = await Promise.all([
      upload(key, capture(912345678), 1_000),
      upload(key, capture(912345678, { materials: { Mora: 1 } }), 2_000),
    ])
    expect(results.map((r) => r.status)).toEqual([201, 201])
    expect(new Set(results.map((r) => r.body.account!.id)).size).toBe(1)
    expect(results.filter((r) => r.body.account!.created)).toHaveLength(1)
    const list = await client.json<AccountResponse[]>('/api/accounts')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ uid: '912345678', server: 'SAR', snapshotCount: 2 })

    // The losing side of the race, for certain: both callers saw no account.
    const { me } = await signUp()
    const make = () => accountForUid(env.DB, new D1Meter(), me.id, '612345678', [])
    const [a, b] = await Promise.all([make(), make()])
    expect(a.account.id).toBe(b.account.id)
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect((await make()).created).toBe(false)
  })

  it('refuses to guess between accounts that share a UID', async () => {
    // The unique index rules this out; the route still never picks one.
    const { me } = await signUp()
    const twins = [
      { id: 1, name: 'A', uid: '812345678', server: null },
      { id: 2, name: 'B', uid: ' 812345678 ', server: null },
    ]
    const attempt = accountForUid(env.DB, new D1Meter(), me.id, '812345678', twins)
    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await expect(attempt).rejects.toMatchObject({ status: 409, code: 'ambiguous_uid' })
  })

  it("leaves account keys as they were: the key's account, whatever the UID", async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    await newUserKey(client)
    const result = await upload(importKey, capture(712345678), 1_000)
    expect(result.status).toBe(201)
    expect(result.body.account).toEqual({
      id: account.id,
      name: 'Main',
      uid: '812345678',
      created: false,
    })
    expect(result.body.warnings).toEqual([expect.objectContaining({ code: 'uid_mismatch' })])
    // A file without a UID is fine on an account key.
    expect((await upload(importKey, sampleGood(), 2_000)).status).toBe(201)
    expect(await client.json<AccountResponse[]>('/api/accounts')).toHaveLength(1)
  })

  it('keeps one account per UID per user', async () => {
    const { client, me } = await signUp()
    const { account: main } = await createAccount(client) // UID 812345678
    const dupe = await client.fetch('/api/accounts', {
      method: 'POST',
      json: { name: 'Again', uid: ' 812345678 ' },
    })
    expect(dupe.status).toBe(409)
    expect(await dupe.json()).toMatchObject({
      error: { code: 'uid_taken', issues: [{ path: 'uid' }] },
    })

    const alt = await client.json<AccountCreatedResponse>('/api/accounts', {
      method: 'POST',
      json: { name: 'Alt', uid: '712345678' },
    })
    const clash = await client.fetch(`/api/accounts/${alt.account.id}`, {
      method: 'PATCH',
      json: { uid: '812345678' },
    })
    expect(clash.status).toBe(409)
    expect(await clash.json()).toMatchObject({ error: { code: 'uid_taken' } })

    // Saving an account's own UID again, or clearing UIDs, is fine.
    const same = await client.fetch(`/api/accounts/${main.id}`, {
      method: 'PATCH',
      json: { name: 'Main', uid: '812345678' },
    })
    expect(same.status).toBe(200)
    for (const uid of [null, '']) {
      const cleared = await client.fetch(`/api/accounts/${alt.account.id}`, {
        method: 'PATCH',
        json: { uid },
      })
      expect(cleared.status).toBe(200)
    }
    for (const name of ['No UID', 'No UID either']) {
      const noUid = await client.fetch('/api/accounts', { method: 'POST', json: { name } })
      expect(noUid.status).toBe(201)
    }

    // Another user may have the same UID.
    expect((await createAccount((await signUp()).client)).account.uid).toBe('812345678')

    // The index itself, under the API.
    const db = getDb(env.DB)
    const row = { userId: me.id, uid: '812345678' }
    await expect(
      db.insert(genshinAccounts).values({ ...row, importKeyHash: crypto.randomUUID() }),
    ).rejects.toThrow()
    await expect(
      db
        .insert(genshinAccounts)
        .values({ ...row, uid: '', importKeyHash: crypto.randomUUID() })
        .returning(),
    ).resolves.toHaveLength(1)
  })
})

describe('D1 cost', () => {
  const DIAG = 'test-diag-key-test-diag-key-test-diag-key'

  async function costedImport(key: string, good: unknown, timestamp: number) {
    const response = await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': key, 'x-diag-key': DIAG },
      body: irminsulForm(good, timestamp),
    })
    const header = response.headers.get('x-gdt-d1') ?? ''
    const cost = Object.fromEntries(
      header.split(';').map((part) => {
        const [k, v] = part.trim().split('=')
        return [k, Number(v)]
      }),
    )
    return { status: response.status, cost }
  }

  // A large catalog makes a scan show up: 1,500 stored artifacts, then an
  // upload that holds only 2 of them must not read the other 1,498.
  it('probes the catalog by index instead of scanning it', async () => {
    const { client } = await signUp()
    const { importKey } = await createAccount(client)
    const many = Array.from({ length: 1500 }, (_, i) => ({
      ...sampleGood().artifacts[1]!,
      substats: [{ key: 'hp', value: i + 1 }],
    }))
    await costedImport(importKey, sampleGood({ artifacts: many }), 1_000)

    const small = await costedImport(importKey, sampleGood(), 2_000)
    expect(small.status).toBe(201)
    expect(small.cost['round-trips']).toBeLessThanOrEqual(3)
    expect(small.cost['rows-read']).toBeLessThan(100)
  })

  it('answers an unchanged re-upload in one round trip', async () => {
    const { client } = await signUp()
    const { importKey } = await createAccount(client)
    await costedImport(importKey, sampleGood(), 1_000)
    const again = await costedImport(importKey, sampleGood(), 1_000)
    expect(again.status).toBe(200)
    expect(again.cost['round-trips']).toBe(1)
    expect(again.cost['rows-written']).toBe(0)
  })

  it('keeps the account counters exact through imports and deletes', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const a = await importByKey(importKey, sampleGood(), 1_000)
    await importByKey(importKey, sampleGood({ materials: { Mora: 1 } }), 2_000)
    const before = await client.json<AccountResponse>(`/api/accounts/${account.id}`)
    expect(before.snapshotCount).toBe(2)
    const { snapshotId } = (await a.json()) as ImportResponse
    await client.fetch(`/api/accounts/${account.id}/snapshots/${snapshotId}`, { method: 'DELETE' })
    const after = await client.json<AccountResponse>(`/api/accounts/${account.id}`)
    expect(after.snapshotCount).toBe(1)
    expect(after.rawBytes).toBeLessThan(before.rawBytes)
    // Stored sections are shared and kept, so deleting a snapshot frees none.
    expect(after.storedBytes).toBe(before.storedBytes)
  })
})

describe('progress set by hand', () => {
  it('marks achievements done and undone, idempotently, for the owner only', async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const marks = `/api/accounts/${account.id}/achievement-marks`
    const patch = (json: object) => client.fetch(marks, { method: 'PATCH', json })

    expect(await client.json(marks)).toEqual({ done: [] })
    const first = await patch({ done: [81003, 81001, 81002] })
    expect(await first.json()).toEqual({ done: [81001, 81002, 81003] })
    // Re-marking is harmless; an id in both lists ends up unmarked.
    const second = await patch({ done: [81001, 81004], undone: [81002, 81004] })
    expect(await second.json()).toEqual({ done: [81001, 81003] })
    expect(await client.json(marks)).toEqual({ done: [81001, 81003] })

    expect((await patch({})).status).toBe(400)
    expect((await patch({ done: [0] })).status).toBe(400)
    expect((await patch({ done: ['81001'] })).status).toBe(400)

    const stranger = await signUp()
    expect((await stranger.client.fetch(marks)).status).toBe(404)
    const sneaky = await stranger.client.fetch(marks, { method: 'PATCH', json: { done: [1] } })
    expect(sneaky.status).toBe(404)
    expect(await client.json(marks)).toEqual({ done: [81001, 81003] })
  })

  it('stores planner goals for characters and weapons, and replaces or moves them', async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const url = `/api/accounts/${account.id}/planner-targets`
    const patch = (json: object) => client.fetch(url, { method: 'PATCH', json })
    const furina = { level: 90, ascension: 6, talents: { auto: 6, skill: 9, burst: 10 } }
    const sword = { level: 90, ascension: 6, refinement: 1 }

    const created = await patch({
      upsert: [
        { kind: 'character', key: 'Furina', target: furina },
        { kind: 'weapon', key: 'SplendorOfTranquilWaters', owner: 'Furina', target: sword },
        { kind: 'weapon', key: 'FavoniusSword', owner: '', target: { ...sword, active: false } },
      ],
    })
    expect(created.status).toBe(200)
    const { targets } = (await created.json()) as { targets: Record<string, unknown>[] }
    expect(targets.map(({ updatedAt: _, ...t }) => t)).toEqual([
      { kind: 'character', key: 'Furina', owner: '', target: { ...furina, active: true } },
      { kind: 'weapon', key: 'FavoniusSword', owner: '', target: { ...sword, active: false } },
      {
        kind: 'weapon',
        key: 'SplendorOfTranquilWaters',
        owner: 'Furina',
        target: { ...sword, active: true },
      },
    ])

    // Same ref replaces; a remove + upsert in one request moves a weapon goal.
    const moved = await patch({
      remove: [{ kind: 'weapon', key: 'SplendorOfTranquilWaters', owner: 'Furina' }],
      upsert: [
        { kind: 'character', key: 'Furina', target: { ...furina, level: 80, ascension: 5 } },
        { kind: 'weapon', key: 'SplendorOfTranquilWaters', owner: 'Neuvillette', target: sword },
      ],
    })
    const after = (
      (await moved.json()) as {
        targets: { key: string; owner: string; target: { level: number } }[]
      }
    ).targets
    expect(after.map((t) => `${t.key}:${t.owner}`)).toEqual([
      'Furina:',
      'FavoniusSword:',
      'SplendorOfTranquilWaters:Neuvillette',
    ])
    expect(after[0]!.target.level).toBe(80)

    for (const bad of [
      { upsert: [{ kind: 'character', key: 'Furina', target: { ...furina, level: 91 } }] },
      { upsert: [{ kind: 'character', key: 'Furi na', target: furina }] },
      { upsert: [{ kind: 'weapon', key: 'FavoniusSword', target: sword }] },
      { remove: [{ kind: 'artifact', key: 'X' }] },
      {},
    ]) {
      expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400)
    }

    const stranger = await signUp()
    expect((await stranger.client.fetch(url)).status).toBe(404)
  })

  it('stores extra item needs and goal notes, favorites and priorities', async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const url = `/api/accounts/${account.id}/planner-targets`
    const patch = (json: object) => client.fetch(url, { method: 'PATCH', json })
    const goal = {
      level: 90,
      ascension: 6,
      talents: { auto: 9, skill: 9, burst: 9 },
      note: 'C2 first',
      favorite: true,
      priority: 1,
    }
    const res = await patch({
      upsert: [
        { kind: 'character', key: 'Furina', target: goal },
        { kind: 'item', key: 'CrownOfInsight', target: { count: 3, note: 'spare' } },
      ],
    })
    expect(res.status).toBe(200)
    const { targets } = (await res.json()) as { targets: Record<string, unknown>[] }
    expect(targets.map(({ updatedAt: _, ...t }) => t)).toEqual([
      { kind: 'character', key: 'Furina', owner: '', target: { ...goal, active: true } },
      {
        kind: 'item',
        key: 'CrownOfInsight',
        owner: '',
        target: { count: 3, note: 'spare', active: true },
      },
    ])
    const removed = await patch({ remove: [{ kind: 'item', key: 'CrownOfInsight' }] })
    expect(((await removed.json()) as { targets: unknown[] }).targets).toHaveLength(1)

    for (const bad of [
      { upsert: [{ kind: 'item', key: 'CrownOfInsight', target: { count: 0 } }] },
      {
        upsert: [{ kind: 'character', key: 'Furina', target: { ...goal, note: 'x'.repeat(1001) } }],
      },
    ]) {
      expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400)
    }
  })

  it('stores AR, WL and planner options as account settings', async () => {
    const { client } = await signUp()
    const { account } = await createAccount(client)
    const path = `/api/accounts/${account.id}/settings`
    type S = { settings: { ar: number | null; wl: number | null; planner: object } }
    const before = await client.json<S>(path)
    expect(before.settings).toMatchObject({
      ar: null,
      wl: null,
      planner: { azoth: false, passives: true },
    })
    const after = await client.json<S>(path, {
      method: 'PATCH',
      json: { ar: 60, wl: 9, planner: { azoth: true } },
    })
    expect(after.settings).toMatchObject({
      ar: 60,
      wl: 9,
      planner: { azoth: true, passives: true },
    })
    expect((await client.fetch(path, { method: 'PATCH', json: { ar: 61 } })).status).toBe(400)
  })
})
