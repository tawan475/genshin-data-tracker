/**
 * Rarity, element and weapon type per GOOD key: what a GOOD file leaves out.
 * They come from the game data's catalog (`@gdt/game-data/catalog`,
 * compiled from Dimbreath's dump for every patch), so a new character has
 * them as soon as the data release that adds it is deployed. Elements are
 * lowercase here, as the app's colour tokens and filters name them.
 */

import type { Element as GameElement, WeaponType } from '@gdt/game-data'
import { characterInfo, weaponInfo } from '@gdt/game-data/catalog'

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
