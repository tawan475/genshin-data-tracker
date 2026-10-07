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

// a: in stock, can level, needs a weekly boss; b: can level a step, no weekly;
// c: short, no weekly; d: paused (no upgrade), weekly; e: anemo, can level, no weekly.
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
  weekly: new Set(['a', 'd']),
}
const ids = (list: GoalEntry[]) => list.map((e) => e.id)
const filters = (f: Partial<GoalFilters>): GoalFilters => ({ ...NO_GOAL_FILTERS, ...f })

describe('the Upgrade now and No weekly toggles', () => {
  it('keep the goals that can level now, those needing no weekly boss, or both', () => {
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
