/**
 * Rarity, element and weapon type per GOOD key: what a GOOD file leaves out.
 * They come from the game data's catalog (`@gdt/game-data/catalog`,
 * compiled from Dimbreath's dump for every patch), so a new character has
 * them as soon as the data release that adds it is deployed. Elements are
 * lowercase here, as the app's colour tokens and filters name them.
 */

import type { Element as GameElement, WeaponType } from '@gdt/game-data'
import { characterInfo, weaponInfo } from '@gdt/game-data/catalog'
import { shallowRef } from 'vue'

export type Element = Lowercase<GameElement>
export type { WeaponType }

export function toElement(element: GameElement | null | undefined): Element | null {
  return element ? (element.toLowerCase() as Element) : null
}

/**
 * [rarity, element (null: the Traveler and Manekin(a) change element),
 * weapon type]; undefined for a key the data doesn't know.
 */
export function characterMeta(
  key: string,
): readonly [number, Element | null, WeaponType] | undefined {
  const info = characterInfo(key)
  return info && [info.rarity, toElement(info.element), info.weapon]
}

/** [rarity, weapon type]; undefined for a key the data doesn't know. */
export function weaponMeta(key: string): readonly [number, WeaponType] | undefined {
  const info = weaponInfo(key)
  return info && [info.rarity, info.type]
}

/**
 * Weapon ids and level caps from planner.json, once something has loaded it
 * (the Planner and Materials pages do; nothing loads it just for these).
 * When catalog.json carries `id` and `maxLevel` columns, the two functions
 * below read `weaponInfo(key)` instead and this goes.
 */
const plannerWeapons = shallowRef<ReadonlyMap<string, { id: number; maxLevel: number }> | null>(
  null,
)

export function rememberPlannerWeapons(
  weapons: ReadonlyMap<string, { id: number; maxLevel: number }>,
): void {
  plannerWeapons.value = weapons
}

/** The game's weapon id (newer weapons have higher ids within a type); 0 while unknown. */
export function weaponGameId(key: string): number {
  return plannerWeapons.value?.get(key)?.id ?? 0
}

/** The level a weapon tops out at: 90, or 70 for 1–2★. */
export function weaponMaxLevel(key: string, rarity: number | null): number {
  return plannerWeapons.value?.get(key)?.maxLevel ?? (rarity !== null && rarity <= 2 ? 70 : 90)
}
