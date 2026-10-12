/**
 * The "wish link" import, as paimon.moe's: the browser pages through the
 * game's wish history API, through the tracker's own proxy (HoYoverse's
 * API does not answer browsers), banner after banner, 20 records a page,
 * newest first, and stops each banner at the newest pull already stored.
 * Paced like irminsul: a second between pages, two between banners; a
 * failed request is tried again, "visit too frequently" waits longer, an
 * expired link ends the run. The records then go through the website
 * import (merged by id).
 */

import { WISH_PAGE_SIZE, type WishNewest, type WishRecord } from '@gdt/shared'

/** The API's answer, as the proxy hands it back. */
export interface WishPageAnswer {
  retcode: number
  message: string
  data: { list: WishRecord[]; region?: string } | null
}

/** Banners in the order they are fetched (301 brings its 400 records too). */
export const LINK_BANNERS = [301, 302, 500, 200, 100] as const

export type WishLinkErrorCode = 'expired' | 'throttled' | 'api' | 'network' | 'cancelled'

export class WishLinkError extends Error {
  constructor(
    readonly code: WishLinkErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WishLinkError'
  }
}

export interface LinkProgress {
  banner: number
  page: number
  /** New records found so far, all banners. */
  found: number
}

export interface LinkFetchOptions {
  /** One page through the proxy; throws on a transport failure. */
  fetchPage: (gachaType: number, page: number, endId: string) => Promise<WishPageAnswer>
  /** Highest game id held per banner: a banner stops there. */
  newest: WishNewest
  onProgress?: (progress: LinkProgress) => void
  signal?: AbortSignal
  sleep?: (ms: number) => Promise<void>
  pageDelay?: number
  bannerDelay?: number
  /** Tries per page on network errors or throttling. */
  tries?: number
  /** Pages per banner at most (the API keeps about six months). */
  maxPages?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isExpired(answer: WishPageAnswer): boolean {
  return (
    answer.retcode === -101 ||
    /authkey (timeout|error)|auth.?key.*(invalid|expired)/i.test(answer.message)
  )
}
function isThrottled(answer: WishPageAnswer): boolean {
  return answer.retcode === -110 || /too frequent/i.test(answer.message)
}

/**
 * Every record newer than what is held, per banner, newest first; and the
 * UID they belong to (null when there are none).
 */
export async function fetchWishLink(
  options: LinkFetchOptions,
): Promise<{ records: WishRecord[]; uid: string | null }> {
  const sleep = options.sleep ?? defaultSleep
  const pageDelay = options.pageDelay ?? 1000
  const bannerDelay = options.bannerDelay ?? 2000
  const tries = options.tries ?? 3
  const maxPages = options.maxPages ?? 1000
  const records: WishRecord[] = []
  let uid: string | null = null
  const check = () => {
    if (options.signal?.aborted) throw new WishLinkError('cancelled', 'Cancelled')
  }

  async function page(gachaType: number, n: number, endId: string): Promise<WishPageAnswer> {
    for (let attempt = 1; ; attempt++) {
      check()
      let answer: WishPageAnswer
      try {
        answer = await options.fetchPage(gachaType, n, endId)
      } catch (error) {
        if (error instanceof WishLinkError) throw error
        if (attempt >= tries) {
          throw new WishLinkError('network', 'The wish history did not answer. Try again later.')
        }
        await sleep(pageDelay * 2 * attempt)
        continue
      }
      if (answer.retcode === 0) return answer
      if (isExpired(answer)) {
        throw new WishLinkError(
          'expired',
          'The link expired. Open Wish → History in game again and copy a new one.',
        )
      }
      if (isThrottled(answer) && attempt < tries) {
        await sleep(5000 * attempt)
        continue
      }
      throw new WishLinkError(
        isThrottled(answer) ? 'throttled' : 'api',
        isThrottled(answer)
          ? 'HoYoverse asks to slow down. Try again in a few minutes.'
          : `HoYoverse answered: ${answer.message || `error ${answer.retcode}`}`,
      )
    }
  }

  for (const [index, banner] of LINK_BANNERS.entries()) {
    if (index > 0) await sleep(bannerDelay)
    const held = options.newest[String(banner) as keyof WishNewest]
    const stopAt = held ? BigInt(held) : null
    let endId = '0'
    for (let n = 1; n <= maxPages; n++) {
      if (n > 1) await sleep(pageDelay)
      options.onProgress?.({ banner, page: n, found: records.length })
      const answer = await page(banner, n, endId)
      const list = answer.data?.list ?? []
      let reached = false
      for (const record of list) {
        if (stopAt !== null && /^\d+$/.test(record.id ?? '') && BigInt(record.id!) <= stopAt) {
          reached = true
          break
        }
        uid ??= record.uid ?? null
        records.push(record)
      }
      if (reached || list.length < WISH_PAGE_SIZE) break
      endId = list.at(-1)!.id ?? '0'
    }
  }
  check()
  options.onProgress?.({ banner: 0, page: 0, found: records.length })
  return { records, uid }
}
