import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { describe, expect, it } from 'vitest'
import { expNeed } from '@/lib/exp-need'

const need = expNeed(decodePlanner(plannerJson as unknown as PlannerFile))

describe('EXP to the next level', () => {
  it("reads the game's tables, and is null at every cap", () => {
    expect(need.character(1, 0)).toBe(1000)
    expect(need.character(80, 5)).toBeNull() // 80/80: ascend first
    expect(need.character(80, 6)).toBeGreaterThan(0)
    expect(need.character(90, 6)).toBeNull()
    expect(need.weapon(5, 1, 0)).toBe(600)
    expect(need.weapon(5, 90, 6)).toBeNull()
    expect(need.artifact(5, 0)).toBe(3000)
    expect(need.artifact(5, 20)).toBeNull()
    expect(need.artifact(4, 16)).toBeNull()
    expect(need.friendship(1)).toBe(1000)
    expect(need.friendship(10)).toBeNull()
  })
})
