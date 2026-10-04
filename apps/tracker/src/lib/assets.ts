/**
 * Game images. Every one loads from static.nanoka.cc (`<name>.webp`, CORS
 * open, behind Cloudflare); the service worker keeps them cache-first. The
 * names come only from our own game data (@gdt/game-data, compiled from the
 * game's tables): `images` for characters, weapons, artifacts and a few
 * items, the material index for materials, achievement categories for
 * theirs. The Traveler's portrait follows the account's twin setting. Names
 * the host lacks (data/missing-images.json, see `pnpm --filter
 * @gdt/game-data images`) and anything unknown return '', so GameIcon shows
 * initials.
 */

import {
  artifactImage,
  artifactSetImage,
  characterImages,
  itemImage,
  travelerIcon,
  weaponImages,
  type ArtifactSlot,
  type TravelerGender,
} from '@gdt/game-data/images'
import { shallowRef } from 'vue'
import { loadMaterialIndex, loadMissingImages, type MaterialIndex } from '@gdt/game-data'

/** The image host (also in the service worker and index.html's preconnect). */
export const IMAGE_BASE = 'https://static.nanoka.cc/assets/gi/'

/** Names the host lacks; null until loadGameIcons resolves. */
let missing: ReadonlySet<string> | null = null

/** URL of a game image by name: '' without a name or for one the host lacks. */
export function imageUrl(name: string | undefined): string {
  return name && !missing?.has(name) ? `${IMAGE_BASE}${name}.webp` : ''
}

/**
 * Which twin the current account's Traveler is (an account setting, since
 * GOOD doesn't say). Reactive, so portraits follow a change at once.
 */
const traveler = shallowRef<TravelerGender>('F')

export function setTravelerGender(gender: TravelerGender): void {
  traveler.value = gender
}

const isTraveler = (key: string) => key.startsWith('Traveler')

/** Square character portrait. */
export function characterIcon(key: string): string {
  if (isTraveler(key)) return imageUrl(travelerIcon(traveler.value))
  return imageUrl(characterImages(key)?.icon)
}

/** The character's namecard picture ('' for the Traveler and Manekin). */
export function characterBanner(key: string): string {
  return imageUrl(characterImages(key)?.namecard)
}

/** Weapon icon; ascended weapons (ascension >= 2) use the awakened art, as in game. */
export function weaponIcon(key: string, ascension = 0): string {
  const names = weaponImages(key)
  return imageUrl(names && (ascension >= 2 ? names[1] : names[0]))
}

export function artifactIcon(setKey: string, slotKey: string): string {
  return imageUrl(artifactImage(setKey, slotKey as ArtifactSlot))
}

/** Any artifact piece of a set, for set-level badges. */
export function artifactSetIcon(setKey: string): string {
  return imageUrl(artifactSetImage(setKey))
}

let materialIndex: MaterialIndex | null = null

/** Loads the list of names the host lacks (small); call before gameIcon. */
export async function loadGameIcons(): Promise<void> {
  missing ??= await loadMissingImages()
}

/**
 * A game icon by its name (`UI_ItemIcon_104013`, `UI_AchievementIcon_A001`):
 * '' when the host lacks it, and '' until loadGameIcons resolves (so a
 * missing icon is never requested).
 */
export function gameIcon(name: string): string {
  return missing ? imageUrl(name) : ''
}

/** Loaded lazily (large); call before rendering material icons. */
export async function loadMaterialIcons(): Promise<void> {
  if (materialIndex) return
  const [index] = await Promise.all([loadMaterialIndex(), loadGameIcons()])
  materialIndex = index
}

/** A material's icon by GOOD key; Mora, Primogem and the Sanctifying items work without loading. */
export function materialIcon(key: string): string {
  const item = itemImage(key)
  return item ? imageUrl(item) : gameIcon(materialIndex?.icon(key) ?? '')
}
