import {
  toBase64Url,
  type AccountCreatedResponse,
  type DeviceAlerts,
  type PresenceResponse,
  type PresenceResponseForAccount,
  type PushConfigResponse,
  type SessionResponse,
} from '@gdt/shared'
import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { liveHub, type LiveHub } from '../services/live'
import { RESIN_STEP_MS } from '../services/alerts'
import { ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp, withEnv } from './client'

/** Calls the Worker and waits for what it does after answering (the hub's facts). */
const call = withEnv({})

async function setup() {
  const { client, me } = await signUp(call)
  const { account, importKey } = await client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Main', uid: '812345678', server: 'ASIA' },
  })
  return { client, me, account, importKey }
}

async function subscribe(client: Awaited<ReturnType<typeof setup>>['client']) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const endpoint = `https://push.example.com/send/${crypto.randomUUID()}`
  const response = await client.fetch('/api/push/subscription', {
    method: 'PUT',
    json: {
      endpoint,
      keys: {
        p256dh: toBase64Url(raw),
        auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      },
      tz: 'Asia/Bangkok',
    },
  })
  expect(response.status).toBe(204)
  return endpoint
}

const presence = (key: string, body: object) =>
  call(`${ORIGIN}/api/irminsul/presence`, {
    method: 'POST',
    headers: { 'x-import-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ v: 1, ...body }),
  })

/** A push service that takes everything and remembers where it was sent. */
function pushService() {
  const sent: string[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    sent.push(String(input instanceof Request ? input.url : input))
    return new Response(null, { status: 201 })
  }) as typeof fetch
  return { sent, fetcher }
}

describe('alerts on every device', () => {
  it('is on with the server keys', async () => {
    const config = (await (
      await call(`${ORIGIN}/api/push/config`, {})
    ).json()) as PushConfigResponse
    expect(config.enabled).toBe(true)
    expect(config.publicKey).toMatch(/^B/)
  })

  it('subscribes a browser, keeps its settings and sends its alert when due', async () => {
    const { client, me, account, importKey } = await setup()
    const endpoint = await subscribe(client)
    const [session] = (await client.json<SessionResponse[]>('/api/auth/sessions')).filter(
      (s) => s.current,
    )
    expect(session!.push).toBe(true)
    expect(session!.alerts).toMatchObject({ resin: null, resinFull: true, tz: 'Asia/Bangkok' })

    const patched = await client.json<{ alerts: DeviceAlerts }>(
      `/api/auth/sessions/${session!.id}`,
      {
        method: 'PATCH',
        json: { alerts: { resin: 160, lang: 'en' } },
      },
    )
    expect(patched.alerts).toMatchObject({ resin: 160, resinFull: true, lang: 'en' })

    // A capture: 100 resin, the next one in a minute.
    const now = Date.now()
    const nextAt = Math.floor(now / 1000) + 60
    const upload = await call(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': importKey },
      body: irminsulForm(
        sampleGood({
          gi_player: { ...sampleExtras().gi_player!, resin: 100 },
          gi_tasks: { resin: { value: 100, nextAt } },
        }),
        now,
      ),
    })
    expect(upload.status).toBe(201)

    const hub = liveHub(env, me.id)
    const due = nextAt * 1000 - RESIN_STEP_MS + 60 * RESIN_STEP_MS
    expect(await hub.alarmAt()).toBe(due)

    const service = pushService()
    const report = await runInDurableObject(hub, async (object: LiveHub) => {
      object.clock = () => due + 1_000
      object.fetcher = service.fetcher
      return object.fireNow()
    })
    expect(report).toMatchObject({ sent: 1, quiet: 0 })
    expect(service.sent).toEqual([endpoint])
    // Sent once: the next alarm is resin full, not this one again.
    expect(await hub.alarmAt()).toBe(due + 40 * RESIN_STEP_MS)
    const again = await runInDurableObject(hub, async (object: LiveHub) => object.fireNow())
    expect(again.sent).toBe(0)
    void account
  })

  it('holds alerts while Capture plays the account, and forgets a gone subscription', async () => {
    const { client, me, importKey } = await setup()
    await subscribe(client)
    const now = Date.now()
    await call(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': importKey },
      // 199 resin, the last one in 30 seconds.
      body: irminsulForm(
        sampleGood({
          gi_player: { ...sampleExtras().gi_player!, resin: 199 },
          gi_tasks: { resin: { value: 199, nextAt: Math.floor(now / 1000) + 30 } },
        }),
        now,
      ),
    })
    const hub = liveHub(env, me.id)
    const full = await hub.alarmAt()
    expect(full).toBe((Math.floor(now / 1000) + 30) * 1000)

    expect((await presence(importKey, { state: 'decoding', uid: 812345678 })).status).toBe(200)
    const quiet = await runInDurableObject(hub, async (object: LiveHub) => {
      object.clock = () => full! + 1_000
      object.fetcher = pushService().fetcher
      return object.fireNow()
    })
    expect(quiet).toMatchObject({ sent: 0, quiet: 1 })

    // The phone unsubscribed: the push service answers 410 and the row goes.
    await call(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': importKey },
      body: irminsulForm(
        sampleGood({ ...sampleExtras(), gi_player: { ...sampleExtras().gi_player!, resin: 150 } }),
        now + 1,
      ),
    })
    await presence(importKey, { state: 'stopped', uid: 812345678 })
    const gone = await runInDurableObject(hub, async (object: LiveHub) => {
      object.clock = () => now + 1 + 50 * RESIN_STEP_MS + 1_000
      object.fetcher = (async () => new Response(null, { status: 410 })) as typeof fetch
      return object.fireNow()
    })
    expect(gone.gone).toBe(1)
    const left = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?1',
    )
      .bind(me.id)
      .first<{ n: number }>()
    expect(left!.n).toBe(0)
  })

  it('stops alerting about an account once it is deleted', async () => {
    const { client, me, account } = await setup()
    await subscribe(client)
    const now = Date.now()
    await client.json(`/api/accounts/${account.id}/alert-facts`, {
      method: 'POST',
      json: { resin: { value: 199, at: now } },
    })
    const hub = liveHub(env, me.id)
    expect(await hub.alarmAt()).toBe(now + RESIN_STEP_MS)
    expect((await client.fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })).status).toBe(
      204,
    )
    const service = pushService()
    const report = await runInDurableObject(hub, async (object: LiveHub) => {
      object.clock = () => now + RESIN_STEP_MS + 1_000
      object.fetcher = service.fetcher
      return object.fireNow()
    })
    expect(report.sent).toBe(0)
    expect(service.sent).toEqual([])
    expect(await hub.alarmAt()).toBeNull()
  })

  it('takes facts from the Planner only for users with alerts', async () => {
    const { client, account } = await setup()
    const before = await client.json<{ alerts: boolean }>(
      `/api/accounts/${account.id}/alert-facts`,
      {
        method: 'POST',
        json: { manual: { value: 20, at: Date.now() } },
      },
    )
    expect(before.alerts).toBe(false)
    await subscribe(client)
    const after = await client.json<{ alerts: boolean }>(
      `/api/accounts/${account.id}/alert-facts`,
      {
        method: 'POST',
        json: { manual: { value: 20, at: Date.now() }, ticks: { commissions: Date.now() } },
      },
    )
    expect(after.alerts).toBe(true)
    const bad = await client.fetch(`/api/accounts/${account.id}/alert-facts`, {
      method: 'POST',
      json: { manual: { value: -1, at: 1 } },
    })
    expect(bad.status).toBe(400)
  })
})

describe('Capture presence and commands', () => {
  it('shows who plays, hands over the website commands once, and ends on stop', async () => {
    const { client, account, importKey } = await setup()
    const first = (await (
      await presence(importKey, {
        state: 'decoding',
        uid: 812345678,
        app: '1.17.4',
        platform: 'windows',
      })
    ).json()) as PresenceResponse
    expect(first).toEqual({ next: 60, commands: [], alerts: null })

    const shown = await client.json<PresenceResponseForAccount>(
      `/api/accounts/${account.id}/presence`,
    )
    expect(shown.presence).toMatchObject({
      device: 'Capture',
      state: 'decoding',
      platform: 'windows',
    })

    const asked = await client.json<PresenceResponseForAccount>(
      `/api/accounts/${account.id}/capture-command`,
      { method: 'POST', json: { kind: 'snapshot' } },
    )
    expect(asked.pending).toEqual(['snapshot'])
    const beat = (await (
      await presence(importKey, { state: 'decoding', uid: 812345678 })
    ).json()) as PresenceResponse
    expect(beat.commands.map((c) => c.kind)).toEqual(['snapshot'])
    const next = (await (
      await presence(importKey, { state: 'decoding', uid: 812345678 })
    ).json()) as PresenceResponse
    expect(next.commands).toEqual([])

    await presence(importKey, { state: 'stopped', uid: 812345678 })
    const gone = await client.json<PresenceResponseForAccount>(
      `/api/accounts/${account.id}/presence`,
    )
    expect(gone.presence).toBeNull()
    const refused = await client.fetch(`/api/accounts/${account.id}/capture-command`, {
      method: 'POST',
      json: { kind: 'wishes' },
    })
    expect(refused.status).toBe(409)
  })

  it('refuses a bad heartbeat', async () => {
    const { importKey } = await setup()
    expect((await presence(importKey, { state: 'dancing' })).status).toBe(400)
    expect((await presence('gdt_import_nope', { state: 'running' })).status).toBe(401)
  })
})
