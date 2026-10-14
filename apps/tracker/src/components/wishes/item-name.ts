import type { WishItem } from '@gdt/shared'
import { gameName } from '@/i18n/game-names'

/**
 * A wished item's name in the language on screen (the game's own, by its
 * GOOD key), else the English name the record carries.
 */
export function wishItemName(item: Pick<WishItem, 'key' | 'kind' | 'name'>): string {
  if (!item.key || !item.kind) return item.name
  return gameName(item.kind === 'character' ? 'characters' : 'weapons', item.key, item.name)
}
