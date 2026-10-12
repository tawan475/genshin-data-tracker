import {
  decodeAnecdotes,
  decodeBundle,
  type AccountCreatedResponse,
  type AnecdoteMarksResponse,
  type AnecdotesSection,
  type Good,
  type GiAnecdotes,
  type ImportResponse,
  type LiveEvent,
} from '@gdt/shared'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

/** Made-up states over real anecdote ids. */
const anecdotes: GiAnecdotes = {
  anecdotes: {
    '100001': { state: 3, finishCount: 1 },
    '101604': { state: 0, finishCount: 3 },
    '109201': { state: 2, finishCount: 0 },
  },
  unlockedAreas: [1, 2, 3, 4, 5, 6, 7, 8],
  reward: { index: 12, progress: 4, target: 10 },
  wish: { npcId: 9801, lastWishTime: 1_791_000_000 },
}

function importByKey(key: string, good: unknown, timestamp?: number) {
  return SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
    method: 'POST',
    headers: { 'x-import-key': key },
    body: irminsulForm(good, timestamp),
  })
}

async function setup() {
  const { client, me } = await signUp()
  const { account, importKey } = await client.json<AccountCreatedResponse>('/api/accounts', {
    method: 'POST',
    json: { name: 'Alt', uid: '812345678', server: 'ASIA' },
  })
  const marks = `/api/accounts/${account.id}/anecdote-marks`
  return { client, me, account, importKey, marks }
}

describe('gi_anecdotes in captures', () => {
  it('stores them, shares the section across captures, and exports them', async () => {
    const { client, account, importKey } = await setup()
    const good = sampleGood({ ...sampleExtras(), gi_anecdotes: anecdotes })
    const first = (await (await importByKey(importKey, good, 1_000)).json()) as ImportResponse
    expect(first.status).toBe('created')

    // A later capture with one more recorded: a new snapshot, a new anecdotes section.
    const more: GiAnecdotes = {
      ...anecdotes,
      anecdotes: { ...anecdotes.anecdotes, '100002': { state: 3, finishCount: 1 } },
      reward: { index: 12, progress: 5, target: 10 },
    }
    const later = sampleGood({ ...sampleExtras(), gi_anecdotes: more })
    const second = (await (await importByKey(importKey, later, 2_000)).json()) as ImportResponse
    expect(second.status).toBe('created')
    // Resin moved only: the anecdotes section is shared.
    const extras = sampleExtras()
    const relogin = sampleGood({
      ...extras,
      gi_player: { ...extras.gi_player, resin: 3 },
      gi_anecdotes: more,
    })
    expect((await importByKey(importKey, relogin, 3_000)).status).toBe(201)

    const exported = await client.json<Good>(
      `/api/accounts/${account.id}/snapshots/${first.snapshotId}/good`,
    )
    expect(exported.gi_anecdotes).toEqual(anecdotes)
    expect(Object.keys(exported).at(-1)).toBe('gi_anecdotes')
    const latest = await client.json<Good>(`/api/accounts/${account.id}/latest/good`)
    expect(latest.gi_anecdotes).toEqual(more)

    const { snapshots, texts } = await decodeBundle(
      await (
        await client.fetch(`/api/accounts/${account.id}/bundle?sections=anecdotes&format=2`)
      ).arrayBuffer(),
    )
    expect(snapshots).toHaveLength(3)
    const [a, b, c] = snapshots
    expect(b!.anecdotes).not.toBe(a!.anecdotes)
    expect(c!.anecdotes).toBe(b!.anecdotes)
    // Only the anecdotes sections came along.
    expect([...texts.keys()].sort()).toEqual([a!.anecdotes, b!.anecdotes].sort())
    expect(decodeAnecdotes(JSON.parse(texts.get(c!.anecdotes!)!) as AnecdotesSection)).toEqual(more)

    // An app from before them (GDT1, every section) still gets a bundle.
    expect((await client.fetch(`/api/accounts/${account.id}/bundle`)).status).toBe(200)
  })

  it('keeps re-uploading a capture a no-op when it was stored before the anecdotes', async () => {
    const { importKey } = await setup()
    // As the tracker stored irminsul's files before it kept gi_anecdotes.
    const created = (await (
      await importByKey(importKey, sampleGood(sampleExtras()), 1_000)
    ).json()) as ImportResponse
    const again = await importByKey(
      importKey,
      sampleGood({ ...sampleExtras(), gi_anecdotes: anecdotes }),
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
      sampleGood({ ...sampleExtras(), gi_anecdotes: anecdotes }),
      2_000,
    )
    expect(((await later.json()) as ImportResponse).status).toBe('created')
  })

  it('refuses a file with more entries than the game could have', async () => {
    const { importKey } = await setup()
    const many = Object.fromEntries(
      Array.from({ length: 2001 }, (_, i) => [String(100_000 + i), { state: 3, finishCount: 1 }]),
    )
    const response = await importByKey(
      importKey,
      sampleGood({ gi_anecdotes: { anecdotes: many, unlockedAreas: [1] } }),
      1_000,
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: 'too_many_items' } })
  })
})

describe('anecdote marks', () => {
  it('marks and unmarks, answering with the whole list', async () => {
    const { client, marks } = await setup()
    expect(await client.json<AnecdoteMarksResponse>(marks)).toEqual({ done: [] })

    const patch = (json: object) =>
      client.json<AnecdoteMarksResponse>(marks, { method: 'PATCH', json })
    expect(await patch({ done: [103602, 100001, 100001] })).toEqual({ done: [100001, 103602] })
    expect(await patch({ undone: [100001] })).toEqual({ done: [103602] })
    // `done` first, then `undone`: in both ends unmarked.
    expect(await patch({ done: [100002], undone: [100002] })).toEqual({ done: [103602] })
    expect(await client.json<AnecdoteMarksResponse>(marks)).toEqual({ done: [103602] })
  })

  it('refuses ids outside the game range, empty changes, and other users', async () => {
    const { client, account, marks } = await setup()
    for (const json of [{ done: [99_999] }, { done: [200_000] }, { done: [1.5] }, {}]) {
      expect((await client.fetch(marks, { method: 'PATCH', json })).status).toBe(400)
    }
    const stranger = await signUp()
    expect((await stranger.client.fetch(marks)).status).toBe(404)
    const sneaky = await stranger.client.fetch(marks, {
      method: 'PATCH',
      json: { done: [100001] },
    })
    expect(sneaky.status).toBe(404)
    const rows = await env.DB.prepare('SELECT * FROM anecdote_marks WHERE account_id = ?1')
      .bind(account.id)
      .all()
    expect(rows.results).toEqual([])
  })

  it('goes with the account', async () => {
    const { client, account, marks } = await setup()
    await client.json(marks, { method: 'PATCH', json: { done: [100001] } })
    expect((await client.fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })).status).toBe(
      204,
    )
    const rows = await env.DB.prepare('SELECT * FROM anecdote_marks WHERE account_id = ?1')
      .bind(account.id)
      .all()
    expect(rows.results).toEqual([])
  })

  it("tells the user's open pages, naming the tab that wrote", async () => {
    const { client, account, marks } = await setup()
    const response = await client.fetch('/api/live', {
      headers: { upgrade: 'websocket', origin: ORIGIN },
    })
    expect(response.status).toBe(101)
    const socket = response.webSocket!
    socket.accept()
    const messages: LiveEvent[] = []
    let wake: (() => void) | null = null
    socket.addEventListener('message', (event) => {
      messages.push(JSON.parse(String(event.data)) as LiveEvent)
      wake?.()
    })
    const next = async () => {
      const until = Date.now() + 2000
      while (messages.length === 0 && Date.now() < until) {
        await new Promise<void>((resolve) => {
          wake = resolve
          setTimeout(resolve, 50)
        })
      }
      const message = messages.shift()
      if (!message) throw new Error('No live message')
      return message
    }
    expect((await next()).type).toBe('hello')

    await client.json(marks, {
      method: 'PATCH',
      json: { done: [100001] },
      headers: { 'x-gdt-tab': 'tab-1' },
    })
    expect(await next()).toEqual<LiveEvent>({
      type: 'planner',
      accountId: account.id,
      tab: 'tab-1',
    })
    // A refused write says nothing.
    expect((await client.fetch(marks, { method: 'PATCH', json: {} })).status).toBe(400)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(messages).toEqual([])
    socket.close(1000)
  })
})
