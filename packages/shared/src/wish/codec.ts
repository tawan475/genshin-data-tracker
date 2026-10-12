/**
 * Wish history chunks (`wish_chunks.data`): up to WISH_CHUNK_SIZE pulls of
 * one UIGF banner, in pull order. Stored per pull: the item, the time, the
 * id, and for the Character Event whether it was the 400 banner; rank, type,
 * name, item id, UIGF type and pity are derived on read.
 *
 * A chunk starts with a format byte: 1 = the body below, stored; 2 = the
 * body, raw DEFLATE. The body:
 *   uint  count
 *   uint  palette size, then each distinct item, most pulled first:
 *         uint tag = 4 * dictionary id + kind (0 character, 1 weapon), the
 *         id from CHARACTERS / WEAPONS (an item the table knows); or a tag
 *         0-2 (kind unknown, character, weapon) for an item kept as it
 *         arrived, followed by string name, uint rank, uint item id
 *   then each pull:
 *         uint head = palette index * 4 + (gacha_type 400 ? 2 : 0)
 *                     + (synthetic id ? 1 : 0)
 *         uint seconds since the previous pull (the first: absolute)
 *         synthetic: uint n (the id is syntheticWishId(banner, time, n))
 *         real: id = hi * 10^9 + lo. The first: uint hi, uint lo. Later
 *         ones: int (hi - previous hi) - (time - previous real pull's
 *         time), int lo - previous lo. The game's ids lead with the pull's
 *         time in seconds, so the first difference is about 0 and a
 *         ten-pull's ids differ by one.
 * Ints are zigzag varints (bytes.ts). The layout only describes; it holds
 * any id up to 2^63, at worse sizes.
 *
 * A storage format: append new layouts under new format bytes; existing
 * bytes never change meaning.
 */

import { ByteReader, ByteWriter, CorruptDataError } from '../codec/bytes'
import { deflate, inflate } from '../codec/deflate'
import { fromRef } from '../dictionary'
import {
  knownWishItem,
  resolveWishItem,
  wishDictionary,
  wishItemTypeLabel,
  type WishItem,
  type WishItemKind,
} from './items'
import {
  comparePulls,
  isSyntheticWishId,
  syntheticWishId,
  syntheticWishSeq,
  type UigfGachaType,
  type WishPull,
} from './pulls'

/** Pulls per chunk row. Chunks are cut from the banner's first pull: all but the last are full. */
export const WISH_CHUNK_SIZE = 512

const STORED = 1
const DEFLATED = 2
const BILLION = 1_000_000_000n
const RAW_TAGS: readonly (WishItemKind | null)[] = [null, 'character', 'weapon']

/** A palette tag: a dictionary reference, or null to store the item as it is. */
function knownTag(item: WishItem): number | null {
  if (!item.known || !item.key || !item.kind) return null
  const id = wishDictionary(item.kind).ids.get(item.key)
  return id === undefined ? null : id * 4 + (item.kind === 'weapon' ? 1 : 0)
}

function itemIdentity(item: WishItem): string {
  const tag = knownTag(item)
  return tag !== null
    ? `k${tag}`
    : `r${JSON.stringify([item.name, item.kind, item.rank, item.itemId])}`
}

export function encodeWishChunk(banner: UigfGachaType, pulls: readonly WishPull[]): Uint8Array {
  if (pulls.length === 0 || pulls.length > WISH_CHUNK_SIZE) {
    throw new RangeError(`A wish chunk holds 1-${WISH_CHUNK_SIZE} pulls, not ${pulls.length}`)
  }
  // Palette, most pulled first (small indices are one byte).
  const counts = new Map<string, { item: WishItem; count: number; first: number }>()
  pulls.forEach((pull, i) => {
    const key = itemIdentity(pull.item)
    const entry = counts.get(key)
    if (entry) entry.count++
    else counts.set(key, { item: pull.item, count: 1, first: i })
  })
  const palette = [...counts.entries()].sort(
    ([, a], [, b]) => b.count - a.count || a.first - b.first,
  )
  const indexOf = new Map(palette.map(([key], i) => [key, i]))

  const w = new ByteWriter()
  w.uint(pulls.length).uint(palette.length)
  for (const [, { item }] of palette) {
    const tag = knownTag(item)
    if (tag !== null) w.uint(tag)
    else {
      w.uint(RAW_TAGS.indexOf(item.kind)).string(item.name).uint(item.rank).uint(item.itemId)
    }
  }

  let previous: WishPull | null = null
  let previousTime = 0
  let realTime = 0
  let hi = -1
  let lo = 0
  for (const pull of pulls) {
    if (previous && comparePulls(previous, pull) >= 0) {
      throw new RangeError('Wish pulls must be in pull order, without duplicates')
    }
    if (pull.gachaType !== banner && !(banner === 301 && pull.gachaType === 400)) {
      throw new RangeError(`gacha_type ${pull.gachaType} in a ${banner} chunk`)
    }
    const synthetic = isSyntheticWishId(pull.id)
    w.uint(
      indexOf.get(itemIdentity(pull.item))! * 4 +
        (pull.gachaType === 400 ? 2 : 0) +
        (synthetic ? 1 : 0),
    )
    w.uint(previous ? pull.time - previousTime : pull.time)
    if (synthetic) {
      const n = syntheticWishSeq(pull.id)
      if (syntheticWishId(banner, pull.time, n) !== pull.id) {
        throw new RangeError(`Synthetic id ${pull.id} does not fit its banner and time`)
      }
      w.uint(n)
    } else {
      const nextHi = Number(pull.id / BILLION)
      const nextLo = Number(pull.id % BILLION)
      if (hi < 0) w.uint(nextHi).uint(nextLo)
      else w.int(nextHi - hi - (pull.time - realTime)).int(nextLo - lo)
      hi = nextHi
      lo = nextLo
      realTime = pull.time
    }
    previous = pull
    previousTime = pull.time
  }

  const body = w.finish()
  const deflated = deflate(body)
  const out = new Uint8Array(1 + Math.min(body.length, deflated.length))
  if (deflated.length < body.length) {
    out[0] = DEFLATED
    out.set(deflated, 1)
  } else {
    out[0] = STORED
    out.set(body, 1)
  }
  return out
}

export function decodeWishChunk(banner: UigfGachaType, data: Uint8Array): WishPull[] {
  if (data.length === 0) throw new CorruptDataError('Empty wish chunk')
  let body: Uint8Array
  if (data[0] === STORED) body = data.subarray(1)
  else if (data[0] === DEFLATED) body = inflate(data.subarray(1))
  else throw new CorruptDataError(`Unknown wish chunk format ${data[0]}`)
  const r = new ByteReader(body)
  const count = r.uint()
  const paletteSize = r.uint()
  if (count > r.remaining || paletteSize > r.remaining) {
    throw new CorruptDataError('Count past the data')
  }
  const palette: WishItem[] = []
  for (let i = 0; i < paletteSize; i++) {
    const tag = r.uint()
    if (tag >= 4) {
      const kind: WishItemKind = tag % 4 === 1 ? 'weapon' : 'character'
      if (tag % 4 > 1) throw new CorruptDataError(`Unknown item tag ${tag}`)
      palette.push(knownWishItem(kind, fromRef(wishDictionary(kind), Math.floor(tag / 4))))
    } else {
      if (tag > 2) throw new CorruptDataError(`Unknown item tag ${tag}`)
      const kind = RAW_TAGS[tag]!
      const name = r.string()
      const rank = r.uint()
      const itemId = r.uint()
      palette.push(resolveWishItem({ name, itemType: wishItemTypeLabel(kind), rank, itemId }))
    }
  }
  const pulls: WishPull[] = []
  let time = 0
  let realTime = 0
  let hi = -1
  let lo = 0
  for (let i = 0; i < count; i++) {
    const head = r.uint()
    const item = palette[Math.floor(head / 4)]
    if (!item) throw new CorruptDataError(`Palette index ${Math.floor(head / 4)} out of range`)
    const is400 = (head & 2) !== 0
    if (is400 && banner !== 301) throw new CorruptDataError('gacha_type 400 outside 301')
    time = i === 0 ? r.uint() : time + r.uint()
    let id: bigint
    if (head & 1) {
      id = syntheticWishId(banner, time, r.uint())
    } else {
      if (hi < 0) {
        hi = r.uint()
        lo = r.uint()
      } else {
        hi += r.int() + (time - realTime)
        lo += r.int()
      }
      if (hi < 0 || lo < 0 || lo >= 1e9) throw new CorruptDataError('Invalid wish id')
      realTime = time
      id = BigInt(hi) * BILLION + BigInt(lo)
    }
    pulls.push({ id, time, gachaType: is400 ? 400 : banner, item })
  }
  r.end()
  return pulls
}

/** Cuts a banner's pulls (in pull order) into chunk-sized runs. */
export function chunkPulls(pulls: readonly WishPull[]): WishPull[][] {
  const out: WishPull[][] = []
  for (let i = 0; i < pulls.length; i += WISH_CHUNK_SIZE) {
    out.push(pulls.slice(i, i + WISH_CHUNK_SIZE))
  }
  return out
}

/** The highest game id in a run of pulls, or null (only synthetic ones). */
export function newestRealId(pulls: readonly WishPull[]): bigint | null {
  let newest: bigint | null = null
  for (const pull of pulls) {
    if (!isSyntheticWishId(pull.id) && (newest === null || pull.id > newest)) newest = pull.id
  }
  return newest
}

/** Ids as `wish_chunks.newest_id` holds them: 20 digits, so text order is number order. */
export function paddedWishId(id: bigint): string {
  return id.toString().padStart(20, '0')
}
