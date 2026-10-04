/**
 * Image names for characters, weapons, artifacts and a few items, from the
 * game data (data/images.json, see scripts/compile/images.ts). Imported
 * statically (about 12 KB gzipped) so the app resolves an image
 * synchronously; everything else in this package loads lazily. Where the
 * images are served from is the app's business (apps/tracker/src/lib/assets.ts).
 */

import type { ArtifactSlot, CharacterImagesRow, ImagesFile } from './format'
import data from '../data/images.json'

const file = data as unknown as ImagesFile

export type { ArtifactSlot } from './format'
export type TravelerGender = 'F' | 'M'

const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

export interface CharacterImages {
  /** Portrait; '' for Traveler keys (see travelerIcon). */
  icon: string
  /** Namecard banner; '' when the character has none (Traveler, Manekin). */
  namecard: string
  /** Normal attack, elemental skill and burst talent icons. */
  attack: string
  skill: string
  burst: string
  /** C1–C6; empty for Manekin(a), who has no constellations. */
  constellations: readonly string[]
}

const characters = new Map<string, CharacterImages>()

/** Image names for a GOOD character key (one per Traveler element: `TravelerAnemo`…). */
export function characterImages(key: string): CharacterImages | undefined {
  let found = characters.get(key)
  if (found) return found
  const row: CharacterImagesRow | undefined = own(file.characters, key)
  if (!row) return undefined
  const [icon, namecard, attack, skill, burst, constellations] = row
  found = { icon, namecard, attack, skill, burst, constellations }
  characters.set(key, found)
  return found
}

/** The Traveler twin's portrait. */
export function travelerIcon(gender: TravelerGender): string {
  return file.traveler[gender]
}

/** [icon, ascended icon] for a GOOD weapon key. */
export function weaponImages(key: string): readonly [icon: string, awaken: string] | undefined {
  return own(file.weapons, key)
}

const SLOTS = file.columns.artifacts

/** Piece icon of an artifact set's slot ('' when the set has no such piece). */
export function artifactImage(setKey: string, slot: ArtifactSlot): string | undefined {
  const icons = own(file.artifacts, setKey)
  return icons && icons[SLOTS.indexOf(slot)]
}

/** Any piece of the set (flower first), for set-level badges. */
export function artifactSetImage(setKey: string): string | undefined {
  return own(file.artifacts, setKey)?.find(Boolean)
}

/** Icon of the few items the app shows without the material index (Mora, Primogem…). */
export function itemImage(key: string): string | undefined {
  return own(file.items, key)
}

/** Every image name in data/images.json (for the coverage check). */
export function allImageNames(): Set<string> {
  const names = new Set<string>(Object.values(file.traveler))
  for (const [icon, namecard, attack, skill, burst, constellations] of Object.values(
    file.characters,
  )) {
    for (const name of [icon, namecard, attack, skill, burst, ...constellations])
      if (name) names.add(name)
  }
  for (const pair of Object.values(file.weapons)) for (const name of pair) names.add(name)
  for (const icons of Object.values(file.artifacts))
    for (const name of icons) if (name) names.add(name)
  for (const name of Object.values(file.items)) names.add(name)
  return names
}
