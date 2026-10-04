import { describe, expect, it } from 'vitest'
import plannerJson from '../data/planner.json'
import goAssets from './fixtures/go-assets.json'
import type { PlannerFile } from '../src/format'
import {
  artifactImage,
  artifactSetImage,
  characterImages,
  itemImage,
  travelerIcon,
  weaponImages,
} from '../src/images'

const planner = plannerJson as unknown as PlannerFile
const go = goAssets as unknown as Record<
  'chars' | 'weapons' | 'artifacts',
  Record<string, string[]>
>

describe('images.json', () => {
  it('names every image of every planner character', () => {
    for (const [key, , , , weapon] of planner.characters) {
      const images = characterImages(key)
      expect(images, key).toBeDefined()
      const { icon, attack, skill, burst, constellations } = images!
      if (key.startsWith('Traveler')) expect(icon, key).toBe('')
      else expect(icon, key).toMatch(/^UI_AvatarIcon_/)
      expect(attack, key).toMatch(/^Skill_A_/)
      expect(skill, key).toMatch(/^Skill_[SE]_/)
      expect(burst, key).toMatch(/^Skill_[SE]_/)
      // Manekin(a) has no constellations.
      expect(constellations.length, key).toBe(key.startsWith('Manekin') ? 0 : 6)
      for (const name of constellations) expect(name, key).toMatch(/^UI_Talent_/)
      // Normal attack art follows the weapon type.
      expect(attack, key).toBe(
        {
          sword: 'Skill_A_01',
          bow: 'Skill_A_02',
          polearm: 'Skill_A_03',
          claymore: 'Skill_A_04',
          catalyst: 'Skill_A_Catalyst_MD',
        }[weapon],
      )
    }
    expect(travelerIcon('F')).toBe('UI_AvatarIcon_PlayerGirl')
    expect(travelerIcon('M')).toBe('UI_AvatarIcon_PlayerBoy')
    expect(characterImages('constructor')).toBeUndefined()
  })

  it('names a namecard for everyone but the Traveler and Manekin(a)', () => {
    for (const [key] of planner.characters) {
      const { namecard } = characterImages(key)!
      if (/^(Traveler|Manekin)/.test(key)) expect(namecard, key).toBe('')
      else expect(namecard, key).toMatch(/^UI_NameCardPic_.+_P$/)
    }
    // From the friendship reward, where the portrait's name would be wrong.
    expect(characterImages('YaeMiko')?.namecard).toBe('UI_NameCardPic_Yae1_P')
    expect(characterImages('Kirara')?.namecard).toBe('UI_NameCardPic_Kirara_P')
  })

  it('names an icon and an ascended icon for every planner weapon', () => {
    for (const [key] of planner.weapons) {
      const names = weaponImages(key)
      expect(names?.[0], key).toMatch(/^UI_EquipIcon_/)
      expect(names?.[1], key).toMatch(/^UI_EquipIcon_/)
    }
  })

  it('names artifact pieces by GOOD set key and slot', () => {
    expect(artifactImage('GladiatorsFinale', 'flower')).toBe('UI_RelicIcon_15001_4')
    expect(artifactImage('GladiatorsFinale', 'circlet')).toBe('UI_RelicIcon_15001_3')
    expect(artifactImage('PrayersForWisdom', 'flower')).toBe('')
    expect(artifactSetImage('PrayersForWisdom')).toBe('UI_RelicIcon_15011_3')
    expect(artifactSetImage('NotASet')).toBeUndefined()
  })

  it('names the items the app shows without the material index', () => {
    expect(itemImage('Primogem')).toBe('UI_ItemIcon_201')
    expect(itemImage('Mora')).toBe('UI_ItemIcon_202')
    expect(itemImage('SanctifyingEssence')).toBe('UI_ItemIcon_105003')
    expect(itemImage('SanctifyingUnction')).toBe('UI_ItemIcon_105002')
  })

  it('agrees with Genshin Optimizer on every image both name', () => {
    // GO's asset table (test/fixtures/go-assets.json) was extracted from the
    // client by GO's maintainers; ours come from the dump. Bursts: GO uses the
    // `_HD` variant of the same art.
    const diffs: string[] = []
    let compared = 0
    const check = (what: string, theirs: string | undefined, ours: string | undefined) => {
      if (!theirs) return
      compared++
      if (theirs !== ours) diffs.push(`${what}: GO ${theirs}, ours ${ours}`)
    }
    for (const [key, [icon, banner, skill, burst, ...constellations]] of Object.entries(go.chars)) {
      if (key === 'TravelerM' || key === 'TravelerF') {
        check(key, icon, travelerIcon(key === 'TravelerM' ? 'M' : 'F'))
        continue
      }
      const ours = characterImages(key)
      if (!ours) {
        diffs.push(`${key}: not in images.json`)
        continue
      }
      check(`${key} icon`, icon, ours.icon)
      check(`${key} namecard`, banner, ours.namecard)
      check(`${key} skill`, skill, ours.skill)
      check(`${key} burst`, burst, ours.burst && `${ours.burst}_HD`)
      constellations.forEach((name, i) => check(`${key} C${i + 1}`, name, ours.constellations[i]))
    }
    for (const [key, [icon, awaken]] of Object.entries(go.weapons)) {
      const ours = weaponImages(key)
      if (!ours) diffs.push(`weapon ${key}: not in images.json`)
      check(`${key} icon`, icon, ours?.[0])
      check(`${key} ascended`, awaken, ours?.[1])
    }
    for (const [key, pieces] of Object.entries(go.artifacts)) {
      ;(['flower', 'plume', 'sands', 'goblet', 'circlet'] as const).forEach((slot, i) =>
        check(`${key} ${slot}`, pieces[i], artifactImage(key, slot)),
      )
    }
    expect(diffs).toEqual([])
    expect(compared).toBeGreaterThan(1900)
  })
})
