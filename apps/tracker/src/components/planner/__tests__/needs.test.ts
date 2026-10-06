import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { emptyRequirement, planTotals, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import { goalNeeds } from '../needs'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)

const goal = (id: string, items: Record<string, number>, extra = {}): PlanGoal => ({
  id,
  requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)), ...extra },
})

describe('what a goal still needs', () => {
  const mine = goal('character:HuTao', { PhilosophiesOfDiligence: 2, ShardOfAFoulLegacy: 1 })
  const theirs = goal('character:Xiangling', { PhilosophiesOfDiligence: 2 })
  const both = [mine, theirs]

  it('is ready when the bag covers every counted goal', () => {
    const bag = { PhilosophiesOfDiligence: 4, ShardOfAFoulLegacy: 1 }
    const all = planTotals(planner, both, bag)
    expect(goalNeeds(planner, mine, bag, {}, all)).toEqual({ status: 'all', chips: [] })
  })

  it('is yellow when it covers this goal alone, with what all goals are short of', () => {
    const bag = { PhilosophiesOfDiligence: 3, ShardOfAFoulLegacy: 1 }
    const needs = goalNeeds(planner, mine, bag, {}, planTotals(planner, both, bag))
    expect(needs.status).toBe('alone')
    expect(needs.chips.map(({ key, count, status }) => ({ key, count, status }))).toEqual([
      { key: 'PhilosophiesOfDiligence', count: 1, status: 'alone' },
    ])
  })

  it('is red when not even this goal is covered, crafting counted', () => {
    // Three Guides craft one Philosophies: 1 short, not 2.
    const bag = { PhilosophiesOfDiligence: 0, GuideToDiligence: 3 }
    const needs = goalNeeds(planner, mine, bag, {}, planTotals(planner, both, bag))
    expect(needs.status).toBe('short')
    expect(needs.chips.map(({ key, count, status }) => ({ key, count, status }))).toEqual([
      { key: 'PhilosophiesOfDiligence', count: 1, status: 'short' },
      { key: 'ShardOfAFoulLegacy', count: 1, status: 'short' },
    ])
  })

  it('counts EXP as the largest item and Mora as Mora', () => {
    const exp = goal('character:HuTao', {}, { characterExp: 50_000, mora: 10_000 })
    const needs = goalNeeds(planner, exp, { HerosWit: 1, Mora: 10_000 }, {}, { others: [] })
    expect(needs.status).toBe('short')
    expect(needs.chips.map(({ key, count, exp }) => ({ key, count, exp }))).toEqual([
      { key: 'HerosWit', count: 2, exp: 'character' },
    ])
  })

  it('costs a goal that is not counted together with the counted ones', () => {
    const bag = { PhilosophiesOfDiligence: 3, ShardOfAFoulLegacy: 1 }
    const paused = { ...mine, active: false }
    expect(goalNeeds(planner, paused, bag, {}, { others: [theirs] }).status).toBe('alone')
  })
})
