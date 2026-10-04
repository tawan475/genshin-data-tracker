import type { MaterialsHistory } from '@/data/materials'
import { isPlayerProperty, materialName } from '@/utils/materials'
import { materialMeta, WALLET, type MaterialKind } from './material-meta'

/** One material the account has held in any snapshot. */
export interface MaterialItem {
  key: string
  name: string
  kind: MaterialKind
  order: number
  /** Count in the newest snapshot (0 once spent or dropped). */
  count: number
  /** Currency or wish item (shown in the wallet strip, not the bag). */
  wallet: boolean
}

/**
 * Every material in the history, minus the account stats older Irminsul
 * builds stored as materials (world level, stamina, Property ids).
 */
export function buildItems(history: MaterialsHistory): MaterialItem[] {
  const items: MaterialItem[] = []
  for (const key of history.series.keys()) {
    if (isPlayerProperty(key)) continue
    const meta = materialMeta(key)
    items.push({
      key,
      name: materialName(key),
      kind: meta.kind,
      order: meta.order,
      count: history.latest.get(key) ?? 0,
      wallet: WALLET.has(key),
    })
  }
  return items
}
