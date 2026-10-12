/**
 * Wish history on the page: the stored chunks decoded, and per banner the
 * pity counts and 50/50 outcomes.
 *
 * Rules (as paimon.moe counts them):
 * - Pity: pulls since the last 5★ (or 4★), that pull included. A 5★ does
 *   not reset the 4★ count. 301 and 400 share one count.
 * - Character Event (301 + 400): a 5★ that is the banner's featured
 *   character won the 50/50 (or was guaranteed after a loss); any other 5★
 *   lost it, and the next 5★ is guaranteed. The same for 4★ with the three
 *   featured 4★ characters.
 * - Weapon Event (302): a 5★ that is one of the two featured weapons won
 *   (75/25) or was guaranteed; a standard 5★ lost, the next 5★ is a
 *   featured one. Which of the two (Epitomized Path) is not tracked: the
 *   history doesn't say which weapon was charted.
 * - Chronicled, Standard, Beginners': pity only.
 * - Capturing Radiance (5.0+) is not modelled: the history can't tell a
 *   radiance win from a plain one. What is counted is how many 50/50s were
 *   lost in a row.
 * Featured items come from banner data adapted from paimon.moe (MIT,
 * wish-banners.json, apps/tracker/scripts/wish-data.mjs). A pull outside
 * every known banner (one newer than the data) gets no outcome, and the
 * guarantee after it reads as unknown.
 */

import {
  decodeWishChunk,
  fromBase64,
  parseWishTime,
  type UigfGachaType,
  type WishHistoryResponse,
  type WishPull,
} from '@gdt/shared'

export interface WishHistory {
  /** Hours from UTC of the pull times (the account's server clock). */
  timezone: number
  /** Pulls per UIGF banner type, in pull order. */
  banners: ReadonlyMap<UigfGachaType, readonly WishPull[]>
  total: number
  bytes: number
}

export function decodeWishHistory(response: WishHistoryResponse): WishHistory {
  const banners = new Map<UigfGachaType, WishPull[]>()
  let total = 0
  for (const chunk of response.chunks) {
    const data = fromBase64(chunk.data)
    if (!data) continue
    const pulls = decodeWishChunk(chunk.banner, data)
    total += pulls.length
    const list = banners.get(chunk.banner)
    if (list) list.push(...pulls)
    else banners.set(chunk.banner, pulls)
  }
  return { timezone: response.timezone ?? 8, banners, total, bytes: response.bytes }
}

// ------------------------------------------------------------------ banners

export type EventKind = 'character' | 'weapon' | 'chronicled'

export interface EventBanner {
  kind: EventKind
  /** UTC seconds. */
  start: number
  end: number
  featured5: readonly string[]
  featured4: readonly string[]
  version: string
}

export interface BannerFile {
  columns: string[]
  banners: [EventKind, string, string, 0 | 1, string[], string[], string][]
}

/**
 * The banners in UTC: paimon.moe writes times in UTC+8, except the ones
 * that open on each server's own clock (`serverTime`), which `timezone`
 * places.
 */
export function eventBanners(file: BannerFile, timezone: number): Map<EventKind, EventBanner[]> {
  const out = new Map<EventKind, EventBanner[]>()
  const utc = (text: string, serverTime: boolean) =>
    (parseWishTime(text) ?? 0) - (serverTime ? timezone : 8) * 3600
  for (const [kind, start, end, serverTime, featured5, featured4, version] of file.banners) {
    const list = out.get(kind) ?? []
    list.push({
      kind,
      start: utc(start, serverTime === 1),
      // A phase ends at one instant everywhere (UTC+8 in the data).
      end: utc(end, false),
      featured5,
      featured4,
      version,
    })
    out.set(kind, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.start - b.start)
  return out
}

/** The banner a pull (UTC seconds) was made on, or null. Banners are sorted by start. */
export function bannerAt(banners: readonly EventBanner[], utc: number): EventBanner | null {
  let lo = 0
  let hi = banners.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (banners[mid]!.start <= utc) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  // Two banners can share a start (a dual phase listed twice): check a few back.
  for (let i = found; i >= 0 && i >= found - 3; i--) {
    const b = banners[i]!
    if (b.start <= utc && utc <= b.end) return b
  }
  // Between two banners: an update day, where a server's clock opens the
  // next banner earlier than the data's start says. The one opening soon.
  const next = banners[found + 1]
  return next && next.start - utc < 86_400 ? next : null
}

// ---------------------------------------------------------------- pity

export type Outcome = 'won' | 'lost' | 'guaranteed'

export interface PullRow {
  pull: WishPull
  /** 1-based, in the banner's pull order. */
  number: number
  /** Pulls this 4★ / 5★ took; 0 for 3★. */
  pity: number
  /** 50/50 (or 75/25) result; null where the banner has none or is not known. */
  outcome: Outcome | null
}

export interface BannerStats {
  banner: UigfGachaType
  total: number
  /** Pulls since the last 5★ (toward the 90 pity). */
  pity5: number
  pity4: number
  /** The next 5★ is a featured one; null: no 50/50 here, or not known. */
  guaranteed5: boolean | null
  guaranteed4: boolean | null
  /** 50/50s won and lost (5★, outcome not guaranteed). */
  won5: number
  lost5: number
  /** 50/50s lost in a row, up to the newest 5★. */
  lostStreak: number
  /** Every pull, newest first. */
  rows: PullRow[]
  /** 5★ and 4★ pulls, newest first. */
  fives: PullRow[]
  fours: PullRow[]
}

/** Hard pity per banner type (5★, 4★). */
export const HARD_PITY: Readonly<Record<UigfGachaType, [number, number]>> = {
  100: [90, 10],
  200: [90, 10],
  301: [90, 10],
  302: [80, 10],
  500: [90, 10],
}

const EVENT_KIND: Partial<Record<UigfGachaType, EventKind>> = {
  301: 'character',
  302: 'weapon',
}

export function bannerStats(
  banner: UigfGachaType,
  pulls: readonly WishPull[],
  options: { timezone: number; banners: ReadonlyMap<EventKind, readonly EventBanner[]> | null },
): BannerStats {
  const kind = EVENT_KIND[banner]
  const list = kind && options.banners ? (options.banners.get(kind) ?? []) : null
  let pity5 = 0
  let pity4 = 0
  // null: not known (a pull outside the banner data broke the chain).
  let guaranteed5: boolean | null = list ? false : null
  let guaranteed4: boolean | null = list ? false : null
  let won5 = 0
  let lost5 = 0
  let lostStreak = 0
  const rows: PullRow[] = []
  pulls.forEach((pull, i) => {
    pity5++
    pity4++
    const rank = pull.item.rank
    let pity = 0
    let outcome: Outcome | null = null
    if (rank === 5 || rank === 4) {
      pity = rank === 5 ? pity5 : pity4
      if (list) {
        const on = bannerAt(list, pull.time - options.timezone * 3600)
        const featured = on ? (rank === 5 ? on.featured5 : on.featured4) : null
        const before = rank === 5 ? guaranteed5 : guaranteed4
        let after: boolean | null
        if (!featured || !pull.item.key) {
          after = null
        } else if (featured.includes(pull.item.key)) {
          outcome = before ? 'guaranteed' : 'won'
          after = false
        } else {
          outcome = 'lost'
          after = true
        }
        if (rank === 5) {
          guaranteed5 = after
          if (outcome === 'won') {
            won5++
            lostStreak = 0
          } else if (outcome === 'lost') {
            lost5++
            lostStreak++
          }
        } else guaranteed4 = after
      }
      if (rank === 5) pity5 = 0
      else pity4 = 0
    }
    rows.push({ pull, number: i + 1, pity, outcome })
  })
  rows.reverse()
  return {
    banner,
    total: pulls.length,
    pity5,
    pity4,
    guaranteed5,
    guaranteed4,
    won5,
    lost5,
    lostStreak,
    rows,
    fives: rows.filter((r) => r.pull.item.rank === 5),
    fours: rows.filter((r) => r.pull.item.rank === 4),
  }
}
