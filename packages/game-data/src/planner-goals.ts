/**
 * Per-goal helpers over planner-math, pure and synchronous:
 *
 * - `raiseForTalents` / `clampTalents`: make a character target the game
 *   allows (talent levels need an ascension phase), for the goal editor;
 * - `goalStatus`: Seelie's three states per material of a goal: enough for
 *   all goals, enough for this goal alone, or short;
 * - `nextStep`: the furthest a goal can go right now with the stock (levels
 *   and ascensions first, then talents one level at a time).
 */

import type { AscensionPhase, PlannerData } from './index'
import {
  ascensionForTalents,
  characterRequirement,
  levelMilestones,
  normalizeLevel,
  planTotals,
  TALENTS,
  talentCap,
  weaponRequirement,
  type CharacterState,
  type PlanGoal,
  type PlanOptions,
  type PlanTotals,
  type Requirement,
  type Talents,
  type WeaponState,
} from './planner-math'

type Inventory = Readonly<Record<string, number>>

// --- Valid targets ------------------------------------------------------------

/**
 * A character target with the ascension raised to what its talents need
 * (and the level with it, to that phase's starting cap). `raised` is the
 * phase it took, or null when the target was already valid. `table` is
 * `planner.talentAscension`.
 */
export function raiseForTalents<T extends CharacterState>(
  phases: readonly AscensionPhase[],
  target: T,
  table?: readonly number[],
): { target: T; raised: number | null } {
  const need = Math.min(phases.length - 1, ascensionForTalents(target.talents, table))
  if (need <= target.ascension) return { target, raised: null }
  const lv = normalizeLevel(phases, target.level, need)
  return { target: { ...target, ...lv }, raised: need }
}

/** Talent levels lowered to what the target's ascension allows (the other way to fix a target). */
export function clampTalents<T extends CharacterState>(
  target: T,
  table?: readonly number[],
): { target: T; clamped: boolean } {
  const cap = (asc: number) => {
    if (table && table.length >= 10) {
      let level = 1
      table.forEach((need, i) => {
        if (need <= asc) level = Math.max(level, i + 1)
      })
      return level
    }
    return talentCap(asc)
  }
  const max = cap(target.ascension)
  const talents: Talents = { ...target.talents }
  let clamped = false
  for (const t of TALENTS) {
    if (talents[t] > max) {
      talents[t] = max
      clamped = true
    }
  }
  return { target: clamped ? { ...target, talents } : target, clamped }
}

// --- Status --------------------------------------------------------------------

/** `all`: the stock covers every goal's need of it; `alone`: only this goal's; `short`: not even that. */
export type StockStatus = 'all' | 'alone' | 'short'

export interface GoalStatus {
  /** Per GOOD key of the goal's materials. */
  items: Map<string, StockStatus>
  /** null when the goal needs none. */
  characterExp: StockStatus | null
  weaponExp: StockStatus | null
  mora: StockStatus | null
  /** The worst of them all. */
  overall: StockStatus
}

const worst = (list: StockStatus[]): StockStatus =>
  list.includes('short') ? 'short' : list.includes('alone') ? 'alone' : 'all'

/**
 * Seelie's cost-tile colours for one goal. `all` is the plan's totals with
 * every active goal (the page has them already); without it they are
 * computed from `goals`. The goal counts as active either way.
 */
export function goalStatus(
  planner: PlannerData,
  goal: PlanGoal,
  inventory: Inventory,
  options: PlanOptions & { all?: PlanTotals; goals?: readonly PlanGoal[] } = {},
): GoalStatus {
  const self = { ...goal, active: true }
  const all =
    options.all && goal.active !== false
      ? options.all
      : planTotals(
          planner,
          [...(options.goals ?? []).filter((g) => g.id !== goal.id), self],
          inventory,
          options,
        )
  const alone = planTotals(planner, [self], inventory, options)
  const state = (allMissing: number, aloneMissing: number): StockStatus =>
    allMissing === 0 ? 'all' : aloneMissing === 0 ? 'alone' : 'short'

  const items = new Map<string, StockStatus>()
  for (const key of goal.requirement.items.keys()) {
    items.set(key, state(all.lines.get(key)?.missing ?? 0, alone.lines.get(key)?.missing ?? 0))
  }
  const r = goal.requirement
  const characterExp =
    r.characterExp > 0 ? state(all.characterExp.missing, alone.characterExp.missing) : null
  const weaponExp = r.weaponExp > 0 ? state(all.weaponExp.missing, alone.weaponExp.missing) : null
  const mora = r.mora > 0 ? state(all.mora.missing, alone.mora.missing) : null
  const every = [...items.values(), characterExp, weaponExp, mora].filter(
    (s): s is StockStatus => s !== null,
  )
  return { items, characterExp, weaponExp, mora, overall: worst(every) }
}

// --- Next step --------------------------------------------------------------------

export interface NextStep<S> {
  /** The furthest state the stock reaches now (the current one when nothing is affordable). */
  state: S
  /** What it costs from the current state. */
  requirement: Requirement
  /** The whole goal is affordable now. */
  full: boolean
  /** Why it stops short: the stock, or the Adventure Rank an ascension needs. */
  stop: 'stock' | 'ar' | null
}

/** The stock (crafting and the plan options included) covers a requirement on its own. */
export function affordable(
  planner: PlannerData,
  requirement: Requirement,
  inventory: Inventory,
  options: PlanOptions = {},
): boolean {
  const totals = planTotals(planner, [{ id: 'step', requirement }], inventory, options)
  if (totals.characterExp.missing > 0 || totals.weaponExp.missing > 0 || totals.mora.missing > 0)
    return false
  for (const line of totals.lines.values()) if (line.missing > 0) return false
  return true
}

/**
 * How far a character goal can go now: level/ascension milestones in order
 * while the stock covers them (and the account's `ar` allows the ascension),
 * then talents one level at a time, round-robin (normal attack, skill,
 * burst), within the reached ascension's cap. Null when not even the first
 * step is affordable or the goal is done.
 */
export function nextCharacterStep(
  planner: PlannerData,
  key: string,
  current: CharacterState,
  target: CharacterState,
  inventory: Inventory,
  options: PlanOptions & { ar?: number | null } = {},
): NextStep<CharacterState> | null {
  const character = planner.characters.get(key)
  if (!character) return null
  const phases = character.ascension
  const table = planner.talentAscension
  const goal = raiseForTalents(phases, target, table).target
  const from = normalizeLevel(phases, current.level, current.ascension)
  const to = normalizeLevel(phases, goal.level, goal.ascension)
  let state: CharacterState = { ...from, talents: { ...current.talents } }
  let requirement: Requirement | null = null
  let stop: NextStep<CharacterState>['stop'] = null
  const cost = (s: CharacterState) =>
    characterRequirement(planner, key, current, s, { talentCaps: false })

  const advance = (candidate: CharacterState): boolean => {
    const r = cost(candidate)
    if (!r) return false
    if (options.ar != null && (r.ar ?? 0) > options.ar) {
      stop = 'ar'
      return false
    }
    if (!affordable(planner, r, inventory, options)) {
      stop ??= 'stock'
      return false
    }
    state = candidate
    requirement = r
    return true
  }

  const milestones = levelMilestones(phases).filter(
    (m) =>
      (m.ascension > from.ascension || (m.ascension === from.ascension && m.level > from.level)) &&
      (m.ascension < to.ascension || (m.ascension === to.ascension && m.level <= to.level)),
  )
  // The target level itself when it isn't a milestone (level 85).
  if (!milestones.some((m) => m.level === to.level && m.ascension === to.ascension)) {
    if (to.level > from.level || to.ascension > from.ascension) milestones.push(to)
  }
  for (const m of milestones) {
    if (!advance({ ...state, level: m.level, ascension: m.ascension })) break
  }
  let progressed = true
  while (progressed) {
    progressed = false
    for (const t of TALENTS) {
      const level = state.talents[t]
      if (level >= goal.talents[t]) continue
      if (ascensionForTalents({ ...state.talents, [t]: level + 1 }, table) > state.ascension)
        continue
      if (advance({ ...state, talents: { ...state.talents, [t]: level + 1 } })) progressed = true
    }
  }
  if (!requirement) return null
  const full =
    state.level >= to.level &&
    state.ascension >= to.ascension &&
    TALENTS.every((t) => state.talents[t] >= goal.talents[t])
  return { state, requirement, full, stop: full ? null : stop }
}

/** How far a weapon goal can go now: level/ascension milestones while the stock covers them. */
export function nextWeaponStep(
  planner: PlannerData,
  key: string,
  current: WeaponState,
  target: Pick<WeaponState, 'level' | 'ascension'>,
  inventory: Inventory,
  options: PlanOptions & { ar?: number | null } = {},
): NextStep<WeaponState> | null {
  const weapon = planner.weapons.get(key)
  if (!weapon) return null
  const phases = weapon.ascension
  const from = normalizeLevel(phases, current.level, current.ascension)
  const to = normalizeLevel(phases, target.level, target.ascension)
  let state: WeaponState = { ...current, ...from }
  let requirement: Requirement | null = null
  let stop: NextStep<WeaponState>['stop'] = null
  const milestones = levelMilestones(phases).filter(
    (m) =>
      (m.ascension > from.ascension || (m.ascension === from.ascension && m.level > from.level)) &&
      (m.ascension < to.ascension || (m.ascension === to.ascension && m.level <= to.level)),
  )
  if (!milestones.some((m) => m.level === to.level && m.ascension === to.ascension)) {
    if (to.level > from.level || to.ascension > from.ascension) milestones.push(to)
  }
  for (const m of milestones) {
    const candidate = { ...state, level: m.level, ascension: m.ascension }
    const r = weaponRequirement(planner, key, current, candidate)
    if (!r) break
    if (options.ar != null && (r.ar ?? 0) > options.ar) {
      stop = 'ar'
      break
    }
    if (!affordable(planner, r, inventory, options)) {
      stop = 'stock'
      break
    }
    state = candidate
    requirement = r
  }
  if (!requirement) return null
  const full = state.level >= to.level && state.ascension >= to.ascension
  return { state, requirement, full, stop: full ? null : stop }
}
