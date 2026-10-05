/**
 * Game images. They load from static.nanoka.cc (`<name>.webp`, CORS open,
 * behind Cloudflare), except the names that host lacks: of those, the ones a
 * client extraction has are served from this app's own `/gi/<name>.webp`
 * (public/gi/, copied from the local gi-cdn build and gitignored; a deploy
 * without them 404s there, and the image components show initials on error),
 * and the rest return '', so GameIcon shows initials. Both
 * lists come from data/missing-images.json (`pnpm --filter @gdt/game-data
 * images`); the service worker keeps either kind cache-first. The names
 * come only from our own game data (@gdt/game-data, compiled from the
 * game's tables): `images` for characters, weapons, artifacts and a few
 * items, the material index for materials, achievement categories for
 * theirs. The Traveler's portrait follows the account's twin setting.
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
import { imageUrlOf } from '@gdt/game-data/image-url'
import { shallowRef } from 'vue'
import {
  loadImageCoverage,
  loadMaterialIndex,
  type ImageCoverage,
  type MaterialIndex,
} from '@gdt/game-data'

/** The image host (also in the service worker and index.html's preconnect). */
export const IMAGE_BASE = 'https://static.nanoka.cc/assets/gi/'

/** This app's own copies of images the host lacks (public/gi/, also in the service worker). */
export const OWN_IMAGE_BASE = '/gi/'

/**
 * What the host lacks and what we serve instead; null until loadGameIcons
 * resolves. Reactive, so images rendered before it arrived switch to our
 * copy or to initials.
 */
const coverage = shallowRef<ImageCoverage | null>(null)

/**
 * URL of a game image by name: the host's, ours for a name the host lacks,
 * or '' (no name, or no image anywhere).
 */
export function imageUrl(name: string | undefined): string {
  return imageUrlOf(name, coverage.value, IMAGE_BASE, OWN_IMAGE_BASE)
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

/** Loads which names the host lacks and which we serve (small); AccountLayout starts it. */
export async function loadGameIcons(): Promise<void> {
  coverage.value ??= await loadImageCoverage()
}

/**
 * A game icon by its name (`UI_ItemIcon_104013`, `UI_AchievementIcon_A001`),
 * as imageUrl, but '' until loadGameIcons resolves (so a name the host lacks
 * is never requested there).
 */
export function gameIcon(name: string): string {
  return coverage.value ? imageUrl(name) : ''
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
