/**
 * Dream Solvent swaps by hand, pure: the game's Alchemy conversion turns
 * one weekly boss material into another of the same boss for Dream Solvent
 * (`WeeklyBoss.solvent` each). The totals already assume the swaps the plan
 * needs (the Crafting card's Convert rows); this is the swap the player
 * chooses: from which of the boss's other materials, how many. It is
 * recorded as a Convert row (crafting.ts), so it changes the bag, toasts and
 * undoes like a Crafting step.
 */

import type { PlannerData, PlannerMaterial, WeeklyBoss } from '@gdt/game-data'
import type { CraftRow } from './crafting'

type Bag = Readonly<Record<string, number>>
type Planner = Pick<PlannerData, 'weeklyBossOf' | 'items'>

export interface SwapSource {
  material: PlannerMaterial
  /** Held. */
  have: number
  /** Most it can give now (held, and the solvent held). */
  max: number
}

export interface SolventSwap {
  boss: WeeklyBoss
  /** The material made. */
  target: PlannerMaterial
  /** GOOD key of Dream Solvent; held; per conversion. */
  solvent: { key: string; have: number; each: number }
  /** The boss's other materials, in its order. */
  sources: SwapSource[]
}

const held = (bag: Bag, key: string) => Math.max(0, Math.trunc(bag[key] ?? 0))

/** What can be swapped into `key` (null when Dream Solvent doesn't make it). */
export function solventSwap(planner: Planner, key: string, bag: Bag): SolventSwap | null {
  const boss = planner.weeklyBossOf.get(key)
  const solventKey = planner.items.dreamSolvent
  if (!boss || !solventKey || boss.solvent <= 0) return null
  const target = boss.items.find((m) => m.key === key)
  if (!target) return null
  const solvent = { key: solventKey, have: held(bag, solventKey), each: boss.solvent }
  const affordable = Math.floor(solvent.have / boss.solvent)
  return {
    boss,
    target,
    solvent,
    sources: boss.items
      .filter((m) => m.key !== key)
      .map((material) => {
        const have = held(bag, material.key)
        return { material, have, max: Math.min(have, affordable) }
      }),
  }
}

/** The count a swap opens on: what is missing of the target, within what can be given. */
export function swapStart(source: SwapSource, missing: number): number {
  if (source.max <= 0) return 0
  return Math.max(1, Math.min(source.max, Math.trunc(missing)))
}

/** `count` swaps from `source` as a Convert row. */
export function swapRow(swap: SolventSwap, source: string, count: number): CraftRow {
  return {
    id: `convert:${source}:${swap.target.key}`,
    kind: 'convert',
    input: { key: source, count },
    output: { key: swap.target.key, count },
    costs: [{ key: swap.solvent.key, count: count * swap.solvent.each }],
    seconds: 0,
  }
}
