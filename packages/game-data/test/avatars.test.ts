import { describe, expect, it } from 'vitest'
import plannerJson from '../data/planner.json'
import { characterIconNames, travelerIconNames, weaponIconNames } from '../src/avatars'
import type { PlannerFile } from '../src/format'

const planner = plannerJson as unknown as PlannerFile

describe('avatars.json', () => {
  it('names a portrait for every planner character, the Traveler by twin', () => {
    for (const [key] of planner.characters) {
      if (key.startsWith('Traveler')) continue
      const names = characterIconNames(key)
      expect(names?.[0], key).toMatch(/^UI_AvatarIcon_/)
      expect(names?.[1], key).toMatch(/^UI_AvatarIcon_Side_/)
    }
    expect(characterIconNames('TravelerGeo')).toBeUndefined()
    expect(travelerIconNames('F')[0]).toBe('UI_AvatarIcon_PlayerGirl')
    expect(travelerIconNames('M')[0]).toBe('UI_AvatarIcon_PlayerBoy')
  })

  it('names an icon for every planner weapon', () => {
    for (const [key] of planner.weapons) {
      const names = weaponIconNames(key)
      expect(names?.[0], key).toMatch(/^UI_EquipIcon_/)
      expect(names?.[1], key).toMatch(/^UI_EquipIcon_/)
    }
  })

  it('covers the characters newer than the app asset table', () => {
    // Alyosha shipped after Genshin Optimizer's asset table was last copied.
    expect(characterIconNames('Alyosha')?.[0]).toBe('UI_AvatarIcon_Alyosha')
    expect(weaponIconNames('ExaiphanesBlade')?.[0]).toBe('UI_EquipIcon_Sword_WeaponQuestSnezhnaya')
  })
})
