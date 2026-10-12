import { describe, expect, it } from 'vitest'
import type { WishNewest, WishRecord } from '@gdt/shared'
import { fetchWishLink, WishLinkError, type WishPageAnswer } from '../wish-link-import'

const UID = '811111111'
const NONE: WishNewest = { '100': null, '200': null, '301': null, '302': null, '500': null }

/** A banner's history as the API holds it: ids counting down from `top`. */
function history(banner: number, count: number, top = 1_790_000_000_000_000_000n): WishRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(top - BigInt(i) * 7n),
    uid: UID,
    gacha_type: String(banner),
    time: '2026-10-01 10:00:00',
    name: 'Slingshot',
    item_type: 'Weapon',
    rank_type: '3',
  }))
}

/** The proxy, faked: pages of 20 after `end_id`, and every call made. */
function fakeApi(banners: Record<number, WishRecord[]>) {
  const calls: { gachaType: number; page: number; endId: string }[] = []
  const fetchPage = async (
    gachaType: number,
    page: number,
    endId: string,
  ): Promise<WishPageAnswer> => {
    calls.push({ gachaType, page, endId })
    const all = banners[gachaType] ?? []
    const start = endId === '0' ? 0 : all.findIndex((r) => r.id === endId) + 1
    return { retcode: 0, message: 'OK', data: { list: all.slice(start, start + 20) } }
  }
  return { calls, fetchPage }
}

const noSleep = async () => {}

describe('wish link import', () => {
  it('pages each banner after the last id and stops at an empty or short page', async () => {
    const api = fakeApi({ 301: history(301, 45), 200: history(200, 20) })
    const result = await fetchWishLink({ fetchPage: api.fetchPage, newest: NONE, sleep: noSleep })
    expect(result.records.length).toBe(65)
    expect(result.uid).toBe(UID)
    const banner301 = api.calls.filter((c) => c.gachaType === 301)
    expect(banner301.map((c) => [c.page, c.endId])).toEqual([
      [1, '0'],
      [2, history(301, 45)[19]!.id],
      [3, history(301, 45)[39]!.id],
    ])
    // 200 is a full page, so a second (empty) page is asked; the empty banners once.
    expect(api.calls.filter((c) => c.gachaType === 200).length).toBe(2)
    expect(api.calls.map((c) => c.gachaType).filter((g, i, a) => a.indexOf(g) === i)).toEqual([
      301, 302, 500, 200, 100,
    ])
  })

  it('stops a banner at the newest pull already held', async () => {
    const all = history(302, 60)
    const api = fakeApi({ 302: all })
    const newest = { ...NONE, '302': all[25]!.id! }
    const result = await fetchWishLink({ fetchPage: api.fetchPage, newest, sleep: noSleep })
    expect(result.records.map((r) => r.id)).toEqual(all.slice(0, 25).map((r) => r.id))
    expect(api.calls.filter((c) => c.gachaType === 302).length).toBe(2)
  })

  it('paces requests: a second between pages, two between banners', async () => {
    const waits: number[] = []
    const api = fakeApi({ 301: history(301, 30) })
    await fetchWishLink({
      fetchPage: api.fetchPage,
      newest: NONE,
      sleep: async (ms) => void waits.push(ms),
    })
    expect(waits).toEqual([1000, 2000, 2000, 2000, 2000])
  })

  it('ends on an expired link, retries throttling and network failures', async () => {
    const expired = fetchWishLink({
      fetchPage: async () => ({ retcode: -101, message: 'authkey timeout', data: null }),
      newest: NONE,
      sleep: noSleep,
    })
    await expect(expired).rejects.toMatchObject({ code: 'expired' })

    let n = 0
    const flaky = await fetchWishLink({
      fetchPage: async () => {
        n++
        if (n === 1) throw new TypeError('network')
        if (n === 2) return { retcode: -110, message: 'visit too frequently', data: null }
        return { retcode: 0, message: 'OK', data: { list: [] } }
      },
      newest: NONE,
      sleep: noSleep,
    })
    expect(flaky.records).toEqual([])

    const down = fetchWishLink({
      fetchPage: async () => {
        throw new TypeError('network')
      },
      newest: NONE,
      sleep: noSleep,
    })
    await expect(down).rejects.toMatchObject({ code: 'network' })
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    const api = fakeApi({ 301: history(301, 100) })
    const run = fetchWishLink({
      fetchPage: async (...args) => {
        if (api.calls.length === 2) controller.abort()
        return api.fetchPage(...args)
      },
      newest: NONE,
      sleep: noSleep,
      signal: controller.signal,
    })
    await expect(run).rejects.toBeInstanceOf(WishLinkError)
    // The page in flight when it was cancelled ends; no other starts.
    expect(api.calls.length).toBe(3)
  })
})
