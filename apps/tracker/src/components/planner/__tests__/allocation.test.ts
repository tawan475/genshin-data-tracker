import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { emptyRequirement, planTotals, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import { allocateNeeds, moveBy, moveTo, reprioritize } from '../allocation'
import { allocationOrder } from '../model'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)

const goal = (id: string, items: Record<string, number>, extra = {}): PlanGoal => ({
  id,
  requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)), ...extra },
})
const brief = (needs: ReturnType<typeof allocateNeeds>) =>
  Object.fromEntries(
    [...needs].map(([id, n]) => [
      id,
      [n.status, ...n.chips.map((c) => `${c.key}:${c.status}:${c.count}`)].join(' '),
    ]),
  )

describe('priority that allocates', () => {
  const a = goal('character:HuTao', { PhilosophiesOfDiligence: 3 })
  const b = goal('character:Xiangling', { PhilosophiesOfDiligence: 2, ShardOfAFoulLegacy: 1 })
  const bag = { PhilosophiesOfDiligence: 4, ShardOfAFoulLegacy: 1 }

  it('gives the bag to the goals above first', () => {
    const items = [a, b].map((g) => ({ id: g.id, goal: g, active: true }))
    expect(brief(allocateNeeds(planner, items, bag, {}))).toEqual({
      'character:HuTao': 'all',
      // 4 books: 3 go to Hu Tao above, so Xiangling is one short after her.
      'character:Xiangling': 'alone PhilosophiesOfDiligence:alone:1',
    })
    // The other way round, Xiangling is ready and Hu Tao waits.
    const swapped = [b, a].map((g) => ({ id: g.id, goal: g, active: true }))
    expect(brief(allocateNeeds(planner, swapped, bag, {}))).toEqual({
      'character:Xiangling': 'all',
      'character:HuTao': 'alone PhilosophiesOfDiligence:alone:1',
    })
  })

  it('leaves the totals alone: they are every goal together', () => {
    const together = planTotals(planner, [a, b], bag)
    expect(together.lines.get('PhilosophiesOfDiligence')!.missing).toBe(1)
    expect(planTotals(planner, [b, a], bag).lines.get('PhilosophiesOfDiligence')!.missing).toBe(1)
  })

  it('counts what a goal adds to the shortfall above it, crafting included', () => {
    // Three Guides craft one Philosophies: the bag holds 2 + 3 Guides = 3 for Hu Tao.
    const craft = { PhilosophiesOfDiligence: 2, GuideToDiligence: 3, ShardOfAFoulLegacy: 1 }
    const items = [a, b].map((g) => ({ id: g.id, goal: g, active: true }))
    expect(brief(allocateNeeds(planner, items, craft, {}))).toEqual({
      'character:HuTao': 'all',
      'character:Xiangling': 'alone PhilosophiesOfDiligence:alone:2',
    })
    // Short even alone: red, with what it lacks on its own.
    const none = { ShardOfAFoulLegacy: 1 }
    expect(brief(allocateNeeds(planner, items, none, {}))).toEqual({
      'character:HuTao': 'short PhilosophiesOfDiligence:short:3',
      'character:Xiangling': 'short PhilosophiesOfDiligence:short:2',
    })
  })

  it('costs a paused goal where it stands, taking nothing from the goals below', () => {
    const items = [
      { id: a.id, goal: a, active: false },
      { id: b.id, goal: b, active: true },
    ]
    expect(brief(allocateNeeds(planner, items, bag, {}))).toEqual({
      'character:HuTao': 'all',
      'character:Xiangling': 'all',
    })
    const below = [
      { id: b.id, goal: b, active: true },
      { id: a.id, goal: a, active: false },
    ]
    expect(brief(allocateNeeds(planner, below, bag, {}))['character:HuTao']).toBe(
      'alone PhilosophiesOfDiligence:alone:1',
    )
  })

  it('counts EXP and Mora after the goals above too, and skips cards with nothing left', () => {
    const one = goal('character:A', {}, { mora: 60_000, characterExp: 20_000 })
    const two = goal('character:B', {}, { mora: 60_000, characterExp: 20_000 })
    const items = [
      { id: 'done', goal: null, active: true },
      { id: one.id, goal: one, active: true },
      { id: two.id, goal: two, active: true },
    ]
    const needs = allocateNeeds(planner, items, { Mora: 100_000, HerosWit: 1 }, {})
    expect(needs.has('done')).toBe(false)
    expect(brief(needs)).toEqual({
      'character:A': 'all',
      // 20,000 EXP is one Hero's Wit; 40,000 Mora short after A.
      'character:B': 'alone Mora:alone:20000 HerosWit:alone:1',
    })
  })
})

describe('priority order', () => {
  it('orders cards by priority, unset last, then as listed', () => {
    const list = [
      { id: 'a', priority: null },
      { id: 'b', priority: 2 },
      { id: 'c', priority: null },
      { id: 'd', priority: 1 },
    ]
    expect(allocationOrder(list).map((e) => e.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('moves a card to where another one is, up or down, and by steps', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(moveTo(order, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveTo(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveTo(order, 'b', 'b')).toEqual(order)
    expect(moveTo(order, 'x', 'b')).toEqual(order)
    expect(moveBy(order, 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveBy(order, 'b', -5)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveBy(order, 'd', 1)).toEqual(order)
  })

  it('stores an order as priorities 1, 2, 3…, writing only what changes', () => {
    const current = new Map<string, number | null>([
      ['a', 1],
      ['b', null],
      ['c', 3],
    ])
    expect(reprioritize(['a', 'c', 'b'], current)).toEqual(
      new Map([
        ['c', 2],
        ['b', 3],
      ]),
    )
    expect(
      reprioritize(
        ['a', 'b', 'c'],
        new Map([
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ]),
      ),
    ).toEqual(new Map())
  })
})
