import type {
  AccountCreatedResponse,
  AccountResponse,
  AccountSettingsResponse,
  BootstrapResponse,
  MeResponse,
} from '@gdt/shared'
import { SELF } from 'cloudflare:test'
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
