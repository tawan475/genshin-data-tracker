import { describe, expect, it } from 'vitest'
import {
  NO_GOAL_FILTERS,
  filterGoals,
  filterItems,
  goalFacetCounts,
  goalToggleCount,
  goalTogglesValue,
  parseGoalToggles,
  type GoalFacts,
  type GoalFilters,
} from '../goal-list'
import type { GoalEntry, ItemGoalView } from '../model'

const entry = (id: string, extra: Partial<GoalEntry> = {}): GoalEntry =>
  ({
    id,
    character: null,
    weapons: [],
    owner: '',
    name: id,
    active: true,
    done: false,
    materialsDone: false,
    artifacts: null,
    note: '',
    favorite: false,
    priority: null,
    element: 'pyro',
    weaponType: 'polearm',
    rarity: 5,
    ar: 0,
    ...extra,
  }) as GoalEntry

// a: in stock, can level; b: can level a step, still to farm without a weekly boss;
// c: short, no weekly boss to farm; d: paused; e: anemo, can level, no weekly boss.
const entries = [
  entry('a'),
  entry('b'),
  entry('c'),
  entry('d', { active: false }),
  entry('e', { element: 'anemo', rarity: 4 }),
]
const facts: GoalFacts = {
  ready: new Set(['a']),
  upgrade: new Set(['a', 'b', 'e']),
  noWeekly: new Set(['b', 'c', 'e']),
}
const ids = (list: GoalEntry[]) => list.map((e) => e.id)
const filters = (f: Partial<GoalFilters>): GoalFilters => ({ ...NO_GOAL_FILTERS, ...f })

describe('the Upgrade now and No weekly boss toggles', () => {
  it('keep the goals that can level now, those to farm without a weekly boss, or both', () => {
    expect(ids(filterGoals(entries, filters({ upgrade: true }), facts))).toEqual(['a', 'b', 'e'])
    expect(ids(filterGoals(entries, filters({ noWeekly: true }), facts))).toEqual(['b', 'c', 'e'])
    expect(ids(filterGoals(entries, filters({ upgrade: true, noWeekly: true }), facts))).toEqual([
      'b',
      'e',
    ])
  })

  it('combine with the other filters', () => {
    const f = filters({ upgrade: true, element: 'pyro', status: 'ready' })
    expect(ids(filterGoals(entries, f, facts))).toEqual(['a'])
  })

  it('count what turning one on would leave, with the rest applied', () => {
    const off = filters({ element: 'pyro' })
    expect(goalToggleCount(entries, off, facts, 'upgrade')).toBe(2)
    expect(goalToggleCount(entries, off, facts, 'noWeekly')).toBe(2)
    // On, it counts the list as it is.
    const on = filters({ element: 'pyro', upgrade: true })
    expect(goalToggleCount(entries, on, facts, 'upgrade')).toBe(2)
    expect(goalToggleCount(entries, on, facts, 'noWeekly')).toBe(1)
    // And the other chips count with the toggle applied.
    const elements = goalFacetCounts(entries, on, facts, 'element', (e) => e.element)
    expect(Object.fromEntries(elements)).toEqual({ pyro: 2, anemo: 1 })
  })

  it('hide the extra item needs', () => {
    const items = [{ id: 'item:Mora', name: 'Mora', target: { active: true } }] as ItemGoalView[]
    expect(filterItems(items, filters({}), () => true)).toHaveLength(1)
    expect(filterItems(items, filters({ upgrade: true }), () => true)).toHaveLength(0)
    expect(filterItems(items, filters({ noWeekly: true }), () => true)).toHaveLength(0)
  })

  it('are stored as words and read back (anything else ignored)', () => {
    expect(goalTogglesValue(NO_GOAL_FILTERS)).toBeNull()
    expect(goalTogglesValue(filters({ upgrade: true }))).toBe('upgrade')
    expect(goalTogglesValue(filters({ upgrade: true, noWeekly: true }))).toBe('upgrade,noWeekly')
    expect(parseGoalToggles('noWeekly,upgrade')).toEqual({ upgrade: true, noWeekly: true })
    expect(parseGoalToggles('nonsense')).toEqual({ upgrade: false, noWeekly: false })
    expect(parseGoalToggles(null)).toEqual({ upgrade: false, noWeekly: false })
  })
})

describe('the material filter', () => {
  // a and b use Agnidus Agate, b and e Hero's Wit; d (paused) has none: only counted goals do.
  const withMaterials: GoalFacts = {
    ...facts,
    materials: new Map([
      ['a', new Set(['AgnidusAgateSliver'])],
      ['b', new Set(['AgnidusAgateSliver', 'HerosWit'])],
      ['e', new Set(['HerosWit'])],
    ]),
  }

  it('keeps the goals using the material', () => {
    const f = filters({ material: 'AgnidusAgateSliver' })
    expect(ids(filterGoals(entries, f, withMaterials))).toEqual(['a', 'b'])
    expect(ids(filterGoals(entries, filters({ material: 'HerosWit' }), withMaterials))).toEqual([
      'b',
      'e',
    ])
    // Without what the page knows, nothing matches.
    expect(filterGoals(entries, f, facts)).toEqual([])
  })

  it('combines with the other filters, and counts with them', () => {
    const f = filters({ material: 'HerosWit', element: 'pyro' })
    expect(ids(filterGoals(entries, f, withMaterials))).toEqual(['b'])
    const counts = goalFacetCounts(entries, f, withMaterials, 'material', (e) => [
      ...(withMaterials.materials!.get(e.id) ?? []),
    ])
    // Pyro goals only: a and b use Agnidus, b Hero's Wit.
    expect(Object.fromEntries(counts)).toEqual({ AgnidusAgateSliver: 2, HerosWit: 1 })
    const elements = goalFacetCounts(entries, f, withMaterials, 'element', (e) => e.element)
    expect(Object.fromEntries(elements)).toEqual({ pyro: 1, anemo: 1 })
    expect(goalToggleCount(entries, f, withMaterials, 'noWeekly')).toBe(1)
  })

  it('hides the extra item needs', () => {
    const items = [
      { id: 'item:HerosWit', name: 'Hero', target: { active: true } },
    ] as ItemGoalView[]
    expect(filterItems(items, filters({ material: 'HerosWit' }), () => true)).toHaveLength(0)
  })
})
