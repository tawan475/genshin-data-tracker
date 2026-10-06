import { decodePlanner } from '@gdt/game-data'
import images from '@gdt/game-data/data/images.json'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { describe, expect, it } from 'vitest'
import { seelieKeys } from '@/data/seelie'
import { mapSeelieInventory, seelieMaterial, seelieSlotOf } from '../seelie-items'
import {
  SEELIE_ITEMS,
  artifactSetOfSlug,
  seelieArtifactSlug,
  seelieCharacterSlug,
  seelieStat,
  seelieWeaponSlug,
  type SeelieItemType,
} from '../seelie-slugs'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const sets = Object.keys((images as { artifacts: Record<string, unknown> }).artifacts)

describe("Seelie's item slugs", () => {
  it('name planner materials by game id, every tier, and back', () => {
    let rows = 0
    for (const [type, slugs] of Object.entries(SEELIE_ITEMS) as [
      SeelieItemType,
      Record<string, number>,
    ][]) {
      for (const [slug, id] of Object.entries(slugs)) {
        const head = seelieMaterial(planner, type, slug, 0)
        expect(head?.id, `${type}/${slug}`).toBe(id)
        const members = head!.family?.members ?? [head!]
        members.forEach((member, tier) => {
          expect(seelieMaterial(planner, type, slug, tier)).toBe(member)
          expect(seelieSlotOf(member)).toEqual({ type, item: slug, tier })
          rows++
        })
        expect(seelieMaterial(planner, type, slug, members.length)).toBeNull()
      }
    }
    expect(rows).toBeGreaterThan(500)
  })

  it('cover every family the planner farms', () => {
    const kinds = new Set(['book', 'weapon', 'common', 'elite', 'gem', 'boss', 'weekly', 'local'])
    const missing = [...planner.materialsByKey.values()]
      .filter((m) => kinds.has(m.kind) || m.kind === 'crown')
      .filter((m) => !seelieSlotOf(m))
      .map((m) => m.key)
    expect(missing).toEqual([])
  })

  it('have fixed rows for EXP, ores, Mora and Dream Solvent', () => {
    const slot = (key: string) => seelieSlotOf(planner.materialsByKey.get(key)!)
    expect(slot('HerosWit')).toEqual({ type: 'xp', item: 'xp', tier: 0 })
    expect(slot('WanderersAdvice')).toEqual({ type: 'xp', item: 'xp_sub_0', tier: 0 })
    expect(slot('FineEnhancementOre')).toEqual({ type: 'wep_xp', item: 'wep_xp_sub_1', tier: 0 })
    expect(slot('Mora')).toEqual({ type: 'mora', item: 'mora', tier: 0 })
    expect(slot(planner.items.dreamSolvent)).toEqual({
      type: 'special',
      item: 'dream_solvent',
      tier: 0,
    })
    for (const key of ['HerosWit', 'WanderersAdvice', 'FineEnhancementOre', 'Mora']) {
      const s = slot(key)!
      expect(seelieMaterial(planner, s.type, s.item, s.tier)?.key).toBe(key)
    }
    expect(seelieMaterial(planner, 'special', 'dream_solvent', 0)?.key).toBe(
      planner.items.dreamSolvent,
    )
  })

  it('read an inventory, adding up rows of one material', () => {
    const inventory = [
      { type: 'talent', item: 'freedom', tier: 1, value: 12 },
      { type: 'xp', item: 'xp', tier: 0, value: 40 },
      { type: 'xp', item: 'xp', tier: 0, value: 2 },
      { type: 'mora', item: 'mora', tier: 0, value: 5_000_000 },
      { type: 'local', item: 'not_a_flower', tier: 0, value: 3 },
      { type: 'common', item: 'mask', tier: 2, value: 0 },
    ]
    expect(mapSeelieInventory({ inventory }, planner)).toEqual({
      items: [
        { key: 'GuideToFreedom', count: 12 },
        { key: 'HerosWit', count: 42 },
        { key: 'Mora', count: 5_000_000 },
      ],
      unmapped: ['local/not_a_flower/0'],
    })
  })
})

describe('Seelie names for characters, weapons and sets', () => {
  const keys = seelieKeys(planner)

  it('write a slug every planner character and weapon reads back as itself', () => {
    expect(seelieCharacterSlug('HuTao')).toBe('hutao')
    expect(seelieCharacterSlug('RaidenShogun')).toBe('shogun')
    expect(seelieCharacterSlug('TravelerAnemo')).toBe('traveler_anemo')
    expect(seelieWeaponSlug('StaffOfHoma')).toBe('staff_of_homa')
    expect(seelieWeaponSlug('AThousandFloatingDreams')).toBe('a_thousand_floating_dreams')
    expect(seelieWeaponSlug('EngulfingLightning')).toBe('grasscutters_light')
    expect(seelieWeaponSlug('FreedomSworn')).toBe('freedom-sworn')
    for (const key of planner.characters.keys()) {
      expect(keys.character(seelieCharacterSlug(key)), key).toBe(key)
    }
    for (const key of planner.weapons.keys()) {
      expect(keys.weapon(seelieWeaponSlug(key)), key).toBe(key)
    }
  })

  it('write a slug every artifact set reads back as itself', () => {
    expect(seelieArtifactSlug('GladiatorsFinale')).toBe('gladiators_finale')
    expect(seelieArtifactSlug('EmblemOfSeveredFate')).toBe('seal_of_insulation')
    expect(artifactSetOfSlug('long_night', sets)).toBe('LongNightsOath')
    expect(artifactSetOfSlug('prayers', sets)).toBeNull()
    for (const key of sets) expect(artifactSetOfSlug(seelieArtifactSlug(key), sets), key).toBe(key)
  })

  it('pick one Seelie main stat per slot', () => {
    expect(seelieStat(['critRate_', 'critDMG_'])).toBe('crit_rate_dmg_p')
    expect(seelieStat(['eleMas', 'atk_'])).toBe('elemental_mastery')
    expect(seelieStat(['pyro_dmg_'])).toBe('pyro_dmg')
    expect(seelieStat([])).toBeNull()
    expect(seelieStat(undefined)).toBeNull()
  })
})
