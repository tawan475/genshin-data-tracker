import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { craftingSteps } from '@gdt/game-data/planner-convert'
import { emptyRequirement, planTotals, type Requirement } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import {
  changesShort,
  craftChanges,
  craftGroups,
  craftRow,
  craftTotals,
  rowText,
} from '../crafting'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const options = { forge: true }

const requirement = (items: Record<string, number>, extra: Partial<Requirement> = {}) => ({
  ...emptyRequirement(),
  items: new Map(Object.entries(items)),
  ...extra,
})
const stepsFor = (r: Requirement, bag: Record<string, number>) =>
  craftingSteps(planner, planTotals(planner, [{ id: 'g', requirement: r }], bag, options))
const apply = (bag: Record<string, number>, changes: { key: string; add?: number }[]) => {
  const next = { ...bag }
  for (const c of changes) next[c.key] = (next[c.key] ?? 0) + (c.add ?? 0)
  return next
}

// Dvalin's Plume from Claws (Dream Solvent), Philosophies from Teachings (two tiers),
// a Gemstone from Slivers (three tiers), Mystic ore forged from Crystal Chunks.
const boss = planner.weeklyBossOf.get('DvalinsPlume')!
const need = requirement(
  { DvalinsPlume: 2, PhilosophiesOfDiligence: 1, AgnidusAgateGemstone: 1 },
  { weaponExp: 40_000 },
)
const bag: Record<string, number> = {
  DvalinsClaw: 3,
  [planner.items.dreamSolvent]: 5,
  TeachingsOfDiligence: 9,
  AgnidusAgateSliver: 27,
  CrystalChunk: 16,
  Mora: 10_000_000,
}
const steps = stepsFor(need, bag)
const groups = craftGroups(planner, steps)
const rows = groups.flatMap((g) => g.rows)

describe('the crafting checklist', () => {
  it('groups conversions, then crafts family by family from the lowest tier, then forging', () => {
    expect(groups.map((g) => g.kind)).toEqual(['convert', 'craft', 'forge'])
    const crafts = groups[1]!.rows.map((r) => `${r.input.key}>${r.output.key}`)
    // One family after the other (whatever their order), each from its lowest tier up.
    const gem = [
      'AgnidusAgateSliver>AgnidusAgateFragment',
      'AgnidusAgateFragment>AgnidusAgateChunk',
      'AgnidusAgateChunk>AgnidusAgateGemstone',
    ]
    const book = [
      'TeachingsOfDiligence>GuideToDiligence',
      'GuideToDiligence>PhilosophiesOfDiligence',
    ]
    expect([...crafts].sort()).toEqual([...gem, ...book].sort())
    const at = (s: string) => crafts.indexOf(s)
    expect(at(gem[0]!)).toBeLessThan(at(gem[1]!))
    expect(at(gem[1]!)).toBeLessThan(at(gem[2]!))
    expect(at(book[0]!)).toBeLessThan(at(book[1]!))
    const gemRows = crafts.filter((c) => gem.includes(c))
    expect(crafts.indexOf(gemRows.at(-1)!) - crafts.indexOf(gemRows[0]!)).toBe(2)
  })

  it('reads each step as input, product and costs', () => {
    const convert = rows.find((r) => r.kind === 'convert')!
    expect(convert.input).toEqual({ key: 'DvalinsClaw', count: 2 })
    expect(convert.output).toEqual({ key: 'DvalinsPlume', count: 2 })
    expect(convert.costs).toEqual([{ key: planner.items.dreamSolvent, count: 2 * boss.solvent }])

    const guide = rows.find((r) => r.output.key === 'GuideToDiligence')!
    const mora = planner.materialsByKey.get('TeachingsOfDiligence')!.family!.craftMora[0]!
    expect(guide).toMatchObject({
      kind: 'craft',
      input: { key: 'TeachingsOfDiligence', count: 9 },
      output: { key: 'GuideToDiligence', count: 3 },
      costs: [{ key: planner.mora.key, count: 3 * mora }],
      seconds: 0,
    })

    const forge = rows.find((r) => r.kind === 'forge')!
    const recipe = planner.forge.find((f) => f.input === 'CrystalChunk')!
    expect(forge.output.key).toBe(recipe.ore)
    expect(forge.input).toEqual({ key: 'CrystalChunk', count: forge.output.count * recipe.count })
    expect(forge.seconds).toBe(forge.output.count * recipe.seconds)
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('sums the Mora, the conversion currency and the forging time', () => {
    const totals = craftTotals(rows)
    const mora = rows.flatMap((r) => r.costs).filter((c) => c.key === planner.mora.key)
    expect(totals.costs).toContainEqual({
      key: planner.mora.key,
      count: mora.reduce((n, c) => n + c.count, 0),
    })
    expect(totals.costs).toContainEqual({
      key: planner.items.dreamSolvent,
      count: 2 * boss.solvent,
    })
    expect(totals.seconds).toBe(rows.find((r) => r.kind === 'forge')!.seconds)
  })

  it('records steps as done: inputs and costs out, products in, net per material', () => {
    const guide = rows.find((r) => r.output.key === 'GuideToDiligence')!
    expect(craftChanges([guide])).toEqual([
      { key: 'TeachingsOfDiligence', add: -9 },
      { key: planner.mora.key, add: -guide.costs[0]!.count },
      { key: 'GuideToDiligence', add: 3 },
    ])
    expect(craftChanges([guide], true)).toContainEqual({ key: 'TeachingsOfDiligence', add: 9 })
    // Guides made and used up again come out even: left out.
    const philosophies = rows.find((r) => r.output.key === 'PhilosophiesOfDiligence')!
    const both = craftChanges([guide, philosophies])
    expect(both.find((c) => c.key === 'GuideToDiligence')).toBeUndefined()
    expect(both).toContainEqual({ key: 'PhilosophiesOfDiligence', add: 1 })
  })

  it('makes a step wait for the one before it, and fits them all at once', () => {
    const philosophies = rows.find((r) => r.output.key === 'PhilosophiesOfDiligence')!
    expect(changesShort(craftChanges([philosophies]), bag)).toEqual([
      { key: 'GuideToDiligence', count: 3 },
    ])
    expect(changesShort(craftChanges(rows), bag)).toEqual([])
    expect(changesShort(craftChanges(rows), { ...bag, Mora: 0 })).toEqual([
      craftTotals(rows).costs.find((c) => c.key === planner.mora.key),
    ])
  })

  it('leaves nothing to craft once every step is done', () => {
    const after = apply(bag, craftChanges(rows))
    expect(Object.values(after).every((n) => n >= 0)).toBe(true)
    expect(stepsFor(need, after)).toEqual([])
    const back = apply(after, craftChanges(rows, true))
    for (const [key, n] of Object.entries(back)) expect([key, n]).toEqual([key, bag[key] ?? 0])
  })

  it('says it in words', () => {
    const name = (key: string) => planner.materialsByKey.get(key)?.name ?? key
    const guide = craftRow(
      planner,
      steps.find((s) => s.kind === 'craft' && s.to.key === 'GuideToDiligence')!,
    )
    expect(rowText(guide, name, ['525 Mora'])).toBe(
      `Craft 3 ${name('GuideToDiligence')} from 9 ${name('TeachingsOfDiligence')} · 525 Mora`,
    )
    const convert = rows.find((r) => r.kind === 'convert')!
    expect(rowText(convert, name)).toBe(
      `Convert 2 ${name('DvalinsClaw')} into ${name('DvalinsPlume')}`,
    )
  })
})
