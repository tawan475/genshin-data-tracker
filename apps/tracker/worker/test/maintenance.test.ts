import { env, SELF } from 'cloudflare:test'
import type { AccountResponse, ImportResponse } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { TRASH_DAYS, runMaintenance } from '../services/maintenance'
import { ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

describe('maintenance', () => {
  it('purges old trash and the sections only it referenced, keeping shared ones', async () => {
    const { client } = await signUp()
    const { account, importKey } = await client.json<{
      account: AccountResponse
      importKey: string
    }>('/api/accounts', { method: 'POST', json: { name: 'Main' } })
    const upload = async (good: unknown, at: number) =>
      (await (
        await SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
          method: 'POST',
          headers: { 'x-import-key': importKey },
          body: irminsulForm(good, at),
        })
      ).json()) as ImportResponse
    const kept = await upload(sampleGood(sampleExtras()), 1_000)
    const gone = await upload(sampleGood({ characters: [], materials: { Mora: 7 } }), 2_000)
    await client.fetch(`/api/accounts/${account.id}/snapshots/${gone.snapshotId}`, {
      method: 'DELETE',
    })
    const before = await client.json<AccountResponse>(`/api/accounts/${account.id}`)

    // Within the trash window nothing is purged.
    expect((await runMaintenance(env.DB)).snapshots).toBe(0)

    const later = Date.now() + (TRASH_DAYS + 1) * 86_400_000
    const result = await runMaintenance(env.DB, later)
    expect(result.snapshots).toBeGreaterThanOrEqual(1)
    expect(result.blobs).toBeGreaterThanOrEqual(1)

    const after = await client.json<AccountResponse>(`/api/accounts/${account.id}`)
    expect(after.snapshotCount).toBe(1)
    expect(after.storedBytes).toBeLessThan(before.storedBytes)
    // The surviving snapshot still decodes: its sections were not collected.
    const good = await client.fetch(`/api/accounts/${account.id}/snapshots/${kept.snapshotId}/good`)
    expect(good.status).toBe(200)
    expect(await good.json()).toMatchObject(sampleExtras())
  })
})

describe('response headers', () => {
  it('never lets a cookie-setting response be cached', async () => {
    const { client } = await signUp()
    const response = await client.fetch('/api/auth/refresh', { method: 'POST' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
