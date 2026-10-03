/**
 * Game images, all from the Enka Network CDN (flat `/ui/<name>.png`).
 * Icon names come from Genshin Optimizer's asset table (AssetsData_gen.json),
 * keyed by GOOD keys. Anything unknown returns '' and GameIcon shows initials.
 */

import assetData from '@/utils/data/AssetsData_gen.json'

const ENKA = 'https://enka.network/ui'

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

/** Square character portrait. Traveler variants fall back to the base key. */
export function characterIcon(key: string): string {
  return url(
    (chars[key] ?? chars[key.replace(/(Anemo|Geo|Electro|Dendro|Hydro|Pyro|Cryo)$/, '')])?.icon,
  )
}

export function characterSideIcon(key: string): string {
  return url(chars[key]?.iconSide)
}

export function characterBanner(key: string): string {
  return url(chars[key]?.banner)
}

/** Weapon icon; ascended weapons (ascension >= 2) use the awakened art, as in game. */
export function weaponIcon(key: string, ascension = 0): string {
  const info = weapons[key]
  return url(ascension >= 2 ? (info?.awakenIcon ?? info?.icon) : info?.icon)
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

let materialIcons: Record<string, string> = {}

/** Loaded lazily (large); call before rendering material icons. */
export async function loadMaterialIcons(): Promise<void> {
  if (Object.keys(materialIcons).length > 0) return
  const module = await import('@/utils/data/MaterialIcons_gen.json')
  materialIcons = module.default as Record<string, string>
}

export function materialIcon(key: string): string {
  return LOCAL_MATERIALS[key] ?? url(materialIcons[key])
}

export function knownCharacter(key: string): boolean {
  return key in chars
}
