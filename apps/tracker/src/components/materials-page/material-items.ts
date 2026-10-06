import type { MaterialsHistory } from '@/data/materials-history'
import { isPlayerProperty, materialName } from '@/utils/materials'
import { materialMeta, WALLET, type TabKey } from './material-meta'

/** One material the account has held in any snapshot. */
export interface MaterialItem {
  key: string
  name: string
  /** The in-game Inventory tab it sits in ('other': none, or newer than the data). */
  tab: TabKey
  /** Place in the game's order across the Inventory (see MaterialMeta). */
  order: number
  /** Item id (orders keys in no tab). */
  id: number
  /** Count in the newest snapshot (0 once spent or dropped). */
  count: number
  /** Currency or wish item (also shown in the wallet strip). */
  wallet: boolean
}

/** A MaterialItem for a key, at the given count. */
export function materialItem(key: string, count: number): MaterialItem {
  const meta = materialMeta(key)
  return {
    key,
    name: materialName(key),
    tab: meta.tab,
    order: meta.order,
    id: meta.id,
    count,
    wallet: WALLET.has(key),
  }
}

/**
 * Every material in the history, minus the account stats older Irminsul
 * builds stored as materials (world level, stamina, Property ids).
 */
export function buildItems(history: MaterialsHistory): MaterialItem[] {
  const items: MaterialItem[] = []
  for (const key of history.series.keys()) {
    if (isPlayerProperty(key)) continue
    items.push(materialItem(key, history.latest.get(key) ?? 0))
  }
  return items
}
