import {
  decodeBundle,
  decodeCollections,
  type AccountCreatedResponse,
  type CollectionsSection,
  type GiCollections,
  type GiTasks,
  type Good,
  type ImportResponse,
} from '@gdt/shared'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

/** Made-up values in the shape Teyvat.me Capture sends: 120 of the 206. */
const spincrystals = Array.from({ length: 120 }, (_, i) => 141_001 + i * 2 + (i % 3 === 0 ? 1 : 0))
const collections: GiCollections = { spincrystals }

function importByKey(key: string, good: unknown, timestamp?: number) {
  return SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
    method: 'POST',
    headers: { 'x-import-key': key },
    body: irminsulForm(good, timestamp),
  })
}

async function setup() {
  const { client } = await signUp()
  const { account, importKey } = await client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Alt', uid: '812345678', server: 'ASIA' },
  })
  return { client, account, importKey }
}

describe('gi_collections in captures', () => {
  it('stores them, sends them in the bundle and exports them', async () => {
    const { client, account, importKey } = await setup()
    const first = (await (
      await importByKey(
        importKey,
        sampleGood({ ...sampleExtras(), gi_collections: collections }),
        1_000,
      )
    ).json()) as ImportResponse
    expect(first.status).toBe('created')
    // The next login: one more Spincrystal.
    const next: GiCollections = { spincrystals: [...spincrystals, 141_306] }
    const second = (await (
      await importByKey(importKey, sampleGood({ ...sampleExtras(), gi_collections: next }), 2_000)
    ).json()) as ImportResponse
    expect(second.status).toBe('created')
    // A relogin with nothing new: the same inventory, nothing stored.
    const third = await importByKey(
      importKey,
      sampleGood({ ...sampleExtras(), gi_collections: next }),
      3_000,
    )
    expect(((await third.json()) as ImportResponse).status).toBe('unchanged')

    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${first.snapshotId}/good`,
    )
    expect(exported.gi_collections).toEqual(collections)
    expect(Object.keys(exported).at(-1)).toBe('gi_collections')
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_collections).toEqual(next)

    const { snapshots, texts } = await decodeBundle(
      await (
        await client.fetch(`/api/accounts/${account.id}/bundle?sections=collections&format=2`)
      ).arrayBuffer(),
    )
    expect(snapshots).toHaveLength(2)
    const [a, b] = snapshots
    expect(a!.collections).not.toBe(b!.collections)
    expect([...texts.keys()].sort()).toEqual([a!.collections, b!.collections].sort())
    const newest = snapshots.find((s) => s.id === second.snapshotId)!
    expect(
      decodeCollections(JSON.parse(texts.get(newest.collections!)!) as CollectionsSection),
    ).toEqual(next)
  })

  it('keeps re-uploading a capture a no-op when it was stored before the collections', async () => {
    const { importKey } = await setup()
    const tasks: GiTasks = { welkin: { days: 30 } }
    // As the tracker stored Teyvat.me Capture's files before it kept gi_collections.
    const created = (await (
      await importByKey(importKey, sampleGood({ ...sampleExtras(), gi_tasks: tasks }), 1_000)
    ).json()) as ImportResponse
    const again = await importByKey(
      importKey,
      sampleGood({ ...sampleExtras(), gi_tasks: tasks, gi_collections: collections }),
      1_000,
    )
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({
      status: 'unchanged',
      snapshotId: created.snapshotId,
    })
    // A later capture that has them is new data: stored.
    const later = await importByKey(
      importKey,
      sampleGood({ ...sampleExtras(), gi_tasks: tasks, gi_collections: collections }),
      2_000,
    )
    expect(((await later.json()) as ImportResponse).status).toBe('created')
  })

  it('drops a list with a bad entry and keeps the rest of the upload', async () => {
    const { client, account, importKey } = await setup()
    const bad = { spincrystals: [...spincrystals, spincrystals[0]!] }
    const response = await importByKey(
      importKey,
      sampleGood({ gi_tasks: { welkin: { days: 3 } }, gi_collections: bad }),
      1_000,
    )
    expect(response.status).toBe(201)
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_collections).toBeUndefined()
    expect(latest.gi_tasks).toEqual({ welkin: { days: 3 } })
  })

  it('refuses a file with far more than the game has', async () => {
    const { importKey } = await setup()
    const response = await importByKey(
      importKey,
      sampleGood({
        gi_collections: { spincrystals: Array.from({ length: 2_001 }, (_, i) => 141_001 + i) },
      }),
      1_000,
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: 'too_many_items' } })
  })
})
