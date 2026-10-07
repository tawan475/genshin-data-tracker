/**
 * The Goals tab's material filter, pure: which counted goals still need a
 * material, the picker's options (grouped by the game data's material
 * kinds, each with how many goals use it), each goal's amount for its card
 * and the numbers of the line above the cards.
 *
 * An option is
 * - a material family (gems, talent books, enemy drops, weapon materials):
 *   every tier, since the lower ones craft into the higher ones; named and
 *   pictured by its highest tier;
 * - a single material (boss drops, local specialties, weekly boss drops,
 *   the Crown). Weekly drops stay single: Dream Solvent converts them, but
 *   only within a boss and only with Solvent to spare;
 * - EXP: "Character EXP" (the EXP books, counted in points, as the plan
 *   totals keep it) or "Weapon EXP" (the ores).
 * Mora isn't offered: every goal spends it. Its key (the page's
 * `?material=`) is the family's (its lowest tier, as the game data keys
 * families), the material's, or the largest EXP item's (`HerosWit`,
 * `MysticEnhancementOre`), the key the goal cards' EXP chips use. Any
 * other tier or EXP item leads to the same option.
 */

import type { MaterialKind, PlannerData, PlannerMaterial } from '@gdt/game-data'
import type { StockStatus } from '@gdt/game-data/planner-goals'
import type { PlanGoal, PlanTotals, Requirement } from '@gdt/game-data/planner-math'
import { materialMatcher } from '@/utils/materials'
import type { GoalNeeds } from './needs'

export type ExpKind = 'character' | 'weapon'

export interface MaterialOption {
  key: string
  kind: MaterialKind
  /** The material its icon and name come from: a family's highest tier, the largest EXP item. */
  face: PlannerMaterial
  /** What it stands for: a family's tiers (lowest first), the EXP items, or the one material. */
  members: readonly PlannerMaterial[]
  /** EXP options: whose EXP (null for materials). */
  exp: ExpKind | null
}

const EXP_NAME: Record<ExpKind, string> = { character: 'Character EXP', weapon: 'Weapon EXP' }

/** Options built so far, per planner data (by its materials: one map for every copy). */
const cache = new WeakMap<object, Map<string, MaterialOption | null>>()

function buildOption(planner: PlannerData, key: string): MaterialOption | null {
  const m = planner.materialsByKey.get(key)
  if (!m || m.kind === 'mora' || m.kind === 'currency') return null
  if (m.kind === 'exp' || m.kind === 'ore') {
    const exp: ExpKind = m.kind === 'exp' ? 'character' : 'weapon'
    const items = planner.expItems[exp]
    const face = items.at(-1)?.material
    if (!face) return null
    if (face.key !== key) return materialOption(planner, face.key)
    return { key, kind: m.kind, face, members: items.map((i) => i.material), exp }
  }
  const family = m.family && m.family.members.length > 1 ? m.family : null
  if (family) {
    if (family.key !== key) return materialOption(planner, family.key)
    return {
      key,
      kind: family.kind,
      face: family.members.at(-1)!,
      members: family.members,
      exp: null,
    }
  }
  return { key, kind: m.kind, face: m, members: [m], exp: null }
}

/**
 * The option a material key leads to (a family's tier: the family; an EXP
 * item: its EXP); null for Mora, Dust of Azoth, Dream Solvent and keys the
 * data doesn't know. The same object for the same planner data.
 */
export function materialOption(planner: PlannerData, key: string): MaterialOption | null {
  let map = cache.get(planner.materialsByKey)
  if (!map) cache.set(planner.materialsByKey, (map = new Map()))
  let option = map.get(key)
  if (option === undefined) {
    option = buildOption(planner, key)
    map.set(key, option)
  }
  return option
}

/** "Character EXP" / "Weapon EXP". */
export const expName = (exp: ExpKind) => EXP_NAME[exp]

/** An option's name: the game's name of its face, or "Character EXP" / "Weapon EXP". */
export function optionName(option: MaterialOption, name: (key: string) => string): string {
  return option.exp ? EXP_NAME[option.exp] : name(option.face.key)
}

/** The options a goal's remaining cost uses (by key). */
export function requirementOptions(planner: PlannerData, requirement: Requirement): Set<string> {
  const keys = new Set<string>()
  const add = (key: string | undefined) => {
    const option = key ? materialOption(planner, key) : null
    if (option) keys.add(option.key)
  }
  for (const [key, count] of requirement.items) if (count > 0) add(key)
  if (requirement.characterExp > 0) add(planner.expItems.character.at(-1)?.material.key)
  if (requirement.weaponExp > 0) add(planner.expItems.weapon.at(-1)?.material.key)
  return keys
}

/**
 * Per counted goal with something left to spend (by card id), the options
 * its remaining cost uses. Paused and finished goals have none: the filter
 * shows counted goals only, like the totals.
 */
export function materialUses(
  planner: PlannerData,
  entries: readonly { id: string; active: boolean; materialsDone: boolean }[],
  goals: ReadonlyMap<string, PlanGoal>,
): Map<string, Set<string>> {
  const uses = new Map<string, Set<string>>()
  for (const e of entries) {
    const goal = goals.get(e.id)
    if (!e.active || e.materialsDone || !goal) continue
    const keys = requirementOptions(planner, goal.requirement)
    if (keys.size) uses.set(e.id, keys)
  }
  return uses
}

// ------------------------------------------------------------------ the picker

/**
 * The picker's groups, in the order the goal cards list their chips (EXP,
 * gems, boss drops, local specialties, enemy drops, talent books, weekly
 * bosses, weapon materials, elite drops), by the game data's kinds. A kind
 * this table doesn't know yet lands in "Other".
 */
const GROUPS: { id: string; label: string; kinds: readonly MaterialKind[] }[] = [
  { id: 'exp', label: 'EXP', kinds: ['exp', 'ore'] },
  { id: 'gem', label: 'Gems', kinds: ['gem'] },
  { id: 'boss', label: 'Boss drops', kinds: ['boss'] },
  { id: 'local', label: 'Local specialties', kinds: ['local'] },
  { id: 'common', label: 'Enemy drops', kinds: ['common'] },
  { id: 'book', label: 'Talent books', kinds: ['book', 'crown'] },
  { id: 'weekly', label: 'Weekly bosses', kinds: ['weekly'] },
  { id: 'weapon', label: 'Weapon materials', kinds: ['weapon'] },
  { id: 'elite', label: 'Elite drops', kinds: ['elite'] },
]
const OTHER = { id: 'other', label: 'Other' }

export interface MaterialChoice {
  option: MaterialOption
  /** Goals using it, with the other filters applied. */
  count: number
}

export interface MaterialGroup {
  id: string
  label: string
  choices: MaterialChoice[]
}

/**
 * The options the counted goals use (`uses`), plus `selected` when it is an
 * option they don't (a link to a material no goal needs any more), grouped
 * by kind and within a group in the game's order (the bag's: item ids),
 * each with its count (`counts`, by key; none is 0).
 */
export function materialGroups(
  planner: PlannerData,
  uses: ReadonlyMap<string, ReadonlySet<string>>,
  counts: ReadonlyMap<string, number>,
  selected: string | null = null,
): MaterialGroup[] {
  const keys = new Set<string>()
  for (const set of uses.values()) for (const key of set) keys.add(key)
  if (selected) keys.add(selected)
  const byGroup = new Map<string, MaterialChoice[]>()
  for (const key of keys) {
    const option = materialOption(planner, key)
    if (!option) continue
    const id = GROUPS.find((g) => g.kinds.includes(option.kind))?.id ?? OTHER.id
    let list = byGroup.get(id)
    if (!list) byGroup.set(id, (list = []))
    list.push({ option, count: counts.get(key) ?? 0 })
  }
  const order = (c: MaterialChoice) =>
    c.option.exp ? (c.option.exp === 'character' ? 0 : 1) : c.option.members[0]!.id
  return [...GROUPS, OTHER].flatMap(({ id, label }) => {
    const choices = byGroup.get(id)
    if (!choices) return []
    choices.sort((a, b) => order(a) - order(b) || a.option.key.localeCompare(b.option.key))
    return [{ id, label, choices }]
  })
}

/**
 * The groups narrowed to a search: every word of `query` in the option's
 * name, a tier's name or the group's ("slime", "sliver", "gems"). Groups
 * left empty go; an empty query keeps them all.
 */
export function searchMaterialGroups(
  groups: readonly MaterialGroup[],
  query: string,
  name: (key: string) => string,
): MaterialGroup[] {
  const match = materialMatcher(query)
  if (!match) return [...groups]
  return groups.flatMap((g) => {
    const choices = g.choices.filter((c) =>
      match(
        [g.label, optionName(c.option, name), ...c.option.members.map((m) => name(m.key))].join(
          ' ',
        ),
      ),
    )
    return choices.length ? [{ ...g, choices }] : []
  })
}

// ------------------------------------------------------------------ a goal's amount

export interface MaterialAmount {
  material: PlannerMaterial
  /** Items; EXP in the largest item, rounded up (as the cards' chips count it). */
  count: number
  /** EXP options: the points, and whose EXP. */
  points?: number
  exp?: ExpKind
}

/** What a goal's remaining cost takes of an option: each tier it needs, or its EXP. */
export function goalAmounts(
  planner: PlannerData,
  option: MaterialOption,
  requirement: Requirement,
): MaterialAmount[] {
  if (option.exp) {
    const points = option.exp === 'character' ? requirement.characterExp : requirement.weaponExp
    const big = planner.expItems[option.exp].at(-1)
    if (points <= 0 || !big) return []
    return [{ material: option.face, count: Math.ceil(points / big.exp), points, exp: option.exp }]
  }
  return option.members.flatMap((m) => {
    const count = requirement.items.get(m.key) ?? 0
    return count > 0 ? [{ material: m, count }] : []
  })
}

export interface FocusChip extends MaterialAmount {
  /** What the bag covers of it for this goal, as its card's chips say (`all` when it has none). */
  status: StockStatus
  /** Its chip's count: short of it alone (`short`), or after the goals above (`alone`); else 0. */
  short: number
}

/**
 * The chips a card shows first while the filter is on: each tier (or the
 * EXP) the goal needs, with its amount and what its own chips say of it.
 */
export function focusChips(
  planner: PlannerData,
  option: MaterialOption,
  requirement: Requirement,
  needs: GoalNeeds | null,
): FocusChip[] {
  return goalAmounts(planner, option, requirement).map((a) => {
    const chip = needs?.chips.find(
      (c) => c.key === a.material.key && (c.exp ?? null) === option.exp,
    )
    return { ...a, status: chip?.status ?? 'all', short: chip?.count ?? 0 }
  })
}

// ------------------------------------------------------------------ the line above the cards

export interface FocusRow {
  material: PlannerMaterial
  /** What the goals shown need (EXP: points). */
  need: number
  /** Held (EXP: the points the books or ores hold). */
  have: number
  /** Still short after crafting, each goal after the counted goals above it. */
  missing: number
  /** Crafted into this tier from the one below. */
  crafted: number
}

/**
 * The line's numbers from the totals of the goals shown (allocated-totals.ts:
 * each after the counted goals above it): a family's tiers they need, the
 * one material, or the EXP in points.
 */
export function focusRows(option: MaterialOption, totals: PlanTotals): FocusRow[] {
  if (option.exp) {
    const t = option.exp === 'character' ? totals.characterExp : totals.weaponExp
    if (t.need <= 0) return []
    return [{ material: option.face, need: t.need, have: t.have, missing: t.missing, crafted: 0 }]
  }
  return option.members.flatMap((m) => {
    const line = totals.lines.get(m.key)
    if (!line || line.need <= 0) return []
    return [
      {
        material: m,
        need: line.need,
        have: line.have,
        missing: line.missing,
        crafted: line.crafted,
      },
    ]
  })
}
