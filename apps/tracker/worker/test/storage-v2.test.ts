import { env, SELF } from 'cloudflare:test'
import {
  catalogFromRows,
  decodeBundle,
  decodeSnapshot,
  encodeSectionBlob,
  inflateBundle,
  readBundle,
  storedSnapshotOf,
  type AccountResponse,
  type CatalogRow,
  type Good,
  type ImportResponse,
  type SnapshotResponse,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { describe, expect, it } from 'vitest'
import { runMaintenance, TRASH_DAYS } from '../services/maintenance'
import { repack, type RepackResult } from '../services/repack'
import {
  ORIGIN,
  bigGood,
  irminsulForm,
  sampleExtras,
  sampleGood,
  signUp,
  type Client,
} from './client'
import { importV1 } from './v1-import'

const DIAG = 'test-diag-key-test-diag-key-test-diag-key'

async function setUp() {
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
  return { client, account, upload }
}

/** Captures that exercise every v1 shape: deltas of each kind, out of order, a relogin. */
function v1Sequence(): [Good, number][] {
  const big = bigGood()
  const played = bigGood({
    artifacts: big.artifacts.map((a, i) => (i === 5 || i === 9 ? { ...a, lock: !a.lock } : a)),
    materials: { ...big.materials, Mora: 5, Crystalfly: 9 },
    gi_achievement_times: { ...big.gi_achievement_times, '84584': 1_791_189_294 },
  })
  const { '81001': _, ...fewer } = big.gi_achievement_times!
  const older = bigGood({
    artifacts: big.artifacts.slice(1),
    gi_achievement_times: { ...fewer, '81002': 1_700_000_001 },
  })
  const relogin = { ...played, gi_player: { ...played.gi_player!, resin: 1 } }
  const levelled = {
    ...relogin,
    artifacts: [
      ...relogin.artifacts.slice(0, 3),
      { ...relogin.artifacts[3]!, level: 16, substats: [{ key: 'critDMG_', value: 14.8 }] },
      ...relogin.artifacts.slice(4),
    ],
    materials: { ...relogin.materials, BrandNewMaterial: 2 },
    characters: relogin.characters.map((c) => ({ ...c, level: 90 })),
  }
  return [
    [big, 1_000],
    [played, 3_000],
    [older, 2_000],
    [relogin, 4_000],
    [levelled, 5_000],
  ]
}

/** Everything a reader can see of an account, as text, each in the form a client gets it. */
async function exportsOf(client: Client, accountId: number) {
  const base = `/api/accounts/${accountId}`
  const list = await client.json<SnapshotResponse[]>(`${base}/snapshots`)
  const catalogRows = await client.json<CatalogRow[]>(`${base}/catalog`)
  const catalog = catalogFromRows(catalogRows)
  const goods: Record<number, string> = {}
  for (const { id } of list) {
    goods[id] = await (await client.fetch(`${base}/snapshots/${id}/good`)).text()
  }
  const latest = await (await client.fetch(`${base}/latest/good`)).text()

  // An app from before v2 storage: GDT1, inflated.
  const gdt1 = readBundle(await (await client.fetch(`${base}/bundle`)).arrayBuffer())
  const texts1 = await inflateBundle(gdt1.blobs)
  const files1 = Object.fromEntries(
    gdt1.manifest.snapshots.map((s) => [
      s.id,
      JSON.stringify(
        decodeSnapshot(
          storedSnapshotOf(s, (key) => texts1.get(key)!),
          catalog,
          MATERIALS,
        ),
      ),
    ]),
  )
  // This app: GDT2.
  const gdt2 = await decodeBundle(
    await (await client.fetch(`${base}/bundle?format=2`)).arrayBuffer(),
  )
  const files2 = Object.fromEntries(
    gdt2.snapshots.map((s) => [
      s.id,
      JSON.stringify(
        decodeSnapshot(
          storedSnapshotOf(s, (key) => gdt2.texts.get(key)!),
          catalog,
          MATERIALS,
        ),
      ),
    ]),
  )
  const account = await client.json<AccountResponse>(base)
  return {
    list: JSON.stringify(list),
    catalog: JSON.stringify([...catalogRows].sort((a, b) => a[0] - b[0])),
    goods,
    latest,
    files1,
    files2,
    summary: JSON.stringify(account.latest),
  }
}

async function adminRepack(query = 'limit=500', key = DIAG): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/api/admin/repack?${query}`, {
    method: 'POST',
    headers: { 'x-diag-key': key },
  })
}

async function rowFormats(accountId: number) {
  const row = await env.DB.prepare(
    `SELECT sum(characters_ref IS NULL) AS v1, sum(characters_ref IS NOT NULL) AS v2,
       (SELECT count(*) FROM blobs WHERE account_id = ?1) AS legacyBlobs,
       (SELECT count(*) FROM artifacts WHERE account_id = ?1) AS legacyArtifacts,
       (SELECT count(*) FROM artifact_chunks WHERE account_id = ?1) AS chunks
     FROM snapshots WHERE account_id = ?1`,
  )
    .bind(accountId)
    .first<{
      v1: number
      v2: number
      legacyBlobs: number
      legacyArtifacts: number
      chunks: number
    }>()
  return row!
}

describe('storage v2 conversion', () => {
  it('repacks v1 data without changing a byte of what any reader sees', async () => {
    const { client, account, upload } = await setUp()
    const ids: number[] = []
    for (const [good, at] of v1Sequence()) ids.push((await importV1(env.DB, account.id, good, at))!)
    // One in the trash: it is converted too (it may be restored).
    const trashed = (await importV1(env.DB, account.id, sampleGood(sampleExtras()), 6_000))!
    await client.fetch(`/api/accounts/${account.id}/snapshots/${trashed}`, { method: 'DELETE' })
    expect(await rowFormats(account.id)).toMatchObject({ v1: 6, v2: 0 })

    const before = await exportsOf(client, account.id)
    // v1 reads are what v1 wrote: a sanity check of the fixture.
    expect(Object.keys(before.files1)).toHaveLength(5)
    expect(before.files2).toEqual(before.files1)

    const response = await adminRepack()
    expect(response.status).toBe(200)
    // The test database is shared by this file's tests: look at this account.
    const result = (await response.json()) as RepackResult
    expect(result.snapshots.converted).toBeGreaterThanOrEqual(6)
    expect(result.snapshots.mismatched).toEqual([])
    expect(result.catalog.mismatchedAccounts).toEqual([])
    expect(result.remaining).toMatchObject({ snapshots: 0, legacyArtifacts: 0 })
    expect(await rowFormats(account.id)).toMatchObject({
      v1: 0,
      v2: 6,
      legacyBlobs: 0,
      legacyArtifacts: 0,
    })

    const after = await exportsOf(client, account.id)
    expect(after.goods).toEqual(before.goods)
    expect(after.latest).toBe(before.latest)
    expect(after.files1).toEqual(before.files1)
    expect(after.files2).toEqual(before.files1)
    expect(after.catalog).toBe(before.catalog)
    expect(after.list).toBe(before.list)
    expect(after.summary).toBe(before.summary)

    // Re-uploading a converted capture is still a no-op; a new one stores v2.
    const [[played]] = [v1Sequence()[1]!]
    expect(await upload(played, 3_000)).toMatchObject({ status: 'unchanged', snapshotId: ids[1] })
    const next = bigGood({ materials: { ...played.materials, Mora: 77 } })
    const created = await upload(next, 7_000)
    expect(created.status).toBe('created')
    expect(
      JSON.parse((await exportsOf(client, account.id)).goods[created.snapshotId]!),
    ).toMatchObject({
      materials: { Mora: 77 },
    })

    // Collection keeps every section something needs; a second repack has nothing to do.
    await runMaintenance(env.DB)
    const collected = await exportsOf(client, account.id)
    expect(collected.goods[ids[3]!]).toBe(before.goods[ids[3]!])
    const again = (await (await adminRepack()).json()) as RepackResult
    expect(again.snapshots.converted).toBe(0)
    expect(again.catalog.moved).toBe(0)
  })

  it('refuses rows whose re-encoded form does not decode to the same data', async () => {
    const { client, account } = await setUp()
    const ids: number[] = []
    for (const [good, at] of v1Sequence().slice(0, 2)) {
      ids.push((await importV1(env.DB, account.id, good, at))!)
    }
    const before = await exportsOf(client, account.id)
    // A broken encoder: it stores a different Mora than it was given.
    const result = await repack(env.DB, {
      limit: 100,
      encodeSection: (kind, value, delta, base) => {
        if (kind === 'materials' && !delta) {
          const m = (value as { m: [number | string, number][] }).m
          value = { m: m.map(([k, n], i) => [k, i === 0 ? n + 1 : n]) }
        }
        return encodeSectionBlob(kind, value, delta, base)
      },
    })
    expect(result.snapshots.mismatched).toEqual(expect.arrayContaining(ids))
    expect(await rowFormats(account.id)).toMatchObject({ v1: 2, v2: 0 })
    const after = await exportsOf(client, account.id)
    expect(after.goods).toEqual(before.goods)
    // A working encoder then converts them.
    expect((await repack(env.DB, { limit: 1000 })).snapshots.mismatched).toEqual([])
    expect(await rowFormats(account.id)).toMatchObject({ v1: 0, v2: 2 })
    expect((await exportsOf(client, account.id)).goods).toEqual(before.goods)
  })

  it('reads accounts holding both formats, before and after repack', async () => {
    const { client, account, upload } = await setUp()
    const [first, second, , relogin] = v1Sequence()
    await importV1(env.DB, account.id, first![0], first![1])
    await importV1(env.DB, account.id, second![0], second![1])
    // New imports on top of v1 data are v2.
    expect((await upload(relogin![0], relogin![1])).status).toBe('created')
    expect(
      (
        await upload(
          { ...relogin![0], gi_player: { ...relogin![0].gi_player!, resin: 150 } },
          4_500,
        )
      ).status,
    ).toBe('created')
    expect(await rowFormats(account.id)).toMatchObject({ v1: 2, v2: 2 })
    const before = await exportsOf(client, account.id)
    expect(Object.keys(before.files2)).toHaveLength(4)
    expect(before.files2).toEqual(before.files1)
    for (const id of Object.keys(before.files1)) {
      expect(before.files1[Number(id)]).toBe(before.goods[Number(id)])
    }
    await adminRepack()
    const after = await exportsOf(client, account.id)
    expect(after.goods).toEqual(before.goods)
    expect(after.files1).toEqual(before.files1)
    expect(after.files2).toEqual(before.files1)
  })

  it('serves bundles of some sections, as the app pages ask for them', async () => {
    const { client, account, upload } = await setUp()
    const [first, second, , relogin] = v1Sequence()
    await importV1(env.DB, account.id, first![0], first![1])
    for (const [good, at] of [second!, relogin!])
      expect((await upload(good, at)).status).toBe('created')
    const base = `/api/accounts/${account.id}/bundle?format=2`
    const full = await decodeBundle(await (await client.fetch(base)).arrayBuffer())
    const latest = full.snapshots.at(-1)!
    for (const [query, slots] of [
      ['&sections=materials', ['materials', 'materialsKeyframe']],
      ['&sections=player', ['player']],
      ['&sections=characters', ['characters']],
      [
        '&sections=achievements,achievementTimes',
        ['achievements', 'achievementTimes', 'achievementTimesBase'],
      ],
      [`&ids=${latest.id}&sections=artifacts`, ['artifacts', 'artifactsBase']],
    ] as const) {
      const part = await decodeBundle(await (await client.fetch(base + query)).arrayBuffer())
      for (const snapshot of part.snapshots) {
        const whole = full.snapshots.find((s) => s.id === snapshot.id)!
        for (const slot of slots) {
          const key = snapshot[slot] as string | null | undefined
          if (!key) continue
          expect(part.texts.get(key), `${query} ${slot}`).toBe(
            full.texts.get(whole[slot] as string),
          )
        }
      }
    }
  })

  it('keeps the catalog in a few chunks: imports add small ones, repack merges them', async () => {
    const { client, account, upload } = await setUp()
    const good = sampleGood(sampleExtras())
    for (let i = 0; i < 6; i++) {
      const extra = { ...good.artifacts[1]!, substats: [{ key: 'hp', value: 1000 + i }] }
      await upload({ ...good, artifacts: [...good.artifacts, extra] }, 1_000 + i)
    }
    const before = await exportsOf(client, account.id)
    expect((await rowFormats(account.id)).chunks).toBe(6)
    await adminRepack()
    expect(await rowFormats(account.id)).toMatchObject({ chunks: 1, legacyArtifacts: 0 })
    const after = await exportsOf(client, account.id)
    expect(after.catalog).toBe(before.catalog)
    expect(after.goods).toEqual(before.goods)
  })

  it('collects v2 sections only once nothing needs them', async () => {
    const { client, account, upload } = await setUp()
    const big = bigGood()
    const a = await upload(big, 1_000)
    const b = await upload({ ...big, materials: { ...big.materials, Mora: 3 } }, 2_000)
    await client.fetch(`/api/accounts/${account.id}/snapshots/${a.snapshotId}`, {
      method: 'DELETE',
    })
    const kept = await exportsOf(client, account.id)
    await runMaintenance(env.DB, Date.now() + (TRASH_DAYS + 1) * 86_400_000)
    // b's materials delta needs a's keyframe: still there after a is purged.
    expect((await exportsOf(client, account.id)).goods[b.snapshotId]).toBe(kept.goods[b.snapshotId])
  })

  it('opens the admin routes only to the diag key', async () => {
    expect((await adminRepack('limit=1', 'wrong')).status).toBe(404)
    expect((await SELF.fetch(`${ORIGIN}/api/admin/repack`)).status).toBe(404)
    const status = await SELF.fetch(`${ORIGIN}/api/admin/repack`, {
      headers: { 'x-diag-key': DIAG },
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ remaining: { snapshots: expect.any(Number) } })
    expect((await adminRepack('limit=nope')).status).toBe(400)
  })
})
