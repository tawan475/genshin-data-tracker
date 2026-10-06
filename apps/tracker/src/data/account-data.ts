/**
 * Account data, fetched once per data version and decoded in the browser.
 *
 * The server stores snapshots as deduplicated, deflated sections and sends
 * them untouched (a GDT1 bundle); this module inflates and rebuilds them.
 * Everything is cached by `${accountId}:${dataVersion}`: an import or delete
 * moves the version, so stale entries are simply never asked for again. The
 * HTTP layer adds a second cache: responses carry an ETag on the same
 * version, so a reload revalidates for one round trip and no body.
 */

import { accountPlayer, type AccountPlayer } from '@/data/account-player'
import {
  catalogFromRows,
  decodePlayer,
  decodeSnapshot,
  inflateBundle,
  readBundle,
  storedSnapshotOf,
  type BundleSnapshot,
  type CatalogEntry,
  type Good,
  type KeyDictionary,
  type SnapshotResponse,
} from '@gdt/shared'
import { api } from '@/api'

export interface AccountRef {
  id: number
  dataVersion: number
}

export type SectionName =
  | 'characters'
  | 'weapons'
  | 'artifacts'
  | 'materials'
  | 'achievements'
  | 'player'
  | 'achievementTimes'
  | 'characterExtras'

export interface DecodedBundle {
  snapshots: BundleSnapshot[]
  /** Section hash -> inflated JSON text. */
  texts: Map<string, string>
}

const cache = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 40

function cached<T>(account: AccountRef, kind: string, load: () => Promise<T>): Promise<T> {
  const key = `${account.id}:${account.dataVersion}:${kind}`
  let entry = cache.get(key) as Promise<T> | undefined
  if (!entry) {
    entry = load()
    entry.catch(() => cache.delete(key))
    cache.set(key, entry)
    // Oldest first: Map keeps insertion order.
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  }
  return entry
}

/** Snapshot metadata and summaries, newest first. */
export function loadSnapshots(account: AccountRef): Promise<SnapshotResponse[]> {
  return cached(account, 'snapshots', () => api.snapshots(account.id))
}

/** Every artifact the account has held, by catalog id, with CV/RV derived. */
export function loadCatalog(account: AccountRef): Promise<Map<number, CatalogEntry>> {
  return cached(account, 'catalog', async () => catalogFromRows(await api.catalog(account.id)))
}

/** Stored sections for some or all snapshots (oldest first), inflated. */
export function loadBundle(
  account: AccountRef,
  options: { ids?: number[]; sections?: SectionName[] } = {},
): Promise<DecodedBundle> {
  const variant = `bundle:${options.sections?.join('+') ?? 'all'}:${options.ids?.join(',') ?? 'all'}`
  return cached(account, variant, async () => {
    const { manifest, blobs } = readBundle(await api.bundle(account.id, options))
    return { snapshots: manifest.snapshots, texts: await inflateBundle(blobs) }
  })
}

let materialsDictionary: Promise<KeyDictionary> | null = null

/** The ~7,600-key materials dictionary, loaded only when something decodes materials. */
export function loadMaterialsDictionary(): Promise<KeyDictionary> {
  materialsDictionary ??= import('@gdt/shared/dictionary/materials').then((m) => m.MATERIALS)
  return materialsDictionary
}

/** Rebuilds the GOOD file for one snapshot of a full bundle. */
export function decodeBundleSnapshot(
  snapshot: BundleSnapshot,
  bundle: DecodedBundle,
  catalog: ReadonlyMap<number, CatalogEntry>,
  materials: KeyDictionary,
): Good {
  const text = (hash: string) => {
    const value = bundle.texts.get(hash)
    if (value === undefined) throw new Error(`Bundle is missing section ${hash}`)
    return value
  }
  return decodeSnapshot(storedSnapshotOf(snapshot, text), catalog, materials)
}

export interface Inventory {
  snapshot: BundleSnapshot
  good: Good
  catalog: Map<number, CatalogEntry>
}

/** The newest snapshot, fully decoded, with the catalog for artifact details. */
export function loadLatestInventory(
  account: AccountRef & { latest: { id: number } | null },
): Promise<Inventory | null> {
  const latest = account.latest
  if (!latest) return Promise.resolve(null)
  return cached(account, `latest:${latest.id}`, async () => {
    const [bundle, catalog, materials] = await Promise.all([
      loadBundle(account, { ids: [latest.id] }),
      loadCatalog(account),
      loadMaterialsDictionary(),
    ])
    const snapshot = bundle.snapshots[0]
    if (!snapshot) return null
    return { snapshot, good: decodeBundleSnapshot(snapshot, bundle, catalog, materials), catalog }
  })
}

/**
 * AR, World Level and Original Resin from irminsul's `gi_player` across the
 * snapshots (see accountPlayer); one small bundle of just those sections.
 */
export function loadAccountPlayer(account: AccountRef): Promise<AccountPlayer> {
  return cached(account, 'player', async () => {
    const bundle = await loadBundle(account, { sections: ['player'] })
    return accountPlayer(
      bundle.snapshots.map((s) => ({ takenAt: s.takenAt, key: s.player })),
      (key) => {
        const text = bundle.texts.get(key)
        return text === undefined ? {} : decodePlayer(JSON.parse(text))
      },
    )
  })
}
