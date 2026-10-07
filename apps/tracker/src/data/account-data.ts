/**
 * Account data, fetched once per data version and decoded in the browser.
 *
 * The server stores snapshots as deduplicated, compressed sections and sends
 * them untouched (a GDT2 bundle); this module decodes and rebuilds them.
 * Everything is cached by `${accountId}:${dataVersion}`: an import or delete
 * moves the version, so stale entries are simply never asked for again. The
 * HTTP layer adds a second cache: responses carry an ETag on the same
 * version, so a reload revalidates for one round trip and no body.
 */

import { accountPlayer, type AccountPlayer } from '@/data/account-player'
import {
  artifactRows,
  catalogFromRows,
  decodeBundle,
  decodePlayer,
  decodeSnapshot,
  storedSnapshotOf,
  type BundleSnapshot,
  type CatalogEntry,
  type Good,
  type KeyDictionary,
  type SnapshotResponse,
} from '@gdt/shared'
import { api, BUNDLE_FORMAT } from '@/api'

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
  /** Section key -> its canonical JSON text (see decodeBundle). */
  texts: Map<string, string>
}

const cache = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 40

function cached<T>(account: AccountRef, kind: string, load: () => Promise<T>): Promise<T> {
  // The bundle layout is part of the key: a decoded bundle never outlives a layout change.
  const key = `${account.id}:${account.dataVersion}:${BUNDLE_FORMAT}:${kind}`
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
  return cached(account, variant, async () => decodeBundle(await api.bundle(account.id, options)))
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
  /** Catalog id of each of `good.artifacts`, same order. */
  artifactIds: number[]
}

/** Catalog ids of a snapshot's artifacts, in `decodeArtifacts` order. */
function artifactIdsOf(snapshot: BundleSnapshot, bundle: DecodedBundle): number[] {
  const text = (hash: string | null | undefined) => {
    const value = hash ? bundle.texts.get(hash) : undefined
    return value === undefined ? null : JSON.parse(value)
  }
  const section = text(snapshot.artifacts)
  if (!section) throw new Error(`Bundle is missing section ${snapshot.artifacts}`)
  return artifactRows(section, text(snapshot.artifactsBase)).map((row) => row[0])
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
    return {
      snapshot,
      good: decodeBundleSnapshot(snapshot, bundle, catalog, materials),
      catalog,
      artifactIds: artifactIdsOf(snapshot, bundle),
    }
  })
}

/**
 * Catalog ids of the artifacts in the snapshot before the newest one (null
 * when there is none): what the Artifacts page's "New" compares against. A
 * piece that levelled up has a new id, so "new" means new or changed. One
 * small bundle of just that snapshot's artifacts section.
 */
export function loadPreviousArtifactIds(
  account: AccountRef & { latest: { id: number; takenAt: number } | null },
): Promise<ReadonlySet<number> | null> {
  const latest = account.latest
  if (!latest) return Promise.resolve(null)
  return cached(account, `previous-artifacts:${latest.id}`, async () => {
    const snapshots = await loadSnapshots(account)
    const index = snapshots.findIndex((s) => s.id === latest.id)
    const previous =
      index >= 0 ? snapshots[index + 1] : snapshots.find((s) => s.takenAt < latest.takenAt)
    if (!previous) return null
    const bundle = await loadBundle(account, { ids: [previous.id], sections: ['artifacts'] })
    const snapshot = bundle.snapshots[0]
    return snapshot ? new Set(artifactIdsOf(snapshot, bundle)) : null
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
