import {
  decodeBundle,
  decodeExploration,
  type AccountCreatedResponse,
  type ExplorationSection,
  type Good,
  type ImportResponse,
} from '@gdt/shared'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  syntheticCollections,
  syntheticExploration,
  syntheticWardrobe,
} from '../../../../packages/shared/test/synthetic'
import { ORIGIN, irminsulForm, sampleGood, signUp } from './client'

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

const send = async (key: string, good: unknown, at: number) =>
  (await (await importByKey(key, good, at)).json()) as ImportResponse

describe("Teyvat.me Capture 1.6.0's exploration", () => {
  const exploration = syntheticExploration(11)
  const base = { gi_collections: syntheticCollections(11), gi_wardrobe: syntheticWardrobe(11) }

  it('stores it, a relogin with nothing new stores 0 bytes, a new map point a little', async () => {
    const { client, account, importKey } = await setup()
    const good = sampleGood({ ...base, gi_exploration: exploration })
    const first = await send(importKey, good, 1_000)
    expect(first.status).toBe('created')
    const again = await send(importKey, good, 2_000)
    expect(again.status).toBe('unchanged')
    expect(again.storedSize).toBe(0)

    const next = structuredClone(exploration)
    const teyvat = next.scenes!['3']!
    teyvat.points.push(teyvat.points.at(-1)! + 1)
    const third = await send(importKey, sampleGood({ ...base, gi_exploration: next }), 3_000)
    expect(third.status).toBe('created')
    expect(third.storedSize).toBeLessThan(200)

    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${first.snapshotId}/good`,
    )
    expect(Object.keys(exported).at(-1)).toBe('gi_exploration')
    expect(exported.gi_exploration).toEqual(exploration)
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_exploration!.scenes!['3']!.points).toHaveLength(894)

    const { snapshots, texts } = await decodeBundle(
      await (
        await client.fetch(`/api/accounts/${account.id}/bundle?sections=exploration&format=2`)
      ).arrayBuffer(),
    )
    expect(snapshots).toHaveLength(2)
    const newest = snapshots.find((s) => s.id === third.snapshotId)!
    expect(
      decodeExploration(JSON.parse(texts.get(newest.exploration!)!) as ExplorationSection),
    ).toEqual(next)
  })

  it('keeps re-uploading a capture a no-op when it was stored before the exploration', async () => {
    const { importKey } = await setup()
    const created = await send(importKey, sampleGood(base), 1_000)
    const again = await send(importKey, sampleGood({ ...base, gi_exploration: exploration }), 1_000)
    expect(again).toMatchObject({ status: 'unchanged', snapshotId: created.snapshotId })
  })

  it('drops a bad part and keeps the upload', async () => {
    const { client, account, importKey } = await setup()
    const response = await importByKey(
      importKey,
      sampleGood({
        gi_exploration: { ...exploration, explore: { '1': -5 }, reputation: { x: 1 } },
      }),
      1_000,
    )
    expect(response.status).toBe(201)
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(Object.keys(latest.gi_exploration!).sort()).toEqual(['offerings', 'scenes', 'statues'])
  })
})
