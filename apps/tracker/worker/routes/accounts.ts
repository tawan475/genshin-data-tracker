import {
  ACCOUNT_SETTINGS_DEFAULTS,
  accountInput,
  accountSettingsPatch,
  deepMerge,
  snapshotIdsRequest,
  type AccountCreatedResponse,
  type AccountSettingsResponse,
  type SnapshotResponse,
} from '@gdt/shared'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import { genshinAccounts } from '../db/schema'
import type { AppEnv } from '../env'
import { accountEtag, bodyEtag, checkEtag } from '../lib/etag'
import { ApiError, idParam, isUniqueViolation, notFound, parseJson, rateLimit } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { requireActiveSession, requireUser } from '../lib/session'
import { readUpload } from '../lib/upload'
import {
  dataVersionOf,
  listAccounts,
  loadOwnedAccount,
  newImportKey,
  recomputeAccount,
  uidTaken,
} from '../services/accounts'
import {
  MAX_BUNDLE_SNAPSHOTS,
  SECTION_NAMES,
  buildBundle,
  buildGood,
  catalogJson,
  goodFileName,
  type SectionName,
} from '../services/export'
import { importSnapshot } from '../services/import'
import { metaOf, withLegacySchema } from '../services/storage'
import { listenerOf, listenerStatement, notifyUser, senderTab } from '../services/live'

/**
 * Part of the snapshot list's ETag. Bump it whenever the list's JSON changes
 * shape without the data changing, so a browser revalidating a body cached in
 * the old shape gets the new one instead of a 304. 2: the summary's
 * unlocked, unequipped artifact counts are artifact3 / artifact4 (migration 0008).
 */
const SNAPSHOT_LIST_FORMAT = 2

/**
 * Part of a bundle's ETag, per layout: a GDT1 body cached by an older app is
 * never revalidated into a GDT2 one, and the other way round. v2 storage
 * changed how GDT1 names v2 sections (`#<id>` keys), hence "1b".
 */
const BUNDLE_FORMAT_ETAG = { 1: 'g1b', 2: 'g2' } as const

export const accounts = new Hono<AppEnv>()
  .use(requireUser)

  /**
   * The user's accounts. Tabs re-read it to catch up after a gap in live
   * events, so it carries an ETag over its body: unchanged, it is a 304 for
   * the one indexed read that tells.
   */
  .get('/', async (c) => {
    const meter = new D1Meter()
    const body = JSON.stringify(await listAccounts(c.env.DB, c.get('userId'), undefined, meter))
    meter.report(c)
    const cached = checkEtag(c, await bodyEtag('l', body))
    if (cached) return cached
    c.header('Content-Type', 'application/json; charset=utf-8')
    return c.body(body)
  })

  .post('/', async (c) => {
    const body = await parseJson(c, accountInput)
    const { key, hash } = await newImportKey()
    const db = getDb(c.env.DB)
    const [row] = await db
      .insert(genshinAccounts)
      .values({
        userId: c.get('userId'),
        name: body.name ?? null,
        uid: body.uid ?? null,
        server: body.server ?? null,
        importKeyHash: hash,
      })
      .returning({ id: genshinAccounts.id })
      .catch(rethrowUidTaken)
    const [account] = await listAccounts(c.env.DB, c.get('userId'), row!.id)
    notifyUser(c, c.get('userId'), { type: 'accounts' })
    return c.json<AccountCreatedResponse>({ account: account!, importKey: key }, 201)
  })

  .get('/:id', async (c) => {
    const [account] = await listAccounts(c.env.DB, c.get('userId'), idParam(c, 'id'))
    if (!account) throw notFound('Account')
    return c.json(account)
  })

  .patch('/:id', async (c) => {
    const id = idParam(c, 'id')
    const body = await parseJson(c, accountInput)
    const db = getDb(c.env.DB)
    await loadOwnedAccount(db, c.get('userId'), id)
    await db
      .update(genshinAccounts)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.uid !== undefined ? { uid: body.uid } : {}),
        ...(body.server !== undefined ? { server: body.server } : {}),
      })
      .where(eq(genshinAccounts.id, id))
      .catch(rethrowUidTaken)
    const [account] = await listAccounts(c.env.DB, c.get('userId'), id)
    notifyUser(c, c.get('userId'), { type: 'accounts' })
    return c.json(account!)
  })

  .delete('/:id', async (c) => {
    const id = idParam(c, 'id')
    const result = await getDb(c.env.DB)
      .delete(genshinAccounts)
      .where(and(eq(genshinAccounts.id, id), eq(genshinAccounts.userId, c.get('userId'))))
      .returning({ id: genshinAccounts.id })
    if (result.length === 0) throw notFound('Account')
    notifyUser(c, c.get('userId'), { type: 'accounts' })
    return c.body(null, 204)
  })

  /** Replaces the import key; the old one stops working immediately. */
  .post('/:id/import-key', requireActiveSession, async (c) => {
    const id = idParam(c, 'id')
    const db = getDb(c.env.DB)
    await loadOwnedAccount(db, c.get('userId'), id)
    const { key, hash } = await newImportKey()
    await db.update(genshinAccounts).set({ importKeyHash: hash }).where(eq(genshinAccounts.id, id))
    return c.json({ importKey: key })
  })

  .get('/:id/settings', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    return c.json<AccountSettingsResponse>({
      settings: deepMerge(ACCOUNT_SETTINGS_DEFAULTS, account.settings),
    })
  })

  .patch('/:id/settings', async (c) => {
    const id = idParam(c, 'id')
    const patch = await parseJson(c, accountSettingsPatch)
    const db = getDb(c.env.DB)
    const account = await loadOwnedAccount(db, c.get('userId'), id)
    const stored = deepMerge(account.settings, patch)
    const [, listener] = await c.env.DB.batch([
      c.env.DB.prepare('UPDATE genshin_accounts SET settings = ?1 WHERE id = ?2').bind(
        JSON.stringify(stored),
        id,
      ),
      listenerStatement(c.env.DB, id),
    ])
    // The planner reads AR/WL, its options and the resin set by hand, the Characters
    // page the favourites: open ones follow.
    notifyUser(
      c,
      c.get('userId'),
      { type: 'planner', accountId: id, ...senderTab(c) },
      listenerOf(listener),
    )
    return c.json<AccountSettingsResponse>({
      settings: deepMerge(ACCOUNT_SETTINGS_DEFAULTS, stored),
    })
  })

  /**
   * Dashboard upload: one GOOD file per request (the browser orchestrates bulk
   * imports). A run of many sends `x-gdt-live: quiet` and tells the live
   * pages once at its end (`announce`), instead of after every file.
   */
  .post('/:id/import', async (c) => {
    const id = idParam(c, 'id')
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    await rateLimit(c.env.IMPORT_LIMITER, `import:account:${id}`)
    const meter = new D1Meter()
    const { response, dataVersion, listener } = await importSnapshot(
      c.env.DB,
      account,
      await readUpload(c),
      meter,
    )
    meter.report(c)
    if (dataVersion !== null && c.req.header('x-gdt-live') !== 'quiet') {
      notifyUser(
        c,
        c.get('userId'),
        { type: 'data', accountId: id, dataVersion, takenAt: response.takenAt },
        listener,
      )
    }
    return c.json(response, response.status === 'created' ? 201 : 200)
  })

  /** The account, after a quiet import run: also tells the live pages it moved. */
  .post('/:id/announce', async (c) => {
    const id = idParam(c, 'id')
    const [account] = await listAccounts(c.env.DB, c.get('userId'), id)
    if (!account) throw notFound('Account')
    notifyUser(c, c.get('userId'), {
      type: 'data',
      accountId: id,
      dataVersion: account.dataVersion,
    })
    return c.json(account)
  })

  .get('/:id/snapshots', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    const cached = checkEtag(c, accountEtag(account, `snapshots.${SNAPSHOT_LIST_FORMAT}`))
    if (cached) return cached
    const { results } = await withLegacySchema((legacy) =>
      c.env.DB.prepare(
        `SELECT id, taken_at, last_seen_at, created_at, raw_size, stored_size,
           ${legacy ? 'format, version, source, summary, ' : ''}meta
         FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL ORDER BY taken_at DESC, id DESC`,
      )
        .bind(account.id)
        .all<Record<string, unknown>>(),
    )
    return c.json<SnapshotResponse[]>(
      results.map((r) => {
        const meta = metaOf(r)
        return {
          id: r.id as number,
          takenAt: r.taken_at as number,
          lastSeenAt: r.last_seen_at as number,
          createdAt: r.created_at as number,
          source: meta.source,
          rawSize: r.raw_size as number,
          storedSize: r.stored_size as number,
          summary: meta.summary,
        }
      }),
    )
  })

  .post('/:id/snapshots/delete', async (c) => {
    const id = idParam(c, 'id')
    const { ids } = await parseJson(c, snapshotIdsRequest)
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const [deleted, recomputed, listening] = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE snapshots SET deleted_at = ?3 WHERE account_id = ?1 AND deleted_at IS NULL
         AND id IN (SELECT value FROM json_each(?2)) RETURNING id`,
      ).bind(id, JSON.stringify(ids), Date.now()),
      recomputeAccount(c.env.DB, id),
      listenerStatement(c.env.DB, id),
    ])
    notifyData(c, id, recomputed, listening)
    // meta.changes would also count the counter trigger's updates.
    return c.json({ deleted: deleted!.results.length })
  })

  .delete('/:id/snapshots/:snapshotId', async (c) => {
    const id = idParam(c, 'id')
    const snapshotId = idParam(c, 'snapshotId')
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const [deleted, recomputed, listening] = await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE snapshots SET deleted_at = ?3 WHERE account_id = ?1 AND id = ?2 AND deleted_at IS NULL',
      ).bind(id, snapshotId, Date.now()),
      recomputeAccount(c.env.DB, id),
      listenerStatement(c.env.DB, id),
    ])
    notifyData(c, id, recomputed, listening)
    if (deleted!.meta.changes === 0) throw notFound('Snapshot')
    return c.body(null, 204)
  })

  /** Every artifact the account has ever held, as CatalogRow arrays. */
  .get('/:id/catalog', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    const cached = checkEtag(c, accountEtag(account, 'catalog'))
    if (cached) return cached
    c.header('Content-Type', 'application/json; charset=utf-8')
    return c.body(await catalogJson(c.env.DB, account.id))
  })

  /**
   * Stored sections for many snapshots in one binary bundle:
   * `?ids=1,2,3` (default: all live snapshots),
   * `?sections=materials,artifacts` (default: all sections) and
   * `?format=2` for GDT2 (stored v2 sections as they are; the app asks for
   * it). Without it the answer is GDT1, which apps from before v2 storage
   * read (v2 sections decoded into the v1 form for them).
   */
  .get('/:id/bundle', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    const ids = parseIds(c.req.query('ids'))
    const sections = parseSections(c.req.query('sections'))
    const format = c.req.query('format') === '2' ? 2 : 1
    const variant = `bundle.${[...sections].sort().join('+')}.${ids ? ids.join('-') : 'all'}`
    const cached = checkEtag(
      c,
      accountEtag(account, `${await shortHash(variant)}.${BUNDLE_FORMAT_ETAG[format]}`),
    )
    if (cached) return cached
    c.header('Content-Type', 'application/octet-stream')
    return c.body(await buildBundle(c.env.DB, account.id, ids, sections, format))
  })

  .get('/:id/snapshots/:snapshotId/good', async (c) => {
    const id = idParam(c, 'id')
    const snapshotId = idParam(c, 'snapshotId')
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const { good, takenAt } = await buildGood(c.env.DB, id, snapshotId)
    // A stored snapshot never changes.
    c.header('Cache-Control', 'private, max-age=31536000, immutable')
    c.header('Content-Disposition', `attachment; filename="${goodFileName(takenAt)}"`)
    return c.json(good)
  })

  .get('/:id/latest/good', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    const cached = checkEtag(c, accountEtag(account, 'latest-good'))
    if (cached) return cached
    const { good, takenAt } = await buildGood(c.env.DB, account.id, 'latest')
    c.header('Content-Disposition', `attachment; filename="${goodFileName(takenAt)}"`)
    return c.json(good)
  })

/** A delete moved the account's data version (even when it matched nothing). */
function notifyData(
  c: Context<AppEnv>,
  accountId: number,
  recomputed: D1Result | undefined,
  listening: D1Result | undefined,
) {
  notifyUser(
    c,
    c.get('userId'),
    { type: 'data', accountId, dataVersion: dataVersionOf(recomputed) ?? null },
    listenerOf(listening),
  )
}

/** The (user_id, uid) unique index: one account per UID per user (see migration 0007). */
function rethrowUidTaken(error: unknown): never {
  if (isUniqueViolation(error, 'genshin_accounts.user_id')) throw uidTaken()
  throw error
}

function parseIds(raw: string | undefined): number[] | null {
  if (!raw) return null
  const ids = raw.split(',').map(Number)
  if (ids.length > MAX_BUNDLE_SNAPSHOTS || ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
    throw new ApiError(
      400,
      'invalid_request',
      '`ids` must be a comma-separated list of snapshot ids',
    )
  }
  return [...new Set(ids)].sort((a, b) => a - b)
}

function parseSections(raw: string | undefined): Set<SectionName> {
  if (!raw) return new Set(SECTION_NAMES)
  const names = raw.split(',')
  const invalid = names.filter((name) => !(SECTION_NAMES as readonly string[]).includes(name))
  if (invalid.length > 0) {
    throw new ApiError(400, 'invalid_request', `Unknown sections: ${invalid.join(', ')}`)
  }
  return new Set(names as SectionName[])
}

async function shortHash(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  )
  return [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
