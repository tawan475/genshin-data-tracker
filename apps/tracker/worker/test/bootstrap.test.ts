import type {
  AccountCreatedResponse,
  AccountResponse,
  AccountSettingsResponse,
  BootstrapResponse,
  MeResponse,
} from '@gdt/shared'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { Client, ORIGIN, irminsulForm, sampleGood, signUp } from './client'

const DIAG = 'test-diag-key-test-diag-key-test-diag-key'

async function createAccount(client: Client, uid = '812345678') {
  return client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Main', uid, server: 'ASIA' },
  })
}

describe('bootstrap', () => {
  it('answers what me, accounts and the account settings answer, in one round trip', async () => {
    const { client } = await signUp()
    const { account, importKey } = await createAccount(client)
    await createAccount(client, '812345679')
    await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
      method: 'POST',
      headers: { 'x-import-key': importKey },
      body: irminsulForm(sampleGood(), 1_000),
    })
    await client.fetch(`/api/accounts/${account.id}/settings`, {
      method: 'PATCH',
      json: { traveler: 'M' },
    })

    const response = await client.fetch(`/api/bootstrap?account=${account.id}`, {
      headers: { 'x-diag-key': DIAG },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-gdt-d1')).toMatch(/round-trips=1;/)
    expect(response.headers.get('server-timing')).toMatch(/bootstrap;dur=\d+.*total;dur=\d+/)
    const body = (await response.json()) as BootstrapResponse

    expect(body.me).toEqual(await client.json<MeResponse>('/api/auth/me'))
    const list = await client.fetch('/api/accounts')
    expect(body.accounts).toEqual((await list.json()) as AccountResponse[])
    expect(body.accountsEtag).toBe(list.headers.get('etag'))
    expect(body.accounts[0]!.latest).not.toBeNull()
    const settings = await client.json<AccountSettingsResponse>(
      `/api/accounts/${account.id}/settings`,
    )
    expect(body.account).toEqual({ id: account.id, ...settings })
    expect(body.account!.settings.traveler).toBe('M')
    // The capture upload names its source; no capture app signed in yet.
    expect(body.accounts.find((a) => a.id === account.id)!.latest!.source).toBe('Irminsul')
    expect(body.capture).toBeNull()
  })

  it('names the newest signed-in capture app, not ended or browser sessions', async () => {
    const { client, me } = await signUp()
    const now = Date.now()
    const insert = (method: string, device: string | null, seen: number, revoked: number | null) =>
      env.DB.prepare(
        `INSERT INTO user_sessions (user_id, method, device_name, created_at, last_seen_at,
           expires_at, revoked_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)`,
      )
        .bind(me.id, method, device, seen, now + 86_400_000, revoked)
        .run()
    await insert('irminsul', 'OLD-PC', now - 60_000, null)
    await insert('irminsul', 'GAMING-PC', now - 1_000, null)
    await insert('irminsul', 'GONE-PC', now, now)
    const body = await client.json<BootstrapResponse>('/api/bootstrap')
    expect(body.capture).toEqual({ device: 'GAMING-PC', lastSeenAt: now - 1_000 })
  })

  it("never answers another user's account settings", async () => {
    const { client: owner } = await signUp()
    const { account } = await createAccount(owner)
    const { client: other } = await signUp()
    const body = await other.json<BootstrapResponse>(`/api/bootstrap?account=${account.id}`)
    expect(body.account).toBeNull()
    expect(body.accounts).toEqual([])
    // No account asked for: no settings.
    expect((await owner.json<BootstrapResponse>('/api/bootstrap')).account).toBeNull()
  })

  it('needs a session', async () => {
    expect((await new Client().fetch('/api/bootstrap')).status).toBe(401)
  })
})
