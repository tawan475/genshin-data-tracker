/**
 * The farm plan for some of the goals, pure: what the goals in `keep` add
 * to the shortfall, each after the counted goals above it in priority
 * order, as one `PlanTotals` the Farm view takes as it is (cards, runs,
 * resin, who needs what, the crafting steps). It reads the allocation
 * (allocation.ts) the goal cards' readiness comes from: every counted goal
 * takes its share of the bag first, the ones left out too, so a goal left
 * out frees nothing and the kept goals' numbers are the ones their cards
 * show. With every counted goal kept it is the totals of them all.
 *
 * A counted goal's share is what its joining changed: the totals of the
 * goals above it and itself, less those of the goals above it, field by
 * field (what it needs, crafts, converts, forges, is still short of).
 * The goals named in it are the cards' ids (`character:Key`, a weapon
 * card's `weapon:Key:Owner:<id>`): on a material, the kept goals that need
 * it or whose joining left it short (a gem tier the ones above can no
 * longer craft up, once this goal takes the tier below).
 */

import type { PlannerData } from '@gdt/game-data'
import type {
  AzothTotal,
  Conversion,
  ForgeTotal,
  SolventTotal,
  WeeklyBossTotal,
} from '@gdt/game-data/planner-convert'
import {
  expItemMix,
  type ExpTotal,
  type MaterialLine,
  type MoraTotal,
  type PlanTotals,
} from '@gdt/game-data/planner-math'
import type { AllocationMemo } from './allocation'

/** A counted goal's totals before and after it joined the goals above it. */
export interface Share {
  id: string
  /** The goals above it (null: none). */
  before: PlanTotals | null
  /** The goals above it and itself. */
  after: PlanTotals
}

/**
 * The shares of the counted goals in `keep`, in priority order, from the
 * memo of the last `allocateNeeds` call (paused goals and goals with
 * nothing left take no share).
 */
export function allocatedShares(memo: AllocationMemo, keep: ReadonlySet<string>): Share[] {
  const shares: Share[] = []
  let before: PlanTotals | null = null
  for (const step of memo.steps) {
    if (!step.goal || !step.active || !step.before) continue
    if (keep.has(step.id)) shares.push({ id: step.id, before, after: step.before })
    before = step.before
  }
  return shares
}

/** The totals of the counted goals in `keep`, each after the goals above it (see the top). */
export function allocatedTotals(
  planner: PlannerData,
  memo: AllocationMemo,
  keep: ReadonlySet<string>,
): PlanTotals {
  return sumShares(planner, allocatedShares(memo, keep))
}

const delta = (after: number | undefined, before: number | undefined) =>
  (after ?? 0) - (before ?? 0)
const positive = (n: number) => Math.max(0, n)

/** Conversions keyed by what they turn into what. */
function addConversions(
  into: Map<string, Conversion>,
  after: readonly Conversion[],
  before: readonly Conversion[] | undefined,
) {
  const sign = (list: readonly Conversion[] | undefined, by: number) => {
    for (const c of list ?? []) {
      const key = `${c.from.key}>${c.to.key}`
      const sum = into.get(key) ?? { from: c.from, to: c.to, count: 0, cost: 0 }
      sum.count += by * c.count
      sum.cost += by * c.cost
      into.set(key, sum)
    }
  }
  sign(after, 1)
  sign(before, -1)
}

const conversionsOf = (map: ReadonlyMap<string, Conversion>) =>
  [...map.values()].filter((c) => c.count > 0)

/** The shares summed into one `PlanTotals` (`missingItems` recomputed from the summed EXP). */
export function sumShares(planner: PlannerData, shares: readonly Share[]): PlanTotals {
  const lines = new Map<string, MaterialLine>()
  const exp = {
    characterExp: { need: 0, have: 0, missing: 0, missingItems: [], goals: [] } as ExpTotal,
    weaponExp: { need: 0, have: 0, missing: 0, missingItems: [], goals: [] } as ExpTotal,
  }
  const mora: MoraTotal = {
    need: 0,
    have: 0,
    missing: 0,
    crafting: 0,
    forging: 0,
    saved: 0,
    goals: [],
  }
  let solvent: (SolventTotal & { byBoss: Map<string, WeeklyBossTotal> }) | null = null
  const solventConversions = new Map<string, Map<string, Conversion>>()
  let azoth: AzothTotal | null = null
  const azothConversions = new Map<string, Conversion>()
  let forge: (ForgeTotal & { byInput: Map<string, number> }) | null = null

  const named = (list: string[], id: string, need: number) => {
    if (need > 0 && !list.includes(id)) list.push(id)
  }

  for (const { id, before, after } of shares) {
    for (const [key, a] of after.lines) {
      const b = before?.lines.get(key)
      let line = lines.get(key)
      if (!line) {
        line = {
          material: a.material,
          need: 0,
          have: a.have,
          crafted: 0,
          spent: 0,
          missing: 0,
          goals: [],
          converted: 0,
          convertedAway: 0,
        }
        lines.set(key, line)
      }
      const need = delta(a.need, b?.need)
      const missing = delta(a.missing, b?.missing)
      line.need += need
      line.crafted += delta(a.crafted, b?.crafted)
      line.spent += delta(a.spent, b?.spent)
      line.missing += missing
      line.converted! += delta(a.converted, b?.converted)
      line.convertedAway! += delta(a.convertedAway, b?.convertedAway)
      // Its own need, or a tier it leaves short (the chunks it takes aren't crafted up above).
      named(line.goals, id, Math.max(need, missing))
    }

    for (const kind of ['characterExp', 'weaponExp'] as const) {
      const sum = exp[kind]
      const need = delta(after[kind].need, before?.[kind].need)
      sum.need += need
      sum.have = after[kind].have
      sum.missing += delta(after[kind].missing, before?.[kind].missing)
      named(sum.goals, id, need)
    }

    const moraNeed = delta(after.mora.need, before?.mora.need)
    mora.need += moraNeed
    mora.have = after.mora.have
    mora.missing += delta(after.mora.missing, before?.mora.missing)
    mora.crafting += delta(after.mora.crafting, before?.mora.crafting)
    mora.forging += delta(after.mora.forging, before?.mora.forging)
    mora.saved += delta(after.mora.saved, before?.mora.saved)
    named(mora.goals, id, moraNeed)

    const s = after.solvent
    if (s) {
      const b = before?.solvent
      solvent ??= {
        key: s.key,
        need: 0,
        have: s.have,
        used: 0,
        missing: 0,
        blocked: 0,
        bosses: [],
        byBoss: new Map(),
      }
      solvent.need += delta(s.need, b?.need)
      solvent.used += delta(s.used, b?.used)
      solvent.missing += delta(s.missing, b?.missing)
      solvent.blocked += delta(s.blocked, b?.blocked)
      for (const boss of s.bosses) {
        const was = b?.bosses.find((x) => x.boss.key === boss.boss.key)
        let sum = solvent.byBoss.get(boss.boss.key)
        if (!sum) {
          sum = {
            boss: boss.boss,
            lines: [],
            need: 0,
            have: boss.have,
            missing: 0,
            possible: 0,
            conversions: [],
            blocked: 0,
            spare: 0,
          }
          solvent.byBoss.set(boss.boss.key, sum)
        }
        sum.need += delta(boss.need, was?.need)
        sum.missing += delta(boss.missing, was?.missing)
        sum.possible += delta(boss.possible, was?.possible)
        sum.blocked += delta(boss.blocked, was?.blocked)
        sum.spare += delta(boss.spare, was?.spare)
        let conversions = solventConversions.get(boss.boss.key)
        if (!conversions) solventConversions.set(boss.boss.key, (conversions = new Map()))
        addConversions(conversions, boss.conversions, was?.conversions)
      }
    }

    const z = after.azoth
    if (z) {
      const b = before?.azoth
      azoth ??= { key: z.key, need: 0, have: z.have, used: 0, missing: 0, conversions: [], mora: 0 }
      azoth.need += delta(z.need, b?.need)
      azoth.used += delta(z.used, b?.used)
      azoth.missing += delta(z.missing, b?.missing)
      azoth.mora += delta(z.mora, b?.mora)
      addConversions(azothConversions, z.conversions, b?.conversions)
    }

    const f = after.forge
    const g = before?.forge
    if (f || g) {
      const ore = (f ?? g)!.ore
      forge ??= {
        ore,
        count: 0,
        exp: 0,
        inputs: [],
        mora: 0,
        seconds: 0,
        short: 0,
        byInput: new Map(),
      }
      forge.count += delta(f?.count, g?.count)
      forge.exp += delta(f?.exp, g?.exp)
      forge.mora += delta(f?.mora, g?.mora)
      forge.seconds += delta(f?.seconds, g?.seconds)
      forge.short += delta(f?.short, g?.short)
      for (const input of f?.inputs ?? []) {
        forge.byInput.set(input.key, (forge.byInput.get(input.key) ?? 0) + input.count)
      }
      for (const input of g?.inputs ?? []) {
        forge.byInput.set(input.key, (forge.byInput.get(input.key) ?? 0) - input.count)
      }
    }
  }

  // A share can be negative field by field (a goal's need can change what
  // the ones above it craft); the sum is what counts, never below nothing.
  for (const line of lines.values()) {
    line.need = positive(line.need)
    line.crafted = positive(line.crafted)
    line.spent = positive(line.spent)
    line.missing = positive(line.missing)
    line.converted = positive(line.converted ?? 0)
    line.convertedAway = positive(line.convertedAway ?? 0)
  }
  for (const kind of ['characterExp', 'weaponExp'] as const) {
    const sum = exp[kind]
    sum.need = positive(sum.need)
    sum.missing = positive(sum.missing)
    sum.missingItems = expItemMix(
      sum.missing,
      planner.expItems[kind === 'characterExp' ? 'character' : 'weapon'],
    )
  }
  for (const k of ['need', 'missing', 'crafting', 'forging', 'saved'] as const) {
    mora[k] = positive(mora[k])
  }

  let solventTotal: SolventTotal | null = null
  if (solvent) {
    const { byBoss, ...rest } = solvent
    solventTotal = {
      ...rest,
      need: positive(rest.need),
      used: positive(rest.used),
      missing: positive(rest.missing),
      blocked: positive(rest.blocked),
      bosses: [...byBoss.values()].map((boss) => ({
        ...boss,
        lines: boss.boss.items.flatMap((m) => lines.get(m.key) ?? []),
        need: positive(boss.need),
        missing: positive(boss.missing),
        possible: positive(boss.possible),
        blocked: positive(boss.blocked),
        spare: positive(boss.spare),
        conversions: conversionsOf(solventConversions.get(boss.boss.key) ?? new Map()),
      })),
    }
  }
  const azothTotal: AzothTotal | null = azoth && {
    ...azoth,
    need: positive(azoth.need),
    used: positive(azoth.used),
    missing: positive(azoth.missing),
    mora: positive(azoth.mora),
    conversions: conversionsOf(azothConversions),
  }
  let forgeTotal: ForgeTotal | null = null
  if (forge) {
    const { byInput, ...rest } = forge
    const inputs = [...byInput].flatMap(([key, count]) => (count > 0 ? [{ key, count }] : []))
    if (rest.count > 0 || rest.short > 0) {
      forgeTotal = {
        ...rest,
        count: positive(rest.count),
        exp: positive(rest.exp),
        mora: positive(rest.mora),
        seconds: positive(rest.seconds),
        short: positive(rest.short),
        inputs,
      }
    }
  }

  return {
    lines,
    characterExp: exp.characterExp,
    weaponExp: exp.weaponExp,
    mora,
    solvent: solventTotal,
    azoth: azothTotal,
    forge: forgeTotal,
    passives: null,
  }
}
