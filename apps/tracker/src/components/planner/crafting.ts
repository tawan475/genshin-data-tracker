/**
 * The Crafting card's checklist, pure: the steps the totals assume
 * (`craftingSteps`: conversions, crafts from the lowest tier up, forging)
 * as rows to follow in game (what goes in, what comes out, what it costs),
 * grouped where the game does them: Convert (Dream Solvent, Dust of Azoth),
 * Craft (one material family after another, its lowest tier first) and
 * Forge (the Blacksmith). Every step can be done in that order with what
 * is held.
 *
 * A step marked done changes the bag as the game does (`stepChanges`): its
 * input, Mora and conversion currency out, its product in. Done on a goal
 * part (done.ts) then takes the product itself instead of crafting it again.
 */

import type { PlannerData } from '@gdt/game-data'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import type { InventoryChange } from '@gdt/shared'
import { formatNumber } from '@/lib/format'

type Bag = Readonly<Record<string, number>>

export type CraftKind = PlanStep['kind']

export interface CraftItem {
  /** GOOD key. */
  key: string
  count: number
}

export interface CraftRow {
  /** Stable while it is the same recipe: kind, input and product. */
  id: string
  kind: CraftKind
  input: CraftItem
  output: CraftItem
  /** Mora, Dream Solvent or Dust of Azoth it spends (none at 0). */
  costs: CraftItem[]
  /** Forging time in seconds (0 for the rest). */
  seconds: number
}

export interface CraftGroup {
  kind: CraftKind
  rows: CraftRow[]
}

/** Where the game does them, in the order the plan needs them. */
export const CRAFT_KINDS: readonly CraftKind[] = ['convert', 'craft', 'forge']

export const CRAFT_LABEL: Record<CraftKind, string> = {
  convert: 'Convert',
  craft: 'Craft',
  forge: 'Forge',
}

/** One step as a row (the planner's Mora key for its Mora). */
export function craftRow(planner: PlannerData, step: PlanStep): CraftRow {
  const mora = planner.mora.key
  const costs = (list: CraftItem[]) => list.filter((c) => c.count > 0)
  if (step.kind === 'convert') {
    return {
      id: `convert:${step.from.key}:${step.to.key}`,
      kind: 'convert',
      input: { key: step.from.key, count: step.count },
      output: { key: step.to.key, count: step.count },
      costs: costs([{ key: step.via, count: step.cost }]),
      seconds: 0,
    }
  }
  if (step.kind === 'forge') {
    return {
      id: `forge:${step.input}:${step.to.key}`,
      kind: 'forge',
      input: { key: step.input, count: step.uses },
      output: { key: step.to.key, count: step.count },
      costs: costs([{ key: mora, count: step.mora }]),
      seconds: step.seconds,
    }
  }
  return {
    id: `craft:${step.from.key}:${step.to.key}`,
    kind: 'craft',
    input: { key: step.from.key, count: step.uses },
    output: { key: step.to.key, count: step.count },
    costs: costs([{ key: mora, count: step.mora }]),
    seconds: 0,
  }
}

/**
 * The steps grouped by kind (convert, craft, forge). Crafts go one family
 * after another (in the game's item order), each from its lowest tier up,
 * so a craft that uses what the one before it made comes after it.
 */
export function craftGroups(planner: PlannerData, steps: readonly PlanStep[]): CraftGroup[] {
  const familyOrder = (step: PlanStep) =>
    step.kind === 'craft' ? (step.to.family?.members[0]?.id ?? step.to.id) : 0
  const tier = (step: PlanStep) => (step.kind === 'craft' ? step.to.tier : 0)
  const groups: CraftGroup[] = []
  for (const kind of CRAFT_KINDS) {
    const list = steps
      .map((step, at) => ({ step, at }))
      .filter((s) => s.step.kind === kind)
      .sort(
        (a, b) =>
          familyOrder(a.step) - familyOrder(b.step) || tier(a.step) - tier(b.step) || a.at - b.at,
      )
    if (list.length) groups.push({ kind, rows: list.map((s) => craftRow(planner, s.step)) })
  }
  return groups
}

/** Mora, conversion currency and forging time of the steps, summed (by key, in first-use order). */
export function craftTotals(rows: readonly CraftRow[]): { costs: CraftItem[]; seconds: number } {
  const costs = new Map<string, number>()
  let seconds = 0
  for (const row of rows) {
    for (const c of row.costs) costs.set(c.key, (costs.get(c.key) ?? 0) + c.count)
    seconds += row.seconds
  }
  return { costs: [...costs].map(([key, count]) => ({ key, count })), seconds }
}

/**
 * The bag changes that record rows as done (`undo`: that put them back):
 * inputs and costs out, products in, summed per material (in first-use
 * order; a material that comes out even is left out).
 */
export function craftChanges(rows: readonly CraftRow[], undo = false): InventoryChange[] {
  const net = new Map<string, number>()
  const add = (key: string, n: number) => net.set(key, (net.get(key) ?? 0) + n)
  for (const row of rows) {
    add(row.input.key, -row.input.count)
    for (const c of row.costs) add(c.key, -c.count)
    add(row.output.key, row.output.count)
  }
  return [...net].flatMap(([key, n]) => (n === 0 ? [] : [{ key, add: undo ? -n : n }]))
}

/**
 * What the bag lacks for `changes` (empty: they fit). A craft that uses
 * what an earlier row makes lacks it until that row is done; marking every
 * row at once never does, unless Mora is short.
 */
export function changesShort(changes: readonly InventoryChange[], bag: Bag): CraftItem[] {
  return changes.flatMap(({ key, add = 0 }) => {
    const have = Math.max(0, Math.trunc(bag[key] ?? 0))
    return add < 0 && have < -add ? [{ key, count: -add - have }] : []
  })
}

/**
 * "Craft 10 Guide to Freedom from 30 Teachings of Freedom", with its costs
 * ("· 1,750 Mora") and forging time when `extra` gives them as text.
 */
export function rowText(
  row: CraftRow,
  name: (key: string) => string,
  extra: string[] = [],
): string {
  const n = (c: CraftItem) => `${formatNumber(c.count)} ${name(c.key)}`
  const head =
    row.kind === 'convert'
      ? `Convert ${n(row.input)} into ${name(row.output.key)}`
      : `${CRAFT_LABEL[row.kind]} ${n(row.output)} from ${n(row.input)}`
  return [head, ...extra].join(' · ')
}
