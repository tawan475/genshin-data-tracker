/**
 * Character portrait and weapon icon names from the game data, for the app's
 * image helpers. Imported statically (about 5 KB gzipped) so a portrait can
 * be resolved synchronously; everything else in this package loads lazily.
 */

import type { AvatarsFile } from './format'
import data from '../data/avatars.json'

const file = data as unknown as AvatarsFile

export type TravelerGender = 'F' | 'M'

/** [portrait, side icon] for a GOOD character key; Traveler keys are not listed. */
export function characterIconNames(key: string): readonly [string, string] | undefined {
  return file.characters[key]
}

/** [portrait, side icon] of the Traveler twin. */
export function travelerIconNames(gender: TravelerGender): readonly [string, string] {
  return file.traveler[gender]
}

/** [icon, ascended icon] for a GOOD weapon key. */
export function weaponIconNames(key: string): readonly [string, string] | undefined {
  return file.weapons[key]
}
