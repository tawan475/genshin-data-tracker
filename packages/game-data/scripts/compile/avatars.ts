/**
 * Portrait and weapon icon names for every planner character and weapon.
 *
 * The app's portraits come from Genshin Optimizer's asset table, which lags
 * new releases; these names, straight from the dump, fill the gap (the
 * images themselves are on Enka). The Traveler is one GOOD key per element
 * for both twins, so its two portraits are listed by gender instead.
 */

import type { AvatarsFile, PlannerFile } from '../../src/format.ts'
import { num, str, type Row } from '../lib/excel.ts'
import { sortedObject } from '../lib/json.ts'
import type { Problems } from '../lib/problems.ts'

/** The twins' portraits, which name their gender (stable since 1.0). */
const TRAVELER_ICONS = { F: 'UI_AvatarIcon_PlayerGirl', M: 'UI_AvatarIcon_PlayerBoy' } as const

export function compileAvatarIcons(
  inputs: { avatars: Row[]; weapons: Row[] },
  planner: PlannerFile,
  problems: Problems,
): AvatarsFile {
  const avatars = new Map(inputs.avatars.map((a) => [num(a, 'id'), a]))
  const weapons = new Map(inputs.weapons.map((w) => [num(w, 'id'), w]))

  const characters: [string, [string, string]][] = []
  for (const [key, id] of planner.characters) {
    if (key.startsWith('Traveler')) continue
    const row = avatars.get(id)
    const icon = row ? str(row, 'iconName') : ''
    if (!icon) {
      problems.error(`Character ${key} (${id}): no iconName`)
      continue
    }
    characters.push([key, [icon, str(row!, 'sideIconName')]])
  }

  const traveler = {} as AvatarsFile['traveler']
  for (const [gender, icon] of Object.entries(TRAVELER_ICONS) as [
    keyof typeof TRAVELER_ICONS,
    string,
  ][]) {
    const row = inputs.avatars.find((a) => str(a, 'iconName') === icon)
    if (!row) {
      problems.error(`Traveler: no avatar with iconName ${icon}`)
      continue
    }
    traveler[gender] = [icon, str(row, 'sideIconName')]
  }

  const weaponIcons: [string, [string, string]][] = []
  for (const [key, id] of planner.weapons) {
    const row = weapons.get(id)
    const icon = row ? str(row, 'icon') : ''
    if (!icon) {
      problems.error(`Weapon ${key} (${id}): no icon`)
      continue
    }
    // Some weapons reuse the base art when ascended (awakenIcon == icon).
    weaponIcons.push([key, [icon, str(row!, 'awakenIcon') || icon]])
  }

  return {
    columns: { characters: ['icon', 'side'], weapons: ['icon', 'awaken'] },
    characters: sortedObject(characters),
    traveler,
    weapons: sortedObject(weaponIcons),
  }
}
