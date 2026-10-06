import { characterTarget, type ArtifactGoal, type GoodArtifact } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import {
  artifactProgress,
  flipTick,
  hasArtifactGoal,
  tidyArtifactGoal,
  toggleStat,
  withSet,
  withSetTick,
  withSlotTick,
  withoutSet,
  wornBy,
  type ArtifactSlot,
} from '../artifact-goals'

const MAIN: Record<ArtifactSlot, string> = {
  flower: 'hp',
  plume: 'atk',
  sands: 'enerRech_',
  goblet: 'atk_',
  circlet: 'critRate_',
}

const piece = (
  slotKey: ArtifactSlot,
  setKey = 'EmblemOfSeveredFate',
  extra: Partial<GoodArtifact> = {},
): GoodArtifact => ({
  setKey,
  slotKey,
  level: 20,
  rarity: 5,
  mainStatKey: MAIN[slotKey],
  location: 'RaidenShogun',
  lock: true,
  substats: [],
  ...extra,
})

const full = (overrides: Partial<Record<ArtifactSlot, GoodArtifact>> = {}) =>
  new Map<ArtifactSlot, GoodArtifact>(
    (['flower', 'plume', 'sands', 'goblet', 'circlet'] as const).map((s) => [
      s,
      overrides[s] ?? piece(s),
    ]),
  )

const emblem: ArtifactGoal = {
  sets: [{ key: 'EmblemOfSeveredFate' }],
  sands: ['enerRech_'],
  goblet: ['atk_', 'electro_dmg_'],
  circlet: ['critRate_', 'critDMG_'],
}

const slot = (goal: ArtifactGoal, worn: Map<ArtifactSlot, GoodArtifact>, s: ArtifactSlot) =>
  artifactProgress(goal, worn).slots.find((x) => x.slot === s)!

describe('ticks from the capture', () => {
  it('ticks a slot with a top-level piece of a chosen set and main stat', () => {
    const p = artifactProgress(emblem, full())
    expect(p.slots.map((s) => [s.slot, s.done, s.auto, s.hand])).toEqual([
      ['flower', true, true, null],
      ['plume', true, true, null],
      ['sands', true, true, null],
      ['goblet', true, true, null],
      ['circlet', true, true, null],
    ])
    expect(p.done).toBe(5)
    expect(p.complete).toBe(true)
  })

  it('leaves a slot open below the top level, with another main stat, or nothing worn', () => {
    const worn = full({
      sands: piece('sands', 'EmblemOfSeveredFate', { level: 16 }),
      goblet: piece('goblet', 'EmblemOfSeveredFate', { mainStatKey: 'hp_' }),
    })
    worn.delete('circlet')
    const p = artifactProgress(emblem, worn)
    expect(p.slots.map((s) => [s.slot, s.done, s.miss])).toEqual([
      ['flower', true, null],
      ['plume', true, null],
      ['sands', false, 'level'],
      ['goblet', false, 'stat'],
      ['circlet', false, null],
    ])
    expect(p.done).toBe(2)
    expect(p.complete).toBe(false)
    expect(p.open).toEqual(['EmblemOfSeveredFate'])
  })

  it('counts a 4★ piece at its own top level (+16)', () => {
    const worn = full({ flower: piece('flower', 'EmblemOfSeveredFate', { rarity: 4, level: 16 }) })
    expect(slot(emblem, worn, 'flower').done).toBe(true)
  })

  it('frees the fifth slot once the other four are chosen sets', () => {
    const offPiece = full({ circlet: piece('circlet', 'GladiatorsFinale') })
    expect(slot(emblem, offPiece, 'circlet')).toMatchObject({ done: true, miss: null })
    // Only three of the others are chosen sets: the off-piece is the wrong set.
    const two = full({
      circlet: piece('circlet', 'GladiatorsFinale'),
      plume: piece('plume', 'GladiatorsFinale'),
    })
    expect(slot(emblem, two, 'circlet')).toMatchObject({ done: false, miss: 'set' })
    expect(slot(emblem, two, 'plume')).toMatchObject({ done: false, miss: 'set' })
  })

  it('takes 2 + 2 of two chosen sets plus an off-piece', () => {
    const goal: ArtifactGoal = { sets: [{ key: 'EmblemOfSeveredFate' }, { key: 'NoblesseOblige' }] }
    const worn = full({
      flower: piece('flower', 'NoblesseOblige'),
      plume: piece('plume', 'NoblesseOblige'),
      circlet: piece('circlet', 'GladiatorsFinale'),
    })
    expect(artifactProgress(goal, worn).complete).toBe(true)
  })

  it('takes any set and any main stat when none is chosen', () => {
    const goal: ArtifactGoal = { sets: [], sands: ['enerRech_'] }
    const worn = full({ flower: piece('flower', 'GladiatorsFinale') })
    expect(slot(goal, worn, 'flower').done).toBe(true)
    expect(slot(goal, worn, 'goblet').done).toBe(true)
  })

  it('finds what a character wears, the Traveler under "Traveler"', () => {
    const list = [
      piece('flower', 'A', { location: 'Traveler' }),
      piece('flower', 'B', { location: 'Traveler' }),
      piece('plume', 'C', { location: 'Bennett' }),
      piece('sands', 'D', { location: '' }),
    ]
    const traveler = wornBy(list, 'TravelerElectro')
    expect([...traveler].map(([s, p]) => [s, p.setKey])).toEqual([['flower', 'A']])
    expect([...wornBy(list, 'Bennett').keys()]).toEqual(['plume'])
    expect(wornBy(list, 'Xiangling').size).toBe(0)
  })
})

describe('ticks by hand', () => {
  it('win over the capture both ways', () => {
    const worn = full({ sands: piece('sands', 'EmblemOfSeveredFate', { level: 0 }) })
    const goal = withSlotTick(withSlotTick(emblem, 'sands', true), 'flower', false)
    const p = artifactProgress(goal, worn)
    expect(slot(goal, worn, 'sands')).toMatchObject({ done: true, auto: false, hand: true })
    expect(slot(goal, worn, 'flower')).toMatchObject({ done: false, auto: true, hand: false })
    expect(p.done).toBe(4)
  })

  it('flip to the opposite, or back to the capture when it agrees', () => {
    // Done from the capture: a tap says "not done" by hand.
    expect(flipTick(true, true)).toBe(false)
    // Not done by hand over a done capture: a tap goes back to the capture.
    expect(flipTick(false, true)).toBeUndefined()
    // Not done from the capture: a tap says "done" by hand; again, back.
    expect(flipTick(false, false)).toBe(true)
    expect(flipTick(true, false)).toBeUndefined()
  })

  it('finish a set; a finished build finishes every set', () => {
    const goal: ArtifactGoal = { sets: [{ key: 'EmblemOfSeveredFate' }, { key: 'NoblesseOblige' }] }
    const none = new Map<ArtifactSlot, GoodArtifact>()
    const ticked = withSetTick(goal, 'NoblesseOblige', true)
    const p = artifactProgress(ticked, none)
    expect(p.sets.map((s) => [s.key, s.done, s.hand])).toEqual([
      ['EmblemOfSeveredFate', false, null],
      ['NoblesseOblige', true, true],
    ])
    expect(p.open).toEqual(['EmblemOfSeveredFate'])
    const built = artifactProgress(goal, full())
    expect(built.sets.every((s) => s.done && s.auto)).toBe(true)
    expect(built.open).toEqual([])
    expect(built.sets[0]!.worn).toBe(5)
  })
})

describe('editing', () => {
  it('adds and removes sets and main stats', () => {
    let goal: ArtifactGoal = { sets: [] }
    goal = withSet(withSet(goal, 'EmblemOfSeveredFate'), 'EmblemOfSeveredFate')
    expect(goal.sets).toEqual([{ key: 'EmblemOfSeveredFate' }])
    goal = toggleStat(toggleStat(goal, 'sands', 'enerRech_'), 'sands', 'atk_')
    expect(goal.sands).toEqual(['enerRech_', 'atk_'])
    goal = toggleStat(goal, 'sands', 'enerRech_')
    expect(goal.sands).toEqual(['atk_'])
    expect(withoutSet(goal, 'EmblemOfSeveredFate').sets).toEqual([])
  })

  it('stores only what is set, nothing for an empty goal', () => {
    expect(tidyArtifactGoal({ sets: [], sands: [], slots: { flower: undefined } })).toBeUndefined()
    expect(
      tidyArtifactGoal({
        sets: [{ key: 'A', done: undefined }],
        sands: [],
        goblet: ['atk_'],
        slots: { flower: undefined, plume: false },
      }),
    ).toEqual({ sets: [{ key: 'A' }], goblet: ['atk_'], slots: { plume: false } })
    expect(hasArtifactGoal({ sets: [], slots: { circlet: true } })).toBe(true)
    expect(hasArtifactGoal(undefined)).toBe(false)
  })

  it('travels in a character goal (optional; stat keys checked)', () => {
    const base = { level: 90, ascension: 6, talents: { auto: 9, skill: 9, burst: 9 } }
    expect(characterTarget.parse(base).artifacts).toBeUndefined()
    const parsed = characterTarget.parse({
      ...base,
      artifacts: { ...emblem, slots: { sands: true } },
    })
    expect(parsed.artifacts).toEqual({ ...emblem, slots: { sands: true } })
    expect(
      characterTarget.safeParse({ ...base, artifacts: { sets: [], sands: ['atk%'] } }).success,
    ).toBe(false)
    expect(
      characterTarget.safeParse({ ...base, artifacts: { sets: [{ key: 'Not a key' }] } }).success,
    ).toBe(false)
  })
})
