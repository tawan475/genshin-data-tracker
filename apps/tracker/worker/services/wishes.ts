/**
 * Wish history storage: per account its clock and version (wish_histories)
 * and its pulls in chunks per UIGF banner type (wish_chunks; the bytes are
 * @gdt/shared's encodeWishChunk). Wish history is a log beside the
 * snapshots: it never touches `data_version` or bundles.
 *
 * An import, D1 round trips:
 *   1. one batch: the history row, each banner's last chunk, the owner's
 *      upload usage and limits, the newest ids (the answer when nothing is new)
 *   2. only when some record is older than a banner's last chunk: that
 *      banner's other chunks (a first import, or a file of old history)
 *   3. only when something is new: one batch that writes the changed chunks
 *      (from the first that changed), bumps the version, counts the bytes in
 *      the user's day and reads who listens and the newest ids again
 * irminsul's usual sync (a few new pulls after the newest) is 1 + 3. Every
 * write in 3 is guarded by the version read in 1, so of two imports at once
 * one writes and the other starts over.
 */

import {
  WishRecordError,
  chunkPulls,
  decodeWishChunk,
  encodeWishChunk,
  formatWishTime,
  mergePulls,
  newestRealId,
  normalizeWishRecords,
  paddedWishId,
  serverFromUid,
  serverTimezone,
  toBase64,
  UIGF_GACHA_TYPES,
  type GenshinServer,
  type UigfGachaType,
  type WishHistoryResponse,
  type WishImportResponse,
  type WishNewest,
  type WishPull,
  type WishRecord,
} from '@gdt/shared'
import { ApiError } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { listenerOf, listenerStatement, type Listener } from './live'
import { toBytes } from './storage'
import {
  assertCanStore,
  countWishBytesStatement,
  readUsage,
  usageStatement,
  utcDay,
} from './upload-limits'

export interface WishTarget {
  id: number
  uid: string | null
  server: GenshinServer | null
}

export interface WishImportInput {
  /** The records' UID: a record naming another is skipped. */
  uid?: string
  /** Hours from UTC of the records' times; the account's clock when left out. */
  timezone?: number
  records: readonly WishRecord[]
}

export interface WishImportResult {
  response: Omit<WishImportResponse, 'accountId'>
  /** Pulls were added or replaced. */
  changed: boolean
  listener?: Listener
}

const NEWEST_SQL =
  'SELECT banner, max(newest_id) AS newest FROM wish_chunks WHERE account_id = ?1 GROUP BY banner'

const LAST_CHUNKS_SQL = `SELECT c.banner, c.seq, c.data FROM wish_chunks AS c
  WHERE c.account_id = ?1
    AND c.seq = (SELECT max(m.seq) FROM wish_chunks AS m WHERE m.account_id = ?1 AND m.banner = c.banner)`

const VERSION_GUARD = '(SELECT version FROM wish_histories WHERE account_id = ?1)'

export function newestOf(rows: readonly Record<string, unknown>[]): WishNewest {
  const newest: WishNewest = { '100': null, '200': null, '301': null, '302': null, '500': null }
  for (const row of rows) {
    const banner = String(row.banner) as keyof WishNewest
    if (banner in newest && typeof row.newest === 'string') {
      newest[banner] = BigInt(row.newest).toString()
    }
  }
  return newest
}

/**
 * The cursor's read: per banner the highest game id, the newest pull's time
 * (synthetic ids included) and the history's clock, in one statement.
 */
const CURSOR_SQL = `SELECT banner, max(newest_id) AS newest, max(newest_time) AS newest_time,
    (SELECT timezone FROM wish_histories WHERE account_id = ?1) AS timezone
  FROM wish_chunks WHERE account_id = ?1 GROUP BY banner`

/** A banner's last chunk, for chunks stored before `newest_time` existed. */
const LEGACY_LAST_SQL = `SELECT c.banner, c.data FROM wish_chunks AS c
  WHERE c.account_id = ?1 AND c.banner IN (SELECT value FROM json_each(?2))
    AND c.seq = (SELECT max(m.seq) FROM wish_chunks AS m WHERE m.account_id = ?1 AND m.banner = c.banner)`

const emptyNewest = (): WishNewest => ({
  '100': null,
  '200': null,
  '301': null,
  '302': null,
  '500': null,
})

export interface WishCursor {
  newest: WishNewest
  /** "YYYY-MM-DD HH:MM:SS" on the account's server clock, null when none. */
  newestTime: WishNewest
}

/**
 * The sync cursor: per banner the highest game id held, and the newest
 * pull's time (synthetic ids from a paimon.moe / UIGF backup included) on
 * the account's server clock (the clock of the game's records), so irminsul
 * can stop paging at what a backup brought too. One indexed read of the
 * account's chunk rows; a banner whose chunks predate `newest_time` costs
 * one more read of its last chunk, until an import rewrites it.
 */
export async function wishCursor(
  d1: D1Database,
  meter: D1Meter,
  account: { id: number; uid: string | null; server: GenshinServer | null },
): Promise<WishCursor> {
  const [rows] = await meter.batch(d1, 'cursor', [d1.prepare(CURSOR_SQL).bind(account.id)])
  const results = rows!.results
  const newest = newestOf(results)
  const newestTime = emptyNewest()
  if (results.length === 0) return { newest, newestTime }
  const clock = Number(results[0]!.timezone ?? 8)
  const server = serverTimezone(account.server ?? serverFromUid(account.uid ?? ''))
  const times = new Map<UigfGachaType, number>()
  const legacy: UigfGachaType[] = []
  for (const row of results) {
    const banner = Number(row.banner)
    if (!isBanner(banner)) continue
    if (typeof row.newest_time === 'number') times.set(banner, row.newest_time)
    else legacy.push(banner)
  }
  if (legacy.length > 0) {
    const [last] = await meter.batch(d1, 'cursor-legacy', [
      d1.prepare(LEGACY_LAST_SQL).bind(account.id, JSON.stringify(legacy)),
    ])
    for (const row of last!.results) {
      const banner = Number(row.banner)
      if (!isBanner(banner)) continue
      const pulls = decodeWishChunk(banner, toBytes(row.data))
      if (pulls.length > 0) times.set(banner, newestTimeOf(pulls))
    }
  }
  for (const [banner, time] of times) {
    newestTime[String(banner) as keyof WishNewest] = formatWishTime(time + (server - clock) * 3600)
  }
  return { newest, newestTime }
}

/** The newest time among pulls (they are in pull order; max for safety). */
function newestTimeOf(pulls: readonly WishPull[]): number {
  let time = pulls[0]!.time
  for (const p of pulls) if (p.time > time) time = p.time
  return time
}

interface StoredChunk {
  seq: number
  data: Uint8Array
}

function isBanner(value: number): value is UigfGachaType {
  return (UIGF_GACHA_TYPES as readonly number[]).includes(value)
}

/** A concurrent import wrote first: start over. */
class Retry extends Error {}

export async function importWishes(
  d1: D1Database,
  account: WishTarget,
  input: WishImportInput,
  meter = new D1Meter(),
): Promise<WishImportResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await importOnce(d1, account, input, meter)
    } catch (error) {
      if (error instanceof Retry && attempt < 4) continue
      if (error instanceof Retry) {
        throw new ApiError(409, 'wish_conflict', 'Another wish import is running; try again')
      }
      throw error
    }
  }
}

async function importOnce(
  d1: D1Database,
  account: WishTarget,
  input: WishImportInput,
  meter: D1Meter,
): Promise<WishImportResult> {
  const accountId = account.id
  const now = Date.now()
  const day = utcDay(now)

  // 1.
  const [historyResult, lastResult, usageResult, newestResult] = await meter.batch(d1, 'lookup', [
    d1
      .prepare('SELECT timezone, version, updated_at FROM wish_histories WHERE account_id = ?1')
      .bind(accountId),
    d1.prepare(LAST_CHUNKS_SQL).bind(accountId),
    usageStatement(d1, accountId, day),
    d1.prepare(NEWEST_SQL).bind(accountId),
  ])
  const history = historyResult!.results[0] as { timezone: number; version: number } | undefined
  const version = history?.version ?? 0
  const uid = input.uid ?? account.uid ?? ''
  const timezone =
    history?.timezone ?? input.timezone ?? serverTimezone(account.server ?? serverFromUid(uid))

  let normalized
  try {
    normalized = normalizeWishRecords(input.records, {
      uid: input.uid,
      timezone: input.timezone ?? timezone,
      target: timezone,
    })
  } catch (error) {
    if (error instanceof WishRecordError) {
      throw new ApiError(
        400,
        'invalid_records',
        error.message,
        error.issues.map((i) => ({ path: `records.${i.index}`, message: i.message })),
      )
    }
    throw error
  }

  const last = new Map<UigfGachaType, StoredChunk & { pulls: WishPull[] }>()
  for (const row of lastResult!.results) {
    const banner = Number(row.banner)
    if (!isBanner(banner)) continue
    const data = toBytes(row.data)
    last.set(banner, { seq: row.seq as number, data, pulls: decodeWishChunk(banner, data) })
  }

  // Which banners need their older chunks too: a record not after the last chunk's first pull.
  const full: UigfGachaType[] = []
  for (const [banner, pulls] of normalized.banners) {
    const tail = last.get(banner)
    if (tail && tail.seq > 0 && pulls.some((p) => p.time <= tail.pulls[0]!.time)) full.push(banner)
  }

  // 2.
  const older = new Map<UigfGachaType, StoredChunk[]>()
  if (full.length > 0) {
    const [rows] = await meter.batch(d1, 'chunks', [
      d1
        .prepare(
          `SELECT banner, seq, data FROM wish_chunks WHERE account_id = ?1
           AND banner IN (SELECT value FROM json_each(?2)) ORDER BY banner, seq`,
        )
        .bind(accountId, JSON.stringify(full)),
    ])
    for (const row of rows!.results) {
      const banner = Number(row.banner) as UigfGachaType
      const list = older.get(banner) ?? []
      list.push({ seq: row.seq as number, data: toBytes(row.data) })
      older.set(banner, list)
    }
  }

  let added = 0
  let known = 0
  let replaced = 0
  type Write = {
    banner: UigfGachaType
    from: number
    chunks: { seq: number; pulls: WishPull[]; data: Uint8Array }[]
  }
  const writes: Write[] = []
  let freed = 0
  let written = 0
  for (const [banner, incoming] of normalized.banners) {
    const tail = last.get(banner)
    // The chunks this merge works on, from `start` on (all, or only the last).
    const held: StoredChunk[] = full.includes(banner)
      ? (older.get(banner) ?? [])
      : tail
        ? [{ seq: tail.seq, data: tail.data }]
        : []
    const start = held[0]?.seq ?? 0
    const heldPulls = full.includes(banner)
      ? held.flatMap((c) => decodeWishChunk(banner, c.data))
      : (tail?.pulls ?? [])
    const merged = mergePulls(banner, heldPulls, incoming)
    added += merged.added
    known += merged.known
    replaced += merged.replaced
    if (merged.added === 0 && merged.replaced === 0) continue

    const chunks = chunkPulls(merged.pulls).map((pulls, i) => ({
      seq: start + i,
      pulls,
      data: encodeWishChunk(banner, pulls),
    }))
    const bySeq = new Map(held.map((c) => [c.seq, c.data]))
    const first = chunks.findIndex((c) => {
      const before = bySeq.get(c.seq)
      return !before || before.length !== c.data.length || before.some((b, i) => b !== c.data[i])
    })
    if (first < 0 && chunks.length === held.length) continue
    const from = first < 0 ? start + chunks.length : chunks[first]!.seq
    const rewritten = first < 0 ? [] : chunks.slice(first)
    for (const c of held) if (c.seq >= from) freed += c.data.length
    for (const c of rewritten) written += c.data.length
    writes.push({ banner, from, chunks: rewritten })
  }

  const respond = (newest: WishNewest, listener?: Listener): WishImportResult => ({
    response: {
      added,
      known,
      ...(normalized.skipped > 0 ? { skipped: normalized.skipped } : {}),
      ...(replaced > 0 ? { replaced } : {}),
      newest,
    },
    changed: writes.length > 0,
    ...(listener ? { listener } : {}),
  })
  if (writes.length === 0) return respond(newestOf(newestResult!.results))

  assertCanStore(readUsage(usageResult!.results[0]), now)

  // 3.
  const statements: D1PreparedStatement[] = [
    d1
      .prepare(
        `INSERT INTO wish_histories (account_id, timezone, version, updated_at)
         VALUES (?1, ?2, 0, ?3) ON CONFLICT DO NOTHING`,
      )
      .bind(accountId, timezone, now),
  ]
  for (const write of writes) {
    statements.push(
      d1
        .prepare(
          `DELETE FROM wish_chunks WHERE account_id = ?1 AND banner = ?2 AND seq >= ?3
           AND ${VERSION_GUARD} = ?4`,
        )
        .bind(accountId, write.banner, write.from, version),
    )
    for (const chunk of write.chunks) {
      const newest = newestRealId(chunk.pulls)
      statements.push(
        d1
          .prepare(
            `INSERT INTO wish_chunks (account_id, banner, seq, count, newest_id, newest_time, data)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${VERSION_GUARD} = ?8`,
          )
          .bind(
            accountId,
            write.banner,
            chunk.seq,
            chunk.pulls.length,
            newest === null ? null : paddedWishId(newest),
            newestTimeOf(chunk.pulls),
            chunk.data,
            version,
          ),
      )
    }
  }
  const bumpIndex = statements.length
  statements.push(
    d1
      .prepare(
        `UPDATE wish_histories SET version = version + 1, updated_at = ?3
         WHERE account_id = ?1 AND version = ?2 RETURNING version`,
      )
      .bind(accountId, version, now),
    countWishBytesStatement(d1, accountId, day, Math.max(0, written - freed), version + 1),
    listenerStatement(d1, accountId),
    d1.prepare(NEWEST_SQL).bind(accountId),
  )
  const results = await meter.batch(d1, 'store', statements)
  if (results[bumpIndex]!.results.length === 0) throw new Retry()
  return respond(newestOf(results.at(-1)!.results), listenerOf(results.at(-2)))
}

/** Every chunk of the account, for the page (decoded in the browser). */
export async function readWishHistory(
  d1: D1Database,
  accountId: number,
): Promise<WishHistoryResponse> {
  const [history, chunks] = await d1.batch<Record<string, unknown>>([
    d1
      .prepare('SELECT timezone, version, updated_at FROM wish_histories WHERE account_id = ?1')
      .bind(accountId),
    d1
      .prepare(
        'SELECT banner, seq, data FROM wish_chunks WHERE account_id = ?1 ORDER BY banner, seq',
      )
      .bind(accountId),
  ])
  const row = history!.results[0] as
    | { timezone: number; version: number; updated_at: number }
    | undefined
  let bytes = 0
  const list = chunks!.results.map((c) => {
    const data = toBytes(c.data)
    bytes += data.length
    return { banner: Number(c.banner) as UigfGachaType, data: toBase64(data) }
  })
  return {
    timezone: row?.timezone ?? null,
    version: row?.version ?? 0,
    chunks: list,
    bytes,
    updatedAt: row?.updated_at ?? null,
  }
}
