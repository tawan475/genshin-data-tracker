import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESET, PRESETS, applyPreset, presetById } from '../presets'
import { defaultCharacterTarget } from '../model'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const phases = planner.characters.get('Bennett')!.ascension
const preset = (id: string) => presetById(id)!

const now = { level: 70, ascension: 4, talents: { auto: 6, skill: 9, burst: 8 } }

describe('goal presets', () => {
  it('sets level and talents, never below now', () => {
    expect(applyPreset(preset('max'), now, {}, phases)).toEqual({
      level: 90,
      ascension: 6,
      talents: { auto: 10, skill: 10, burst: 10 },
      active: true,
    })
    expect(applyPreset(preset('80-8'), now, {}, phases)).toEqual({
      level: 80,
      ascension: 5,
      talents: { auto: 8, skill: 9, burst: 8 },
      active: true,
    })
    const high = { level: 90, ascension: 6, talents: { auto: 10, skill: 10, burst: 10 } }
    expect(applyPreset(preset('80-8'), high, {}, phases)).toMatchObject({
      level: 90,
      ascension: 6,
      talents: { auto: 10, skill: 10, burst: 10 },
    })
  })

  it('leaves the other part at now for "Talents only" and "Level only"', () => {
    expect(applyPreset(preset('talents'), now, {}, phases)).toMatchObject({
      level: 70,
      ascension: 4,
      talents: { auto: 9, skill: 9, burst: 9 },
    })
    expect(applyPreset(preset('level'), now, {}, phases)).toMatchObject({
      level: 90,
      ascension: 6,
      talents: now.talents,
    })
  })

  it("keeps the goal's own fields and its paused state", () => {
    const base = { note: 'C2 first', favorite: true, priority: 3, active: false }
    expect(applyPreset(preset('max'), now, base, phases)).toMatchObject(base)
  })

  it('starts new goals where the old default did', () => {
    const fresh = { level: 1, ascension: 0, talents: { auto: 1, skill: 1, burst: 1 } }
    expect(applyPreset(preset(DEFAULT_PRESET), fresh, {}, phases)).toEqual(
      defaultCharacterTarget(fresh),
    )
    expect(applyPreset(preset(DEFAULT_PRESET), now, {}, phases)).toEqual(
      defaultCharacterTarget(now),
    )
  })

  it('has the five presets, ids unique', () => {
    expect(PRESETS.map((p) => p.label)).toEqual([
      'Max',
      '90/9/9/9',
      '80/8/8/8',
      'Talents only',
      'Level only',
    ])
    expect(presetById('nope')).toBeNull()
  })
})
