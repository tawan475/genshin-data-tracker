import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { describe, expect, it } from 'vitest'
import { craftChanges } from '../crafting'
import { solventSwap, swapRow, swapStart } from '../solvent-swap'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const boss = planner.weeklyBosses.find((b) => b.solvent > 0 && b.items.length === 3)!
const [a, b, c] = boss.items.map((m) => m.key) as [string, string, string]
const solvent = planner.items.dreamSolvent

describe('Dream Solvent swaps', () => {
  it('offers the boss’s other materials, as far as held and the solvent go', () => {
    const swap = solventSwap(planner, a, { [b]: 5, [c]: 1, [solvent]: 3 * boss.solvent })!
    expect(swap.boss).toBe(boss)
    expect(swap.target.key).toBe(a)
    expect(swap.solvent).toEqual({ key: solvent, have: 3 * boss.solvent, each: boss.solvent })
    expect(swap.sources.map((s) => [s.material.key, s.have, s.max])).toEqual([
      [b, 5, 3],
      [c, 1, 1],
    ])
    const none = solventSwap(planner, a, { [b]: 5 })!
    expect(none.sources.map((s) => s.max)).toEqual([0, 0])
  })

  it('is not offered for what Dream Solvent does not make', () => {
    expect(solventSwap(planner, 'HerosWit', {})).toBeNull()
    expect(solventSwap(planner, solvent, {})).toBeNull()
  })

  it('starts at what is missing, within what can be given', () => {
    const source = { material: boss.items[1]!, have: 5, max: 3 }
    expect(swapStart(source, 2)).toBe(2)
    expect(swapStart(source, 9)).toBe(3)
    expect(swapStart(source, 0)).toBe(1)
    expect(swapStart({ ...source, max: 0 }, 2)).toBe(0)
  })

  it('records a swap as a Convert row: source and solvent out, target in', () => {
    const swap = solventSwap(planner, a, { [b]: 5, [solvent]: 9 })!
    const row = swapRow(swap, b, 2)
    expect(row).toEqual({
      id: `convert:${b}:${a}`,
      kind: 'convert',
      input: { key: b, count: 2 },
      output: { key: a, count: 2 },
      costs: [{ key: solvent, count: 2 * boss.solvent }],
      seconds: 0,
    })
    expect(craftChanges([row])).toEqual([
      { key: b, add: -2 },
      { key: solvent, add: -2 * boss.solvent },
      { key: a, add: 2 },
    ])
  })
})
