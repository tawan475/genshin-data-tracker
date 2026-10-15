import {
  decodeBundle,
  decodeTasks,
  type AccountCreatedResponse,
  type GiAnecdotes,
  type GiTasks,
  type Good,
  type ImportResponse,
  type TasksSection,
} from '@gdt/shared'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

/** Made-up values in the shape irminsul sends. */
const tasks: GiTasks = {
  commissions: { finished: 4, total: 4 },
  abyss: { start: 1_789_502_400, end: 1_792_094_399, stars: 36, maxStars: 36 },
  expeditions: [
    { character: 'Xiangling', id: 202, start: 1_791_000_000, hours: 20, doneAt: 1_791_072_000 },
  ],
  realm: { value: 2_400, limit: 2_400 },
  welkin: { days: 30 },
}

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

describe('gi_tasks in captures', () => {
  it('stores them, sends them in the bundle and exports them', async () => {
    const { client, account, importKey } = await setup()
    const first = (await (
      await importByKey(importKey, sampleGood({ ...sampleExtras(), gi_tasks: tasks }), 1_000)
    ).json()) as ImportResponse
    expect(first.status).toBe('created')
    // The next login: two commissions done, nothing else moved.
    const next: GiTasks = { ...tasks, commissions: { finished: 2, total: 4 } }
    const second = (await (
      await importByKey(importKey, sampleGood({ ...sampleExtras(), gi_tasks: next }), 2_000)
    ).json()) as ImportResponse
    expect(second.status).toBe('created')

    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${first.snapshotId}/good`,
    )
    expect(exported.gi_tasks).toEqual(tasks)
    expect(Object.keys(exported).at(-1)).toBe('gi_tasks')
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_tasks).toEqual(next)

    const { snapshots, texts } = await decodeBundle(
      await (
        await client.fetch(`/api/accounts/${account.id}/bundle?sections=tasks&format=2`)
      ).arrayBuffer(),
    )
    expect(snapshots).toHaveLength(2)
    const [a, b] = snapshots
    expect(a!.tasks).not.toBe(b!.tasks)
    expect([...texts.keys()].sort()).toEqual([a!.tasks, b!.tasks].sort())
    const newest = snapshots.find((s) => s.id === second.snapshotId)!
    expect(decodeTasks(JSON.parse(texts.get(newest.tasks!)!) as TasksSection)).toEqual(next)
  })

  it('keeps re-uploading a capture a no-op when it was stored before the tasks', async () => {
    const { importKey } = await setup()
    const anecdotes: GiAnecdotes = { anecdotes: {}, unlockedAreas: [1] }
    // As the tracker stored irminsul's files before it kept gi_tasks.
    const created = (await (
      await importByKey(
        importKey,
        sampleGood({ ...sampleExtras(), gi_anecdotes: anecdotes }),
        1_000,
      )
    ).json()) as ImportResponse
    const again = await importByKey(
      importKey,
      sampleGood({ ...sampleExtras(), gi_anecdotes: anecdotes, gi_tasks: tasks }),
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
      sampleGood({ ...sampleExtras(), gi_anecdotes: anecdotes, gi_tasks: tasks }),
      2_000,
    )
    expect(((await later.json()) as ImportResponse).status).toBe('created')
  })

  it('drops a part out of range and keeps the rest of the upload', async () => {
    const { client, account, importKey } = await setup()
    const bad = { ...tasks, commissions: { finished: 9, total: 4 } }
    const response = await importByKey(importKey, sampleGood({ gi_tasks: bad }), 1_000)
    expect(response.status).toBe(201)
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    const { commissions: _, ...rest } = tasks
    expect(latest.gi_tasks).toEqual(rest)
  })
})
