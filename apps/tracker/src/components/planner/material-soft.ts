import { RARITY_SOFT } from '@/components/characters/tokens'
import { materialRarity } from '@/utils/materials'

/**
 * A material icon's backdrop: a wash of its rarity's colour (the game's,
 * from the material index; `fallback`, the planner data's, until it loads),
 * neutral for a key the data doesn't know. Reactive, like materialRarity.
 */
export function materialSoft(key: string, fallback?: number | null): string {
  return RARITY_SOFT[materialRarity(key, fallback) ?? 0] ?? 'bg-surface-sunken'
}
