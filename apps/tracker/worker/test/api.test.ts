import {
  catalogFromRows,
  decodeSnapshot,
  inflateBundle,
  readBundle,
  type AccountCreatedResponse,
  type AccountResponse,
  type CatalogRow,
  type Good,
  type ImportResponse,
  type SnapshotResponse,
  type VerifyKeyResponse,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { env, SELF } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import { hashPassword } from '../lib/password'
import { Client, ORIGIN, irminsulForm, sampleGood, signUp } from './client'

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

  it('changes the username and email with the current password', async () => {
    const { client, username, password } = await signUp()
    const update = (json: object) => client.fetch('/api/auth/profile', { method: 'PATCH', json })
    const code = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code
    const tag = crypto.randomUUID().slice(0, 8)

    expect(
      (await update({ currentPassword: 'wrong wrong wrong', username: `x${tag}` })).status,
    ).toBe(401)
    expect((await update({ currentPassword: password })).status).toBe(400)

    const renamed = await update({
      currentPassword: password,
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
    const cleared = await update({ currentPassword: password, email: '' })
    expect(((await cleared.json()) as { email: string | null }).email).toBeNull()

    // Someone else's names are refused, saying which one.
    const other = await signUp()
    const takenName = await update({
      currentPassword: password,
      username: other.username.toUpperCase(),
    })
    expect(takenName.status).toBe(409)
    expect(await code(takenName)).toBe('username_taken')
    const takenEmail = await update({
      currentPassword: password,
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
    expect(snapshots[0]!.summary).toMatchObject({ mora: 2_000_000, primogem: 16_000, fodder3: 1 })

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
        {
          ...s,
          characters: texts.get(s.characters)!,
          weapons: texts.get(s.weapons)!,
          artifacts: texts.get(s.artifacts)!,
          materials: texts.get(s.materials)!,
          materialsKeyframe:
            s.materialsKeyframe === s.materials ? null : texts.get(s.materialsKeyframe)!,
          achievements: s.achievements ? texts.get(s.achievements)! : null,
        },
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

  it('revalidates derived views with ETags until the data changes', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    const first = await client.fetch(`/api/accounts/${account.id}/snapshots`)
    const etag = first.headers.get('etag')!
    const again = await client.fetch(`/api/accounts/${account.id}/snapshots`, {
      headers: { 'if-none-match': etag },
    })
    expect(again.status).toBe(304)
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
