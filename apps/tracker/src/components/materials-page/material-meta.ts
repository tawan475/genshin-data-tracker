/**
 * Where a material sits in the in-game Inventory, and in what order.
 *
 * Both come from the game data's bag (`@gdt/game-data/bag`, data/bag.json):
 * the Inventory's tabs left to right, which tab holds each material (weapon
 * enhancement ores in Weapons, Sanctifying Unction and Essence in Artifacts,
 * as the game keeps them), and the game's default order inside a tab. A key
 * in no tab (currencies, garden seeds, card game items) or newer than the
 * data goes to "other", after every tab, so nothing a capture holds is lost.
 */

import { loadMaterialIndex, type MaterialIndex } from '@gdt/game-data'
import { loadBag, type Bag, type BagTab, type BagTabInfo } from '@gdt/game-data/bag'

/** An Inventory tab, or 'other' for keys the Inventory doesn't show. */
export type TabKey = BagTab | 'other'

/**
 * Currency and wish items: the wallet strip above the bag, in this order.
 * Only the ones an account's snapshots hold are shown. In the bag they sit
 * where the game puts them (Fates in Precious Items, Mora under Other).
 */
export const WALLET_KEYS = [
  'Mora',
  'Primogem',
  'GenesisCrystal',
  'IntertwinedFate',
  'AcquaintFate',
  'MasterlessStarglitter',
  'MasterlessStardust',
  'OriginalResin',
  'FragileResin',
  'CondensedResin',
  'RealmCurrency',
]
export const WALLET = new Set(WALLET_KEYS)
const WALLET_RANK = new Map(WALLET_KEYS.map((key, i) => [key, i]))

/** Shorter labels for the strip; others use the material name. */
export const WALLET_LABELS: Record<string, string> = {
  GenesisCrystal: 'Genesis',
  IntertwinedFate: 'Intertwined',
  AcquaintFate: 'Acquaint',
  MasterlessStarglitter: 'Starglitter',
  MasterlessStardust: 'Stardust',
  OriginalResin: 'Resin',
  FragileResin: 'Fragile',
  CondensedResin: 'Condensed',
  RealmCurrency: 'Realm',
}

export interface MaterialMeta {
  tab: TabKey
  /**
   * Place in the game's order across the whole Inventory: tab by tab, left
   * to right, each in the game's default order; keys in no tab after every
   * tab, keys newer than the data last (the bag's `sortKey`).
   */
  order: number
  /** Item id, which orders the keys in no tab; MAX_SAFE_INTEGER when unknown. */
  id: number
}

const UNKNOWN = Number.MAX_SAFE_INTEGER
const OTHER: MaterialMeta = { tab: 'other', order: UNKNOWN, id: UNKNOWN }

/** A key's tab and order from the bag and the material index (pure; what materialMeta caches). */
export function metaFor(
  bag: Pick<Bag, 'tab' | 'sortKey'>,
  index: Pick<MaterialIndex, 'id'>,
  key: string,
): MaterialMeta {
  return { tab: bag.tab(key) ?? 'other', order: bag.sortKey(key), id: index.id(key) ?? UNKNOWN }
}

/**
 * The game's order: the Inventory's (tab, then the tab's order); among keys
 * in no tab, the wallet's order, then by item id; then by name.
 */
export function compareInGame(
  a: { key: string; name: string; order: number; id: number },
  b: { key: string; name: string; order: number; id: number },
): number {
  return (
    a.order - b.order ||
    (WALLET_RANK.get(a.key) ?? UNKNOWN) - (WALLET_RANK.get(b.key) ?? UNKNOWN) ||
    a.id - b.id ||
    a.name.localeCompare(b.name)
  )
}

/**
 * The tabs the given items fill, in the game's order, then 'other' when any
 * item is in none. `tabs` is the bag's tab list (left to right).
 */
export function tabsHolding(
  tabs: readonly Pick<BagTabInfo, 'key'>[],
  items: Iterable<{ tab: TabKey }>,
): TabKey[] {
  const present = new Set<TabKey>()
  for (const item of items) present.add(item.tab)
  const out: TabKey[] = tabs.map((t) => t.key).filter((key) => present.has(key))
  if (present.has('other')) out.push('other')
  return out
}

let bag: Bag | null = null
let index: MaterialIndex | null = null
let loading: Promise<void> | null = null
const metas = new Map<string, MaterialMeta>()

/** Loads the bag and the material index (lazy chunks, once). */
export function loadMaterialMeta(): Promise<void> {
  loading ??= Promise.all([loadBag(), loadMaterialIndex()]).then(
    ([loadedBag, loadedIndex]) => {
      bag = loadedBag
      index = loadedIndex
      metas.clear()
    },
    (error) => {
      loading = null
      throw error
    },
  )
  return loading
}

/** The Inventory's tabs left to right ([] until loadMaterialMeta resolves). */
export function bagTabs(): readonly BagTabInfo[] {
  return bag?.tabs ?? []
}

/** A key's tab and order ("other", last, until loadMaterialMeta resolves). */
export function materialMeta(key: string): MaterialMeta {
  if (!bag || !index) return OTHER
  let meta = metas.get(key)
  if (!meta) {
    meta = metaFor(bag, index, key)
    metas.set(key, meta)
  }
  return meta
}
