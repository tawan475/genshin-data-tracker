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
import { Hono } from 'hono'
import { getDb } from '../db/client'
import { genshinAccounts } from '../db/schema'
import type { AppEnv } from '../env'
import { accountEtag, checkEtag } from '../lib/etag'
import { ApiError, idParam, notFound, parseJson, rateLimit } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { requireUser } from '../lib/session'
import { readUpload } from '../lib/upload'
import {
  listAccounts,
  loadOwnedAccount,
  newImportKey,
  recomputeAccount,
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

export const accounts = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => c.json(await listAccounts(getDb(c.env.DB), c.get('userId'))))

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
    const [account] = await listAccounts(db, c.get('userId'), row!.id)
    return c.json<AccountCreatedResponse>({ account: account!, importKey: key }, 201)
  })

  .get('/:id', async (c) => {
    const [account] = await listAccounts(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
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
    const [account] = await listAccounts(db, c.get('userId'), id)
    return c.json(account!)
  })

  .delete('/:id', async (c) => {
    const id = idParam(c, 'id')
    const result = await getDb(c.env.DB)
      .delete(genshinAccounts)
      .where(and(eq(genshinAccounts.id, id), eq(genshinAccounts.userId, c.get('userId'))))
      .returning({ id: genshinAccounts.id })
    if (result.length === 0) throw notFound('Account')
    return c.body(null, 204)
  })

  /** Replaces the import key; the old one stops working immediately. */
  .post('/:id/import-key', async (c) => {
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
    await db.update(genshinAccounts).set({ settings: stored }).where(eq(genshinAccounts.id, id))
    return c.json<AccountSettingsResponse>({
      settings: deepMerge(ACCOUNT_SETTINGS_DEFAULTS, stored),
    })
  })

  /** Dashboard upload: one GOOD file per request (the browser orchestrates bulk imports). */
  .post('/:id/import', async (c) => {
    const id = idParam(c, 'id')
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    await rateLimit(c.env.IMPORT_LIMITER, `import:account:${id}`)
    const meter = new D1Meter()
    const result = await importSnapshot(c.env.DB, id, await readUpload(c), meter)
    meter.report(c)
    return c.json(result, result.status === 'created' ? 201 : 200)
  })

  .get('/:id/snapshots', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    const cached = checkEtag(c, accountEtag(account, 'snapshots'))
    if (cached) return cached
    const { results } = await c.env.DB.prepare(
      `SELECT id, taken_at, last_seen_at, created_at, source, raw_size, stored_size, summary
       FROM snapshots WHERE account_id = ?1 AND deleted_at IS NULL ORDER BY taken_at DESC, id DESC`,
    )
      .bind(account.id)
      .all<Record<string, unknown>>()
    return c.json<SnapshotResponse[]>(
      results.map((r) => ({
        id: r.id as number,
        takenAt: r.taken_at as number,
        lastSeenAt: r.last_seen_at as number,
        createdAt: r.created_at as number,
        source: r.source as string,
        rawSize: r.raw_size as number,
        storedSize: r.stored_size as number,
        summary: JSON.parse(r.summary as string),
      })),
    )
  })

  .post('/:id/snapshots/delete', async (c) => {
    const id = idParam(c, 'id')
    const { ids } = await parseJson(c, snapshotIdsRequest)
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const [deleted] = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE snapshots SET deleted_at = ?3 WHERE account_id = ?1 AND deleted_at IS NULL
         AND id IN (SELECT value FROM json_each(?2))`,
      ).bind(id, JSON.stringify(ids), Date.now()),
      recomputeAccount(c.env.DB, id),
    ])
    return c.json({ deleted: deleted!.meta.changes })
  })

  .delete('/:id/snapshots/:snapshotId', async (c) => {
    const id = idParam(c, 'id')
    const snapshotId = idParam(c, 'snapshotId')
    await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), id)
    const [deleted] = await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE snapshots SET deleted_at = ?3 WHERE account_id = ?1 AND id = ?2 AND deleted_at IS NULL',
      ).bind(id, snapshotId, Date.now()),
      recomputeAccount(c.env.DB, id),
    ])
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
   * Stored sections for many snapshots in one binary GDT1 bundle:
   * `?ids=1,2,3` (default: all live snapshots) and
   * `?sections=materials,artifacts` (default: all sections).
   */
  .get('/:id/bundle', async (c) => {
    const account = await loadOwnedAccount(getDb(c.env.DB), c.get('userId'), idParam(c, 'id'))
    const ids = parseIds(c.req.query('ids'))
    const sections = parseSections(c.req.query('sections'))
    const variant = `bundle.${[...sections].sort().join('+')}.${ids ? ids.join('-') : 'all'}`
    const cached = checkEtag(c, accountEtag(account, await shortHash(variant)))
    if (cached) return cached
    c.header('Content-Type', 'application/octet-stream')
    return c.body(await buildBundle(c.env.DB, account.id, ids, sections))
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
