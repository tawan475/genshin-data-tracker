/**
 * Wish pulls as the tracker keeps them: one list per UIGF banner type, in
 * pull order, merged by id.
 *
 * Banners (`uigf_gacha_type`): 100 Beginners', 200 Standard, 301 Character
 * Event (the game's 301 and 400, which share pity), 302 Weapon Event, 500
 * Chronicled. A pull keeps its own `gacha_type` (400 or 301).
 *
 * Times are the game's wall clock ("2026-10-12 21:04:11", the server's own
 * time zone), kept as seconds as if that clock were UTC; the account's
 * time zone (hours from UTC) is stored once beside them.
 *
 * Ids: the game's are 19-digit decimals (above 10^18, rising with time).
 * A source without ids (paimon.moe's CSV and backups) gets synthetic ones in
 * a range the game never uses, 10^17 <= id < 10^18:
 *   10^17 + seconds * 10^7 + banner index * 10^6 + n
 * (banner index: 100, 200, 301, 302, 500 = 0-4; n = the pull's place among
 * the synthetic pulls of that banner and second). Such pulls are matched by
 * what they are instead: banner, time, item and which of that item it is
 * within the second. A real record that matches one replaces it. Any id
 * below 10^18 that arrives (another tool's made-up ids, or ours exported
 * and imported again) is treated the same way.
 */

import type { WishItem } from './items'

export const UIGF_GACHA_TYPES = [100, 200, 301, 302, 500] as const
export type UigfGachaType = (typeof UIGF_GACHA_TYPES)[number]
/** The game's own `gacha_type` values: the UIGF ones and 400 (Character Event Wish-2). */
export const GACHA_TYPES = [100, 200, 301, 302, 400, 500] as const
export type GachaType = (typeof GACHA_TYPES)[number]

export function isGachaType(value: number): value is GachaType {
  return (GACHA_TYPES as readonly number[]).includes(value)
}

export function uigfGachaType(gachaType: GachaType): UigfGachaType {
  return gachaType === 400 ? 301 : gachaType
}

export interface WishPull {
  /** A game id, or a synthetic one (isSyntheticWishId). */
  id: bigint
  /** Wall-clock seconds in the account's time zone (see the file comment). */
  time: number
  gachaType: GachaType
  item: WishItem
}

export const REAL_ID_MIN = 10n ** 18n
export const SYNTHETIC_ID_MIN = 10n ** 17n
/** The game's ids are signed 64-bit. */
export const WISH_ID_MAX = 2n ** 63n - 1n

/** Below 10^18: not the game's (see the file comment). */
export function isSyntheticWishId(id: bigint): boolean {
  return id < REAL_ID_MIN
}

const BANNER_INDEX: Readonly<Record<UigfGachaType, number>> = {
  100: 0,
  200: 1,
  301: 2,
  302: 3,
  500: 4,
}
const SYNTHETIC_PER_SECOND = 1_000_000

export function syntheticWishId(banner: UigfGachaType, time: number, n: number): bigint {
  if (!Number.isSafeInteger(time) || time < 0 || time >= 9e10) throw new RangeError(`time ${time}`)
  if (!Number.isSafeInteger(n) || n < 0 || n >= SYNTHETIC_PER_SECOND) throw new RangeError(`n ${n}`)
  return (
    SYNTHETIC_ID_MIN +
    BigInt(time) * 10_000_000n +
    BigInt(BANNER_INDEX[banner]) * 1_000_000n +
    BigInt(n)
  )
}

/** The `n` of a synthetic id (its place within its second). */
export function syntheticWishSeq(id: bigint): number {
  return Number(id % 1_000_000n)
}

/** A decimal id as the API writes it; null when it is not one (or out of range). */
export function parseWishId(text: string): bigint | null {
  if (!/^\d{1,19}$/.test(text)) return null
  const id = BigInt(text)
  return id > 0n && id <= WISH_ID_MAX ? id : null
}

const TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/

/** "2026-10-12 21:04:11" as wall-clock seconds; null when it is not such a time. */
export function parseWishTime(text: string): number | null {
  const m = TIME.exec(text.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59 || y < 2000) return null
  const ms = Date.UTC(y, mo - 1, d, h, mi, s)
  const back = new Date(ms)
  if (back.getUTCDate() !== d) return null
  return ms / 1000
}

export function formatWishTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

/** Pull order: by time, then by id (a ten-pull shares its second; ids order it). */
export function comparePulls(a: WishPull, b: WishPull): number {
  if (a.time !== b.time) return a.time - b.time
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Hours from UTC for a server (the game's clock there). */
export function serverTimezone(server: string | null | undefined): number {
  if (server === 'AMERICA') return -5
  if (server === 'EUROPE') return 1
  return 8
}

/** What a pull is, for matching pulls without game ids. */
function identity(item: WishItem): string {
  return item.key ? `${item.kind}:${item.key}` : `raw:${item.name}`
}

/**
 * Each pull's match key: time, item, and which of that item it is within
 * its second (two Slingshots in one ten-pull are #0 and #1). Pulls must be
 * in pull order.
 */
export function matchKeys(pulls: readonly WishPull[]): string[] {
  const seen = new Map<string, number>()
  return pulls.map((pull) => {
    const base = `${pull.time}|${identity(pull.item)}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}|${n}`
  })
}

export interface MergeResult {
  /** The banner's pulls, in pull order, synthetic ids renumbered. */
  pulls: WishPull[]
  /** Incoming pulls that were not held (by id, or by match for synthetic ones). */
  added: number
  /** Incoming pulls already held. */
  known: number
  /** Held synthetic pulls a real record replaced. */
  replaced: number
}

/**
 * Merges incoming pulls of one banner into the held ones (both any order).
 * Real ids are unique; a synthetic pull is dropped when a real or another
 * synthetic pull matches it (matchKeys). The synthetic `n` is then given out
 * again in pull order, so the same second's pulls keep their ids as long as
 * they arrive together.
 */
export function mergePulls(
  banner: UigfGachaType,
  held: readonly WishPull[],
  incoming: readonly WishPull[],
): MergeResult {
  const real = new Map<bigint, WishPull>()
  const heldSynthetic: WishPull[] = []
  for (const pull of held) {
    if (isSyntheticWishId(pull.id)) heldSynthetic.push(pull)
    else real.set(pull.id, pull)
  }
  let added = 0
  let known = 0
  const incomingSynthetic: WishPull[] = []
  for (const pull of incoming) {
    if (isSyntheticWishId(pull.id)) incomingSynthetic.push(pull)
    else if (real.has(pull.id)) known++
    else {
      real.set(pull.id, pull)
      added++
    }
  }
  const reals = [...real.values()].sort(comparePulls)
  const realKeys = new Set(matchKeys(reals))

  const keptSynthetic: WishPull[] = []
  const sortedHeld = heldSynthetic.sort(comparePulls)
  const heldKeys = matchKeys(sortedHeld)
  const heldKept = new Set<string>()
  let replaced = 0
  sortedHeld.forEach((pull, i) => {
    if (realKeys.has(heldKeys[i]!)) replaced++
    else {
      keptSynthetic.push(pull)
      heldKept.add(heldKeys[i]!)
    }
  })
  // Their tentative ids (from the reader) order a second's pulls.
  const ordered = incomingSynthetic.sort(comparePulls)
  const incomingKeys = matchKeys(ordered)
  ordered.forEach((pull, i) => {
    const key = incomingKeys[i]!
    if (realKeys.has(key) || heldKept.has(key)) known++
    else {
      keptSynthetic.push(pull)
      heldKept.add(key)
      added++
    }
  })

  // Synthetic ids again, in pull order (held ones first within a second).
  const synthetic = keptSynthetic
    .map((pull, i) => ({ pull, i }))
    .sort((a, b) => comparePulls(a.pull, b.pull) || a.i - b.i)
  const perSecond = new Map<number, number>()
  const renumbered = synthetic.map(({ pull }) => {
    const n = perSecond.get(pull.time) ?? 0
    perSecond.set(pull.time, n + 1)
    return { ...pull, id: syntheticWishId(banner, pull.time, n) }
  })
  return { pulls: [...reals, ...renumbered].sort(comparePulls), added, known, replaced }
}
