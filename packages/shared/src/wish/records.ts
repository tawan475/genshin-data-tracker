/**
 * Wish records as they travel: the game's history API (irminsul forwards its
 * `data.list` items), UIGF and paimon.moe files, all reduced to this one
 * shape, then to pulls.
 */

import { resolveWishItem } from './items'
import {
  isGachaType,
  isSyntheticWishId,
  parseWishId,
  parseWishTime,
  syntheticWishId,
  uigfGachaType,
  type UigfGachaType,
  type WishPull,
} from './pulls'

/** One record, as the API answers it (strings throughout; most fields optional here). */
export interface WishRecord {
  /** Empty or missing: a source without ids (a synthetic id is made). */
  id?: string
  uid?: string
  gacha_type: string
  time: string
  name: string
  item_type?: string
  rank_type?: string
  item_id?: string
}

export class WishRecordError extends Error {
  constructor(
    message: string,
    readonly issues: { index: number; message: string }[],
  ) {
    super(message)
    this.name = 'WishRecordError'
  }
}

export interface NormalizedRecords {
  /** Pulls per UIGF banner, in pull order; synthetic ids are tentative (mergePulls renumbers). */
  banners: Map<UigfGachaType, WishPull[]>
  /** Records left out: another UID's, or a banner type this build does not know. */
  skipped: number
}

/**
 * Records to pulls. `timezone` is the records' clock (hours from UTC),
 * `target` the account's; times move from one to the other. A record whose
 * time or id is malformed fails the whole batch (WishRecordError); one of
 * another UID or an unknown banner type is skipped.
 *
 * A record without a game id gets a tentative synthetic one from its place
 * among its second's records. Sources list either newest first (the API,
 * paimon.moe) or oldest first; per banner, the order is read off the
 * records' times.
 */
export function normalizeWishRecords(
  records: readonly WishRecord[],
  options: { uid?: string; timezone: number; target: number },
): NormalizedRecords {
  const shift = (options.timezone - options.target) * 3600
  const issues: { index: number; message: string }[] = []
  let skipped = 0
  type Entry = { index: number; time: number; id: bigint | null; pull: Omit<WishPull, 'id'> }
  const perBanner = new Map<UigfGachaType, Entry[]>()

  records.forEach((record, index) => {
    if (options.uid && record.uid && record.uid !== options.uid) {
      skipped++
      return
    }
    const type = Number(record.gacha_type)
    if (!isGachaType(type)) {
      skipped++
      return
    }
    const local = parseWishTime(record.time)
    if (local === null) {
      issues.push({ index, message: `time "${record.time}" is not YYYY-MM-DD HH:mm:ss` })
      return
    }
    let id: bigint | null = null
    // StarDB numbers the pulls it has no game id for from "0", per banner.
    if (record.id && !/^0+$/.test(record.id)) {
      id = parseWishId(record.id)
      if (id === null) {
        issues.push({ index, message: `id "${record.id}" is not a wish id` })
        return
      }
      if (isSyntheticWishId(id)) id = null
    }
    const name = record.name.trim()
    const rank = Number(record.rank_type)
    const itemId = Number(record.item_id)
    const item = resolveWishItem({
      name,
      itemType: record.item_type ?? '',
      rank: Number.isInteger(rank) && rank >= 1 && rank <= 5 ? rank : 0,
      itemId: Number.isSafeInteger(itemId) && itemId > 0 ? itemId : 0,
    })
    if (!name && !item.known) {
      issues.push({ index, message: 'no name and no known item_id' })
      return
    }
    const time = local - shift
    const banner = uigfGachaType(type)
    const list = perBanner.get(banner) ?? []
    list.push({ index, time, id, pull: { time, gachaType: type, item } })
    perBanner.set(banner, list)
  })
  if (issues.length > 0) {
    throw new WishRecordError(
      `${issues.length} record${issues.length === 1 ? '' : 's'} could not be read`,
      issues.slice(0, 5),
    )
  }

  const banners = new Map<UigfGachaType, WishPull[]>()
  for (const [banner, entries] of perBanner) {
    // Without ids, the list's own order says which pull of a second came first.
    const newestFirst = entries.length > 1 && entries[0]!.time > entries.at(-1)!.time
    const ordered = newestFirst ? [...entries].reverse() : entries
    const perSecond = new Map<number, number>()
    banners.set(
      banner,
      ordered.map(({ id, time, pull }) => {
        if (id !== null) return { ...pull, id }
        const n = perSecond.get(time) ?? 0
        perSecond.set(time, n + 1)
        return { ...pull, id: syntheticWishId(banner, time, n) }
      }),
    )
  }
  return { banners, skipped }
}
