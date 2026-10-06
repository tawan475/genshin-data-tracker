import type { InventoryAdjustment } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import {
  adjustmentApplies,
  applyChanges,
  characterNow,
  countChange,
  effectiveInventory,
  mergeChange,
  replacedAdjustments,
  weaponNow,
} from '../hand-edits'

const edit = (
  key: string,
  set: number | null,
  delta: number,
  base: number,
): InventoryAdjustment => ({ key, set, delta, base, updatedAt: 1 })

describe('material counts on top of the newest capture', () => {
  const capture = { Mora: 100, HerosWit: 5, Primogem: 7 }
  const edits = [
    edit('Mora', null, -30, 10),
    edit('HerosWit', 40, -5, 10),
    edit('GuideToFreedom', 3, 0, 10),
    edit('Primogem', null, 5, 5), // made against an older capture
  ]

  it('applies the edits made against this capture (or a later one) and no older ones', () => {
    expect(effectiveInventory(capture, edits, 10)).toEqual({
      Mora: 70,
      HerosWit: 35,
      Primogem: 7,
      GuideToFreedom: 3,
    })
    // A capture deleted since: edits made against it still count on the older one.
    expect(effectiveInventory(capture, edits, 8)).toMatchObject({ Mora: 70, Primogem: 7 })
    // A newer capture replaces them all: irminsul is the truth.
    expect(effectiveInventory(capture, edits, 11)).toEqual(capture)
    expect(replacedAdjustments(edits, 10).map((e) => e.key)).toEqual(['Primogem'])
    expect(replacedAdjustments(edits, 11)).toHaveLength(4)
    expect(adjustmentApplies({ base: 10 }, 10)).toBe(true)
  })

  it('works with no capture at all: the bag is what was entered', () => {
    expect(
      effectiveInventory({}, [edit('Mora', 500, 0, 0), edit('HerosWit', null, 3, 0)], 0),
    ).toEqual({ Mora: 500, HerosWit: 3 })
  })

  it('never goes below zero', () => {
    expect(effectiveInventory({ Mora: 10 }, [edit('Mora', null, -50, 1)], 1)).toEqual({ Mora: 0 })
  })

  it('merges quick changes to one material into one', () => {
    expect(mergeChange(undefined, { key: 'Mora', add: 5 })).toEqual({ key: 'Mora', add: 5 })
    expect(mergeChange({ key: 'Mora', add: 5 }, { key: 'Mora', add: -2 })).toEqual({
      key: 'Mora',
      add: 3,
    })
    expect(mergeChange({ key: 'Mora', set: 10 }, { key: 'Mora', add: -2 })).toEqual({
      key: 'Mora',
      set: 10,
      add: -2,
    })
    expect(mergeChange({ key: 'Mora', add: 5 }, { key: 'Mora', set: null })).toEqual({
      key: 'Mora',
      set: null,
    })
  })

  it('shows changes the way the server stores them', () => {
    const first = applyChanges(
      [],
      [
        { key: 'HerosWit', set: 40 },
        { key: 'Mora', add: 50_000 },
        { key: 'GuideToFreedom', set: 3, add: 2 },
      ],
      0,
      9,
    )
    expect(first.map(({ key, delta, set }) => ({ key, delta, set }))).toEqual([
      { key: 'GuideToFreedom', delta: 2, set: 3 },
      { key: 'HerosWit', delta: 0, set: 40 },
      { key: 'Mora', delta: 50_000, set: null },
    ])
    const second = applyChanges(
      first,
      [
        { key: 'HerosWit', add: -15 },
        { key: 'Mora', add: -50_000 },
        { key: 'GuideToFreedom', set: null },
      ],
      0,
      10,
    )
    expect(second).toEqual([{ key: 'HerosWit', delta: -15, set: 40, base: 0, updatedAt: 10 }])
    // Against a newer capture, the old edits are gone and an add starts over.
    expect(applyChanges(second, [{ key: 'HerosWit', add: 1 }], 5, 11)).toEqual([
      { key: 'HerosWit', delta: 1, set: null, base: 5, updatedAt: 11 },
    ])
  })

  it('turns a typed count into an edit, or none when it is the capture’s', () => {
    expect(countChange('Mora', 120, 100)).toEqual({ key: 'Mora', set: 120 })
    expect(countChange('Mora', 100, 100)).toEqual({ key: 'Mora', set: null })
    expect(countChange('Mora', -3, 0)).toEqual({ key: 'Mora', set: null })
  })
})

describe('current state set by hand', () => {
  const capture = { level: 70, ascension: 4, talents: { auto: 6, skill: 8, burst: 8 } }

  it('counts where it is ahead of the capture, field by field', () => {
    expect(characterNow(capture, null)).toEqual({ state: capture, edited: false })
    const ahead = { level: 80, ascension: 5, talents: { auto: 6, skill: 9, burst: 7 } }
    expect(characterNow(capture, ahead)).toEqual({
      state: { level: 80, ascension: 5, talents: { auto: 6, skill: 9, burst: 8 } },
      edited: true,
    })
    // Ascended at the same cap is ahead.
    expect(
      characterNow({ ...capture, level: 70 }, { ...capture, ascension: 5 }).state,
    ).toMatchObject({ level: 70, ascension: 5 })
  })

  it('retires once a capture reaches it', () => {
    const set = { level: 80, ascension: 5, talents: { auto: 6, skill: 9, burst: 8 } }
    const later = { level: 80, ascension: 5, talents: { auto: 6, skill: 9, burst: 9 } }
    expect(characterNow(later, set)).toEqual({ state: later, edited: false })
  })

  it('does the same for weapons, refinement included', () => {
    const now = { level: 50, ascension: 2, refinement: 1 }
    expect(weaponNow(now, { level: 90, ascension: 6, refinement: 1 })).toEqual({
      state: { level: 90, ascension: 6, refinement: 1 },
      edited: true,
    })
    expect(weaponNow(now, { level: 40, ascension: 1, refinement: 3 })).toEqual({
      state: { level: 50, ascension: 2, refinement: 3 },
      edited: true,
    })
    expect(
      weaponNow({ level: 90, ascension: 6, refinement: 2 }, { ...now, refinement: 2 }),
    ).toEqual({ state: { level: 90, ascension: 6, refinement: 2 }, edited: false })
  })
})
