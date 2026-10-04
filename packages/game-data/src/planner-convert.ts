/**
 * What the inventory can turn into, pure and synchronous. `planTotals`
 * (planner-math) runs these after summing the goals; each is exported for
 * tests and for pages that show one step on its own.
 *
 * - `craftFamily`: 3 of a tier -> 1 of the next, within a family, for Mora.
 * - `convertWeekly`: Dream Solvent turns one weekly boss material into
 *   another of the same boss (Seelie's rule: a boss is covered when its three
 *   materials held cover their three needs), limited by the solvent held.
 * - `convertGems`: Dust of Azoth turns a spare gem into the same tier of
 *   another element (1/3/9/27 dust per tier; Brilliant Diamond never).
 * - `forgeOre`: Mystic Enhancement Ore from the chunks held.
 * - `craftingSteps`: the checklist of crafts, conversions and forging that
 *   the totals assume, to do in game before levelling.
 */

import type { ForgeRecipe, PlannerData, PlannerMaterial, WeeklyBoss } from './index'
import type { ExpTotal, MaterialLine, PlanTotals } from './planner-math'

type Inventory = Readonly<Record<string, number>>

const heldIn = (inventory: Inventory) => (key: string) =>
  Math.max(0, Math.trunc(inventory[key] ?? 0))

/** What a tier has left once its own need and the crafting above are paid. */
export function spareOf(line: MaterialLine): number {
  return Math.max(
    0,
    line.have +
      line.crafted +
      (line.converted ?? 0) -
      line.need -
      line.spent -
      (line.convertedAway ?? 0),
  )
}

function newLine(material: PlannerMaterial, have: number): MaterialLine {
  return { material, need: 0, have, crafted: 0, spent: 0, missing: 0, goals: [] }
}

// --- Crafting ---------------------------------------------------------------------

/**
 * Fills `crafted`, `spent` and `missing` on one family's tiers (lowest
 * first) and returns the crafting mora. Pass 1 finds how many of each tier
 * the spares below could make; pass 2 walks down from the top, crafting only
 * what a tier is short of, so a craft is only counted (and paid) when used.
 * `craftMora` empty means the family cannot be crafted.
 */
export function craftFamily(tiers: MaterialLine[], craftMora: readonly number[]): number {
  const n = tiers.length
  const craftable = craftMora.length >= n - 1 && n > 1
  // Pass 1: the most each tier could receive from below.
  const canCraft = new Array<number>(n).fill(0)
  if (craftable) {
    for (let t = 1; t < n; t++) {
      const below = tiers[t - 1]!
      const spare = Math.max(0, below.have + canCraft[t - 1]! - below.need)
      canCraft[t] = Math.floor(spare / 3)
    }
  }
  // Pass 2: from the top, craft only what is short.
  let mora = 0
  let demand = tiers[n - 1]?.need ?? 0
  for (let t = n - 1; t >= 0; t--) {
    const tier = tiers[t]!
    const short = Math.max(0, demand - tier.have)
    const crafted = Math.min(short, canCraft[t]!)
    tier.crafted = crafted
    tier.missing = short - crafted
    if (crafted > 0) {
      mora += crafted * (craftMora[t - 1] ?? 0)
      tiers[t - 1]!.spent = crafted * 3
    }
    demand = t > 0 ? tiers[t - 1]!.need + crafted * 3 : 0
  }
  return mora
}

// --- Dream Solvent ------------------------------------------------------------------

export interface Conversion {
  from: PlannerMaterial
  to: PlannerMaterial
  count: number
  /** Dream Solvent or Dust of Azoth spent. */
  cost: number
}

export interface WeeklyBossTotal {
  boss: WeeklyBoss
  /** The trio, need 0 for what no goal needs. */
  lines: MaterialLine[]
  need: number
  have: number
  /** Still missing after the conversions made. */
  missing: number
  /** Conversions the materials held allow: min(total shortage, total spare). */
  possible: number
  /** Conversions made (the solvent held allowed). */
  conversions: Conversion[]
  /** Possible conversions not made for lack of Dream Solvent. */
  blocked: number
  /** Materials held beyond the boss's needs after conversions. */
  spare: number
}

export interface SolventTotal {
  /** GOOD key of Dream Solvent. */
  key: string
  /** Solvent every possible conversion takes (Seelie's "need"). */
  need: number
  have: number
  /** Solvent the conversions made use. */
  used: number
  missing: number
  /** Conversions not made for lack of solvent (their materials stay missing). */
  blocked: number
  /** Bosses with something needed, in data order. */
  bosses: WeeklyBossTotal[]
}

/**
 * Covers weekly shortages with the same boss's spare materials, one Dream
 * Solvent (`boss.solvent`) per conversion, while the solvent held lasts
 * (bosses in data order). Adds need-0 lines for the trio members no goal
 * needs, and updates `converted`, `convertedAway` and `missing` in place.
 */
export function convertWeekly(
  planner: PlannerData,
  lines: Map<string, MaterialLine>,
  inventory: Inventory,
): SolventTotal {
  const held = heldIn(inventory)
  const key = planner.items.dreamSolvent
  const have = key ? held(key) : 0
  // Solvent an item goal asks for itself is not spent on conversions.
  const available = Math.max(0, have - (lines.get(key)?.need ?? 0))
  let left = available
  const total: SolventTotal = {
    key,
    need: 0,
    have,
    used: 0,
    missing: 0,
    blocked: 0,
    bosses: [],
  }
  for (const boss of planner.weeklyBosses) {
    if (!boss.items.some((m) => (lines.get(m.key)?.need ?? 0) > 0)) continue
    const trio = boss.items.map((m) => {
      let line = lines.get(m.key)
      if (!line) {
        line = newLine(m, held(m.key))
        lines.set(m.key, line)
      }
      return line
    })
    const shorts = trio.filter((l) => l.missing > 0).sort((a, b) => b.missing - a.missing)
    const spares = trio
      .map((l) => ({ line: l, spare: spareOf(l) }))
      .filter((s) => s.spare > 0)
      .sort((a, b) => b.spare - a.spare)
    const short = shorts.reduce((sum, l) => sum + l.missing, 0)
    const spare = spares.reduce((sum, s) => sum + s.spare, 0)
    const possible = Math.min(short, spare)
    const made = boss.solvent > 0 ? Math.min(possible, Math.floor(left / boss.solvent)) : 0
    left -= made * boss.solvent

    const conversions: Conversion[] = []
    let todo = made
    for (const to of shorts) {
      for (const from of spares) {
        if (todo === 0 || to.missing === 0) break
        const count = Math.min(to.missing, from.spare, todo)
        if (count === 0) continue
        from.spare -= count
        from.line.convertedAway = (from.line.convertedAway ?? 0) + count
        to.converted = (to.converted ?? 0) + count
        to.missing -= count
        todo -= count
        conversions.push({
          from: from.line.material,
          to: to.material,
          count,
          cost: count * boss.solvent,
        })
      }
    }
    total.need += possible * boss.solvent
    total.used += made * boss.solvent
    total.blocked += possible - made
    total.bosses.push({
      boss,
      lines: trio,
      need: trio.reduce((sum, l) => sum + l.need, 0),
      have: trio.reduce((sum, l) => sum + l.have, 0),
      missing: trio.reduce((sum, l) => sum + l.missing, 0),
      possible,
      conversions,
      blocked: possible - made,
      spare: spares.reduce((sum, s) => sum + s.spare, 0),
    })
  }
  total.missing = Math.max(0, total.need - available)
  return total
}

// --- Dust of Azoth -------------------------------------------------------------------

export interface AzothTotal {
  /** GOOD key of Dust of Azoth. */
  key: string
  /** Dust every useful conversion would take (with unlimited dust). */
  need: number
  have: number
  /** Dust the conversions made use. */
  used: number
  missing: number
  conversions: Conversion[]
  /** Crafting Mora the conversions add (counted in the totals' crafting Mora). */
  mora: number
}

interface GemPlan {
  usePool: number[]
  craft: number[]
  missing: number[]
  dust: number
  mora: number
}

/**
 * One target family: own spares first, then other elements' spares at the
 * same tier (dust), then crafting from below. Null when the dust budget
 * would leave a lower tier short that wasn't (try a smaller demand).
 */
function planGems(
  demand: readonly number[],
  own: readonly number[],
  pool: readonly number[],
  craftMora: readonly number[],
  dustPerTier: readonly number[],
  budget: number,
): GemPlan | null {
  const n = demand.length
  const unit = (t: number) => dustPerTier[t] ?? Infinity
  const poolCap = pool.map((p, t) => Math.min(p, Math.floor(budget / unit(t))))
  const canCraft = new Array<number>(n).fill(0)
  for (let t = 1; t < n; t++) {
    const spare = own[t - 1]! + poolCap[t - 1]! + canCraft[t - 1]! - demand[t - 1]!
    canCraft[t] = Math.floor(Math.max(0, spare) / 3)
  }
  const plan: GemPlan = {
    usePool: new Array<number>(n).fill(0),
    craft: new Array<number>(n).fill(0),
    missing: new Array<number>(n).fill(0),
    dust: 0,
    mora: 0,
  }
  let left = budget
  let want = demand[n - 1]!
  for (let t = n - 1; t >= 0; t--) {
    const useOwn = Math.min(want, own[t]!)
    const usePool = Math.min(want - useOwn, pool[t]!, Math.floor(left / unit(t)))
    left -= usePool * unit(t)
    plan.usePool[t] = usePool
    plan.dust += usePool * unit(t)
    const short = want - useOwn - usePool
    const craft = Math.min(short, canCraft[t]!)
    plan.craft[t] = craft
    plan.missing[t] = short - craft
    if (plan.missing[t]! > demand[t]!) return null
    if (craft > 0) plan.mora += craft * (craftMora[t - 1] ?? 0)
    want = t > 0 ? demand[t - 1]! + craft * 3 : 0
  }
  return plan
}

/**
 * Covers missing gems with spare gems of other elements, tier for tier, for
 * Dust of Azoth (`planner.azoth.dust` per gem), crafting the converted gems up
 * where that helps. Spares are what each family holds beyond its own needs
 * after crafting. Families are served in data order while `dust` lasts
 * (default: the dust held less what item goals ask for).
 * Updates the lines in place (adding need-0 lines for source families no
 * goal needs) and returns what was done; the crafting Mora is in `mora`.
 */
export function convertGems(
  planner: PlannerData,
  lines: Map<string, MaterialLine>,
  inventory: Inventory,
  dust = heldIn(inventory)(planner.items.dustOfAzoth) -
    (lines.get(planner.items.dustOfAzoth)?.need ?? 0),
): AzothTotal {
  const held = heldIn(inventory)
  const families = planner.families.filter((f) => planner.azoth.families.has(f.key))
  const total: AzothTotal = {
    key: planner.items.dustOfAzoth,
    need: 0,
    have: heldIn(inventory)(planner.items.dustOfAzoth),
    used: 0,
    missing: 0,
    conversions: [],
    mora: 0,
  }
  const tiersOf = (family: (typeof families)[number]) => family.members.map((m) => lines.get(m.key))
  const spareAt = (family: (typeof families)[number], t: number) => {
    const line = lines.get(family.members[t]!.key)
    return line ? spareOf(line) : held(family.members[t]!.key)
  }
  let budget = Math.max(0, dust)
  for (const target of families) {
    const tiers = tiersOf(target)
    const demand = tiers.map((l) => l?.missing ?? 0)
    if (demand.every((d) => d === 0)) continue
    const own = target.members.map((_, t) => spareAt(target, t))
    const pool = target.members.map((_, t) =>
      families.reduce((sum, f) => (f === target ? sum : sum + spareAt(f, t)), 0),
    )
    // Dust the whole shortage would take (reported as `need`).
    const full = planGems(demand, own, pool, target.craftMora, planner.azoth.dust, Infinity)
    total.need += full?.dust ?? 0
    // Within the dust left: lower the demand from the top until it fits.
    let plan: GemPlan | null = null
    const want = [...demand]
    while (want.some((d) => d > 0)) {
      plan = planGems(want, own, pool, target.craftMora, planner.azoth.dust, budget)
      if (plan) break
      // The highest tier still wanted (no findLastIndex: the app targets ES2022).
      let top = want.length - 1
      while (top > 0 && want[top] === 0) top--
      want[top] = want[top]! - 1
    }
    if (!plan || plan.usePool.every((u) => u === 0)) continue
    budget -= plan.dust
    total.used += plan.dust
    total.mora += plan.mora

    target.members.forEach((member, t) => {
      let line = lines.get(member.key)
      if (!line) {
        line = newLine(member, held(member.key))
        lines.set(member.key, line)
      }
      const got = plan.usePool[t]!
      if (got > 0) line.converted = (line.converted ?? 0) + got
      line.crafted += plan.craft[t]!
      if (t > 0 && plan.craft[t]! > 0) {
        const below = lines.get(target.members[t - 1]!.key)!
        below.spent += plan.craft[t]! * 3
      }
      // Tiers that were short keep what the plan could not cover.
      if (demand[t]! > 0) line.missing = plan.missing[t]! + (demand[t]! - want[t]!)
      // Take the converted gems from the families with the most spare.
      let todo = got
      const sources = families
        .filter((f) => f !== target)
        .map((f) => ({ family: f, spare: spareAt(f, t) }))
        .filter((s) => s.spare > 0)
        .sort((a, b) => b.spare - a.spare)
      for (const source of sources) {
        if (todo === 0) break
        const count = Math.min(todo, source.spare)
        const material = source.family.members[t]!
        let from = lines.get(material.key)
        if (!from) {
          from = newLine(material, held(material.key))
          lines.set(material.key, from)
        }
        from.convertedAway = (from.convertedAway ?? 0) + count
        todo -= count
        total.conversions.push({
          from: material,
          to: member,
          count,
          cost: count * (planner.azoth.dust[t] ?? 0),
        })
      }
    })
  }
  total.missing = Math.max(0, total.need - Math.max(0, dust))
  return total
}

// --- Forging -----------------------------------------------------------------------

export interface ForgeTotal {
  ore: PlannerMaterial
  /** Ores to forge from the chunks held (at most what is missing). */
  count: number
  /** Weapon EXP they give. */
  exp: number
  inputs: { key: string; count: number }[]
  mora: number
  /** Forging time of them all, in seconds (the blacksmith's queue limits aside). */
  seconds: number
  /** Ores still missing after forging. */
  short: number
}

/**
 * Mystic Enhancement Ore (the largest weapon EXP item) the chunks held can
 * be forged into, for the weapon EXP still missing. Null when nothing is
 * missing or the data has no recipe. Doesn't change `weaponExp`; planTotals
 * applies it.
 */
export function forgeOre(
  planner: PlannerData,
  weaponExp: Pick<ExpTotal, 'missing'>,
  inventory: Inventory,
): ForgeTotal | null {
  const top = planner.expItems.weapon.at(-1)
  if (!top || weaponExp.missing <= 0) return null
  const recipes: ForgeRecipe[] = planner.forge.filter((r) => r.ore === top.material.key)
  if (recipes.length === 0) return null
  const held = heldIn(inventory)
  const wanted = Math.ceil(weaponExp.missing / top.exp)
  let count = 0
  let mora = 0
  let seconds = 0
  const inputs: { key: string; count: number }[] = []
  for (const recipe of [...recipes].sort((a, b) => held(b.input) - held(a.input))) {
    const n = Math.min(wanted - count, Math.floor(held(recipe.input) / recipe.count))
    if (n <= 0) continue
    count += n
    mora += n * recipe.mora
    seconds += n * recipe.seconds
    inputs.push({ key: recipe.input, count: n * recipe.count })
  }
  return {
    ore: top.material,
    count,
    exp: count * top.exp,
    inputs,
    mora,
    seconds,
    short: wanted - count,
  }
}

// --- Checklist ------------------------------------------------------------------------

export type PlanStep =
  | {
      kind: 'craft'
      from: PlannerMaterial
      to: PlannerMaterial
      /** Made. */
      count: number
      /** Of `from` used (3 each). */
      uses: number
      mora: number
    }
  | {
      kind: 'convert'
      from: PlannerMaterial
      to: PlannerMaterial
      count: number
      /** Currency spent: Dream Solvent or Dust of Azoth (GOOD key). */
      via: string
      cost: number
    }
  | {
      kind: 'forge'
      /** GOOD key of the input (Crystal Chunk…). */
      input: string
      to: PlannerMaterial
      count: number
      uses: number
      mora: number
      seconds: number
    }

/**
 * What the totals assume you do in game before levelling, in order:
 * conversions (Dream Solvent, Dust of Azoth), then crafts from the lowest
 * tier up, then forging. Everything listed can be done now with the stock.
 */
export function craftingSteps(planner: PlannerData, totals: PlanTotals): PlanStep[] {
  const steps: PlanStep[] = []
  for (const c of totals.solvent?.bosses.flatMap((b) => b.conversions) ?? []) {
    steps.push({
      kind: 'convert',
      from: c.from,
      to: c.to,
      count: c.count,
      via: planner.items.dreamSolvent,
      cost: c.cost,
    })
  }
  for (const c of totals.azoth?.conversions ?? []) {
    steps.push({
      kind: 'convert',
      from: c.from,
      to: c.to,
      count: c.count,
      via: planner.items.dustOfAzoth,
      cost: c.cost,
    })
  }
  const crafts: Extract<PlanStep, { kind: 'craft' }>[] = []
  for (const line of totals.lines.values()) {
    const family = line.material.family
    if (!family || line.crafted <= 0 || line.material.tier < 2) continue
    crafts.push({
      kind: 'craft',
      from: family.members[line.material.tier - 2]!,
      to: line.material,
      count: line.crafted,
      uses: line.crafted * 3,
      mora: line.crafted * (family.craftMora[line.material.tier - 2] ?? 0),
    })
  }
  // Lower tiers first: a craft may use what the one below makes.
  crafts.sort((a, b) => a.to.tier - b.to.tier || a.to.id - b.to.id)
  steps.push(...crafts)
  const forge = totals.forge
  if (forge) {
    for (const input of forge.inputs) {
      const recipe = planner.forge.find((r) => r.ore === forge.ore.key && r.input === input.key)
      const count = recipe ? input.count / recipe.count : 0
      steps.push({
        kind: 'forge',
        input: input.key,
        to: forge.ore,
        count,
        uses: input.count,
        mora: count * (recipe?.mora ?? 0),
        seconds: count * (recipe?.seconds ?? 0),
      })
    }
  }
  return steps
}
