import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { emptyRequirement, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import { costCells, stockCounts } from '../cost-cells'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)

const requirement = (items: Record<string, number>, extra = {}) => ({
  ...emptyRequirement(),
  items: new Map(Object.entries(items)),
  ...extra,
})

describe('the cost legend', () => {
  it('counts the tiles of each colour', () => {
    const others: PlanGoal[] = [{ id: 'other', requirement: requirement({ Valberry: 5 }) }]
    const cells = costCells({
      planner,
      // Wolfhook: plenty; Valberry: enough alone, not with the other goal; Cecilia: short.
      requirements: [requirement({ Wolfhook: 5, Valberry: 5, Cecilia: 5 }, { mora: 1000 })],
      others,
      inventory: { Wolfhook: 100, Valberry: 7, Cecilia: 2, Mora: 0 },
      options: {},
    })
    expect(cells.map((c) => [c.key, c.status])).toEqual([
      ['Cecilia', 'short'],
      ['Valberry', 'alone'],
      ['Wolfhook', 'all'],
      ['Mora', 'short'],
    ])
    expect(stockCounts(cells)).toEqual({ all: 1, alone: 1, short: 2 })
  })

  it('is all zeros for nothing to spend', () => {
    expect(stockCounts([])).toEqual({ all: 0, alone: 0, short: 0 })
    const cells = costCells({
      planner,
      requirements: [requirement({})],
      others: [],
      inventory: {},
      options: {},
    })
    expect(cells).toEqual([])
  })
})
