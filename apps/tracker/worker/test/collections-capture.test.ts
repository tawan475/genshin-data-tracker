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
import { syntheticCollections, syntheticWardrobe } from '../../../../packages/shared/test/synthetic'
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

  it('drops a list longer than the game could have, and keeps the upload', async () => {
    const { client, account, importKey } = await setup()
    const response = await importByKey(
      importKey,
      sampleGood({
        gi_collections: {
          spincrystals: Array.from({ length: 2_001 }, (_, i) => 141_001 + i),
          archive: { quests: [10_000_001] },
        },
      }),
      1_000,
    )
    expect(response.status).toBe(201)
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_collections).toEqual({ archive: { quests: [10_000_001] } })
  })
})

describe("Teyvat.me Capture 1.4.0's collections and wardrobe", () => {
  const full = syntheticCollections(9)
  const wardrobe = syntheticWardrobe(9)

  it('stores them, a relogin with nothing new stores 0 bytes, and exports them', async () => {
    const { client, account, importKey } = await setup()
    const good = sampleGood({ gi_collections: full, gi_wardrobe: wardrobe })
    const first = (await (await importByKey(importKey, good, 1_000)).json()) as ImportResponse
    expect(first.status).toBe('created')
    // The same state at the next login (another snapshot time, nothing new).
    const again = (await (await importByKey(importKey, good, 2_000)).json()) as ImportResponse
    expect(again.status).toBe('unchanged')
    expect(again.storedSize).toBe(0)
    // A swapped glider: only the wardrobe changes, and costs a little.
    const swapped = structuredClone(wardrobe)
    const [wearer] = Object.keys(swapped.gliders!.worn)
    swapped.gliders!.worn[wearer!] = swapped.gliders!.owned.at(-1)!
    const third = (await (
      await importByKey(
        importKey,
        sampleGood({ gi_collections: full, gi_wardrobe: swapped }),
        3_000,
      )
    ).json()) as ImportResponse
    expect(third.status).toBe('created')
    expect(third.storedSize).toBeLessThan(200)

    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${first.snapshotId}/good`,
    )
    expect(Object.keys(exported).slice(-2)).toEqual(['gi_collections', 'gi_wardrobe'])
    expect(exported.gi_collections!.tcg!.decks!['3']!.name).toBe(full.tcg!.decks!['3']!.name)
    expect(exported.gi_wardrobe!.teams!['1']!.name).toBe(wardrobe.teams!['1']!.name)
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_wardrobe!.gliders!.worn[wearer!]).toBe(swapped.gliders!.owned.at(-1))

    const { snapshots, texts } = await decodeBundle(
      await (
        await client.fetch(`/api/accounts/${account.id}/bundle?sections=wardrobe&format=2`)
      ).arrayBuffer(),
    )
    expect(snapshots).toHaveLength(2)
    expect(new Set(snapshots.map((s) => s.wardrobe)).size).toBe(2)
    expect([...texts.keys()].sort()).toEqual(snapshots.map((s) => s.wardrobe!).sort())
  })

  it('keeps re-uploading a capture a no-op when it was stored before the wardrobe', async () => {
    const { importKey } = await setup()
    const spincrystalsOnly = { spincrystals: full.spincrystals! }
    const created = (await (
      await importByKey(importKey, sampleGood({ gi_collections: spincrystalsOnly }), 1_000)
    ).json()) as ImportResponse
    const again = await importByKey(
      importKey,
      sampleGood({ gi_collections: spincrystalsOnly, gi_wardrobe: wardrobe }),
      1_000,
    )
    expect(await again.json()).toMatchObject({
      status: 'unchanged',
      snapshotId: created.snapshotId,
    })
  })
})
