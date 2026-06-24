import assetData from './data/AssetsData_gen.json'
import materialIcons from './MaterialIcons_gen.json'

// Use VITE_ASSET_BASE_URL from env, or default to enka if missing. 
// Can be changed to '/assets/gi' for local hosting.
const BASE_URL = import.meta.env.VITE_ASSET_BASE_URL || 'https://enka.network/ui'

/**
 * Helper to build the final image URL.
 * Enka CDN is flat, but local assets from Genshin Optimizer are nested.
 */
const buildUrl = (iconName: string | undefined, type: string, key: string): string => {
  if (!iconName) return ''
  
  if (BASE_URL.startsWith('http')) {
    // Enka uses a flat /ui folder (Enka serves png)
    return `${BASE_URL}/${iconName}.png`
  } else {
    // Local gen folder uses nested structure and we optimized them to webp: /assets/gi/artifacts/GladiatorsFinale/...
    return `${BASE_URL}/${type}/${key}/${iconName}.webp`
  }
}

/**
 * Fallback event handler for images.
 * If a .webp image fails to load (e.g. optimize script hasn't converted it yet),
 * this automatically falls back to requesting the original .png file.
 */
export const onImageFallback = (e: Event) => {
  const target = e.target as HTMLImageElement
  if (target.src && target.src.endsWith('.webp')) {
    target.src = target.src.replace('.webp', '.png')
  }
}

/**
 * Gets the icon URL for a specific artifact set and slot.
 * @param setKey The GOOD key of the artifact set (e.g., 'GladiatorsFinale')
 * @param slotKey The slot (e.g., 'flower', 'plume', 'sands', 'goblet', 'circlet')
 */
export const getArtifactIconUrl = (setKey: string, slotKey: string): string => {
  const setInfo = (assetData.artifacts as any)[setKey]
  if (!setInfo) return ''
  return buildUrl(setInfo[slotKey], 'artifacts', setKey)
}

/**
 * Gets the main icon URL for a character.
 * @param charKey The GOOD key of the character (e.g., 'HuTao')
 */
export const getCharacterIconUrl = (charKey: string): string => {
  const charInfo = (assetData.chars as any)[charKey]
  if (!charInfo) return ''
  return buildUrl(charInfo.icon, 'chars', charKey)
}

/**
 * Gets the main icon URL for a weapon.
 * @param weaponKey The GOOD key of the weapon (e.g., 'StaffOfHoma')
 */
export const getWeaponIconUrl = (weaponKey: string): string => {
  const weaponInfo = (assetData.weapons as any)[weaponKey]
  if (!weaponInfo) return ''
  return buildUrl(weaponInfo.icon, 'weapons', weaponKey)
}

/**
 * Gets the awakened icon URL for a weapon.
 * @param weaponKey The GOOD key of the weapon
 */
export const getWeaponAwakenIconUrl = (weaponKey: string): string => {
  const weaponInfo = (assetData.weapons as any)[weaponKey]
  if (!weaponInfo) return ''
  return buildUrl(weaponInfo.awakenIcon, 'weapons', weaponKey)
}

const KNOWN_MATERIAL_IMAGES: Record<string, string> = {
  Mora: '/img/Item_Mora.webp',
  Primogem: '/img/Item_Primogem.webp',
  SanctifyingEssence: '/img/Item_Sanctifying_Essence.webp',
  SanctifyingUnction: '/img/Item_Sanctifying_Unction.webp',
}

export const getMaterialIconUrl = (materialKey: string): string => {
  if (KNOWN_MATERIAL_IMAGES[materialKey]) {
    return KNOWN_MATERIAL_IMAGES[materialKey]
  }

  const icon = (materialIcons as Record<string, string>)[materialKey]
  if (!icon) return ''

  if (BASE_URL.startsWith('http')) {
    return `${BASE_URL}/${icon}.png`
  }
  return `${BASE_URL}/materials/${materialKey}/${icon}.webp`
}
