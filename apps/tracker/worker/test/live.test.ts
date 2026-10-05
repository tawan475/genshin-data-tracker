import type {
  AccountCreatedResponse,
  AccountResponse,
  ImportKeyResponse,
  ImportResponse,
  LiveEvent,
} from '@gdt/shared'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { SESSION_EXPIRED_CLOSE, liveHub } from '../services/live'
import { Client, ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

const DIAG = 'test-diag-key-test-diag-key-test-diag-key'

/** An open live socket, with its messages queued for the test to read in order. */
interface Tab {
  socket: WebSocket
  /** The next message (event or `pong`), or a failure after `ms`. */
  next(ms?: number): Promise<unknown>
  /** Fails if a message arrives within `ms`. */
  quiet(ms?: number): Promise<void>
  closed: Promise<CloseEvent>
}

function tabOf(socket: WebSocket): Tab {
  socket.accept()
  const queue: unknown[] = []
  let wake: (() => void) | null = null
  socket.addEventListener('message', (event) => {
    const text = String(event.data)
    queue.push(text === 'pong' ? text : JSON.parse(text))
    wake?.()
  })
  const closed = new Promise<CloseEvent>((resolve) =>
    socket.addEventListener('close', (event) => resolve(event)),
  )
  const waitFor = (ms: number) =>
    new Promise<boolean>((resolve) => {
      if (queue.length > 0) return resolve(true)
      const timer = setTimeout(() => {
        wake = null
        resolve(false)
      }, ms)
      wake = () => {
        clearTimeout(timer)
        wake = null
        resolve(true)
      }
    })
  return {
    socket,
    closed,
    async next(ms = 2000) {
      if (!(await waitFor(ms))) throw new Error(`No live message within ${ms} ms`)
      return queue.shift()
    },
    async quiet(ms = 150) {
      if (await waitFor(ms)) throw new Error(`Unexpected live message: ${JSON.stringify(queue)}`)
    },
  }
}

async function openTab(client: Client): Promise<Tab> {
  const response = await client.fetch('/api/live', {
    headers: { upgrade: 'websocket', origin: ORIGIN },
  })
  expect(response.status).toBe(101)
  return tabOf(response.webSocket!)
}

async function createAccount(client: Client, uid = '812345678') {
  return client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Main', uid, server: 'ASIA' },
  })
}

function importByKey(key: string, good: unknown, timestamp?: number) {
  return SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
    method: 'POST',
    headers: { 'x-import-key': key },
    body: irminsulForm(good, timestamp),
  })
}

async function versionOf(client: Client, id: number) {
  return (await client.json<AccountResponse>(`/api/accounts/${id}`)).dataVersion
}

describe('live socket', () => {
  it('needs a session, this site as the origin, and an upgrade', async () => {
    const upgrade = { upgrade: 'websocket', origin: ORIGIN }
    const anonymous = await new Client().fetch('/api/live', { headers: upgrade })
    expect(anonymous.status).toBe(401)
    expect(anonymous.webSocket).toBeNull()

    const { client } = await signUp()
    const elsewhere = await client.fetch('/api/live', {
      headers: { ...upgrade, origin: 'https://evil.example' },
    })
    expect(elsewhere.status).toBe(403)
    const noOrigin = await client.fetch('/api/live', { headers: { upgrade: 'websocket' } })
    expect(noOrigin.status).toBe(403)
    const plain = await client.fetch('/api/live', { headers: { origin: ORIGIN } })
    expect(plain.status).toBe(426)

    const tab = await openTab(client)
    tab.socket.send('ping')
    expect(await tab.next()).toBe('pong')
    tab.socket.close(1000)
  })

  it("tells every tab of the user about each change, and nobody else's tabs", async () => {
    const { client, me } = await signUp()
    const other = await signUp()
    const [first, second, stranger] = await Promise.all([
      openTab(client),
      openTab(client),
      openTab(other.client),
    ])
    const both = async () => {
      const [a, b] = [await first.next(), await second.next()]
      expect(b).toEqual(a)
      return a
    }

    const { account, importKey } = await createAccount(client)
    expect(await both()).toEqual<LiveEvent>({ type: 'accounts' })

    // irminsul's upload with the account's own key.
    expect((await importByKey(importKey, sampleGood(), 1_000)).status).toBe(201)
    expect(await both()).toEqual<LiveEvent>({
      type: 'data',
      accountId: account.id,
      dataVersion: await versionOf(client, account.id),
      takenAt: 1_000,
    })

    // The same capture again changes nothing and says nothing; seen again later, it does.
    expect((await importByKey(importKey, sampleGood(), 1_000)).status).toBe(200)
    await first.quiet()
    expect((await importByKey(importKey, sampleGood(), 2_000)).status).toBe(200)
    expect(await both()).toMatchObject({ type: 'data', accountId: account.id, takenAt: 2_000 })

    // An upload from the dashboard.
    const manual = await client.fetch(`/api/accounts/${account.id}/import?timestamp=3000`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleGood({ materials: { Mora: 5 } })),
    })
    expect(manual.status).toBe(201)
    const { snapshotId } = (await manual.json()) as ImportResponse
    expect(await both()).toEqual<LiveEvent>({
      type: 'data',
      accountId: account.id,
      dataVersion: await versionOf(client, account.id),
      takenAt: 3_000,
    })

    // Deletes, one and many.
    await client.fetch(`/api/accounts/${account.id}/snapshots/${snapshotId}`, { method: 'DELETE' })
    expect(await both()).toEqual<LiveEvent>({
      type: 'data',
      accountId: account.id,
      dataVersion: await versionOf(client, account.id),
    })
    const snapshots = await client.json<{ id: number }[]>(`/api/accounts/${account.id}/snapshots`)
    await client.fetch(`/api/accounts/${account.id}/snapshots/delete`, {
      method: 'POST',
      json: { ids: snapshots.map((s) => s.id) },
    })
    expect(await both()).toMatchObject({ type: 'data', accountId: account.id })

    // Renamed, then removed.
    await client.fetch(`/api/accounts/${account.id}`, { method: 'PATCH', json: { name: 'Alt' } })
    expect(await both()).toEqual<LiveEvent>({ type: 'accounts' })
    await client.fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    expect(await both()).toEqual<LiveEvent>({ type: 'accounts' })

    await stranger.quiet()
    expect(await liveHub(env, me.id).sockets()).toBe(2)
    for (const tab of [first, second, stranger]) tab.socket.close(1000)
  })

  it("reaches the user's tabs from their all-accounts key, new accounts included", async () => {
    const { client } = await signUp()
    const tab = await openTab(client)
    const { importKey } = await client.json<ImportKeyResponse>('/api/me/import-key', {
      method: 'POST',
    })
    const response = await importByKey(importKey, sampleGood(sampleExtras(712345678)), 1_000)
    expect(response.status).toBe(201)
    const { account } = (await response.json()) as ImportResponse
    expect(account).toMatchObject({ uid: '712345678', created: true })
    expect(await tab.next()).toEqual<LiveEvent>({
      type: 'data',
      accountId: account!.id,
      dataVersion: await versionOf(client, account!.id),
      takenAt: 1_000,
    })
    tab.socket.close(1000)
  })

  it('closes a socket whose session token has expired instead of telling it', async () => {
    const { client, me } = await signUp()
    const hub = liveHub(env, me.id)
    const expired = await hub.fetch(`${ORIGIN}/api/live`, {
      headers: { upgrade: 'websocket', 'x-gdt-token-exp': String(Math.floor(Date.now() / 1000)) },
    })
    const stale = tabOf(expired.webSocket!)
    const fresh = await openTab(client)

    await createAccount(client)
    expect(await fresh.next()).toEqual<LiveEvent>({ type: 'accounts' })
    expect((await stale.closed).code).toBe(SESSION_EXPIRED_CLOSE)
    fresh.socket.close(1000)
  })
})

describe('account list', () => {
  it('is one round trip, and a 304 while nothing changed', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    await createAccount(client, '712345678')
    await importByKey(importKey, sampleGood(), 1_000)

    const first = await client.fetch('/api/accounts', { headers: { 'x-diag-key': DIAG } })
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('private, no-cache')
    const cost = first.headers.get('x-gdt-d1')!
    expect(cost).toMatch(/round-trips=1;/)
    // Each account by the user index, plus the one latest snapshot by key.
    expect(Number(/rows-read=(\d+)/.exec(cost)![1])).toBeLessThanOrEqual(4)
    const etag = first.headers.get('etag')!
    expect(etag).toMatch(/^W\/"l\.[0-9a-f]{24}"$/)
    const list = (await first.json()) as AccountResponse[]
    expect(list.map((a) => a.snapshotCount)).toEqual([1, 0])

    const same = await client.fetch('/api/accounts', { headers: { 'if-none-match': etag } })
    expect(same.status).toBe(304)
    expect(await same.text()).toBe('')

    // A capture seen again moves only the version and the last-seen time.
    await importByKey(importKey, sampleGood(), 2_000)
    const moved = await client.fetch('/api/accounts', { headers: { 'if-none-match': etag } })
    expect(moved.status).toBe(200)
    const after = (await moved.json()) as AccountResponse[]
    expect(after[0]!.dataVersion).toBeGreaterThan(list[0]!.dataVersion)
    expect(after[0]!.latest!.lastSeenAt).toBe(2_000)

    // A rename alone changes it too.
    const etag2 = moved.headers.get('etag')!
    await client.fetch(`/api/accounts/${account.id}`, { method: 'PATCH', json: { name: 'Alt' } })
    expect(
      (await client.fetch('/api/accounts', { headers: { 'if-none-match': etag2 } })).status,
    ).toBe(200)

    // Another user's list is their own, whatever tag they send.
    const other = await signUp()
    const theirs = await other.client.fetch('/api/accounts', { headers: { 'if-none-match': etag } })
    expect(theirs.status).toBe(200)
    expect(await theirs.json()).toEqual([])
  })
})
