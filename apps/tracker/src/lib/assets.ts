/**
 * Game images. Characters, weapons and artifacts come from the Enka Network
 * CDN (flat `/ui/<name>.png`), with icon names from Genshin Optimizer's asset
 * table (AssetsData_gen.json) keyed by GOOD keys, or from our own game data
 * (@gdt/game-data/avatars) for what that table doesn't have yet; the
 * Traveler's portrait follows the account's twin setting. Material and achievement
 * icons are self-hosted under /gi (packages/game-data `icons`), because Enka
 * lacks about half of them; Enka is only their fallback. Anything unknown
 * returns '' and GameIcon shows initials.
 */

import {
  characterIconNames,
  travelerIconNames,
  weaponIconNames,
  type TravelerGender,
} from '@gdt/game-data/avatars'
import { shallowRef } from 'vue'
import {
  loadIconManifest,
  loadMaterialIndex,
  type IconManifest,
  type MaterialIndex,
} from '@gdt/game-data'
import assetData from '@/utils/data/AssetsData_gen.json'

const ENKA = 'https://enka.network/ui'
/** Self-hosted game icons: apps/tracker/public/gi/<name>.webp. */
const GI = '/gi'

interface CharacterAssets {
  icon?: string
  iconSide?: string
  banner?: string
}
interface WeaponAssets {
  icon?: string
  awakenIcon?: string
}
type ArtifactAssets = Partial<Record<'flower' | 'plume' | 'sands' | 'goblet' | 'circlet', string>>

const chars = assetData.chars as Record<string, CharacterAssets>
const weapons = assetData.weapons as Record<string, WeaponAssets>
const artifacts = assetData.artifacts as Record<string, ArtifactAssets>

const url = (name: string | undefined) => (name ? `${ENKA}/${name}.png` : '')

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
  if (isTraveler(key)) return url(travelerIconNames(traveler.value)[0])
  return url(chars[key]?.icon ?? characterIconNames(key)?.[0])
}

export function characterSideIcon(key: string): string {
  if (isTraveler(key)) return url(travelerIconNames(traveler.value)[1])
  return url(chars[key]?.iconSide ?? characterIconNames(key)?.[1])
}

export function characterBanner(key: string): string {
  return url(chars[key]?.banner)
}

/** Weapon icon; ascended weapons (ascension >= 2) use the awakened art, as in game. */
export function weaponIcon(key: string, ascension = 0): string {
  const info = weapons[key]
  if (info?.icon) return url(ascension >= 2 ? (info.awakenIcon ?? info.icon) : info.icon)
  const names = weaponIconNames(key)
  return url(names && (ascension >= 2 ? names[1] : names[0]))
}

export function artifactIcon(setKey: string, slotKey: string): string {
  return url(artifacts[setKey]?.[slotKey as keyof ArtifactAssets])
}

/** Any artifact piece of a set, for set-level badges. */
export function artifactSetIcon(setKey: string): string {
  const set = artifacts[setKey]
  return url(set?.flower ?? set?.plume ?? set?.circlet)
}

const LOCAL_MATERIALS: Record<string, string> = {
  Mora: '/img/Item_Mora.webp',
  Primogem: '/img/Item_Primogem.webp',
  SanctifyingEssence: '/img/Item_Sanctifying_Essence.webp',
  SanctifyingUnction: '/img/Item_Sanctifying_Unction.webp',
}

let icons: IconManifest | null = null
let materialIndex: MaterialIndex | null = null

/** Loads the list of self-hosted icons (small); call before gameIcon. */
export async function loadGameIcons(): Promise<void> {
  icons ??= await loadIconManifest()
}

/**
 * A game icon by its name (`UI_ItemIcon_104013`, `UI_AchievementIcon_A001`):
 * self-hosted when we have it, '' when no source has it, else Enka (icons
 * newer than the last `icons` run). '' until loadGameIcons resolves.
 */
export function gameIcon(name: string): string {
  if (!icons || !name || icons.missing.has(name)) return ''
  return icons.hosted.has(name) ? `${GI}/${name}.webp` : url(name)
}

/** Loaded lazily (large); call before rendering material icons. */
export async function loadMaterialIcons(): Promise<void> {
  if (materialIndex) return
  const [index] = await Promise.all([loadMaterialIndex(), loadGameIcons()])
  materialIndex = index
}

export function materialIcon(key: string): string {
  return LOCAL_MATERIALS[key] ?? gameIcon(materialIndex?.icon(key) ?? '')
}

export function knownCharacter(key: string): boolean {
  return key in chars || isTraveler(key) || characterIconNames(key) !== undefined
}
