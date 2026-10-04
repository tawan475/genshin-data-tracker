/**
 * The Planner page's model: stored targets joined with the newest snapshot
 * (current levels, talents, weapons) and the planner data, each goal's cost
 * memoised (`createRequirementCache`), plus the totals and farming groups
 * from `@gdt/game-data/planner-math`. Pure functions; the view keeps them in
 * computed()s.
 */

import type { PlannerData } from '@gdt/game-data'
import {
  createRequirementCache,
  findCharacterState,
  findWeaponState,
  isDone,
  type CharacterState,
  type PlanGoal,
  type Requirement,
  type WeaponState,
} from '@gdt/game-data/planner-math'
import type {
  CharacterTarget,
  Good,
  PlannerTarget,
  WeaponTarget,
  plannerTargetInput,
  plannerTargetsPatch,
} from '@gdt/shared'
import type { z } from 'zod'
import type { Element } from '@/data/characters-meta'
import { itemName } from '@/data/weapons'
import { keyToName } from '@/lib/format'

export type TargetInput = z.input<typeof plannerTargetInput>
export type TargetsPatch = z.input<typeof plannerTargetsPatch>
export type TargetRef = NonNullable<TargetsPatch['remove']>[number]

export const characterGoalId = (key: string) => `character:${key}`
export const weaponGoalId = (key: string, owner: string) => `weapon:${key}:${owner}`

export function targetId(t: { kind: 'character' | 'weapon'; key: string; owner?: string }) {
  return t.kind === 'character' ? characterGoalId(t.key) : weaponGoalId(t.key, t.owner ?? '')
}

export type RequirementCache = ReturnType<typeof createRequirementCache>

export interface WeaponGoalView {
  id: string
  key: string
  owner: string
  name: string
  rarity: number | null
  /** Whether a copy is in the inventory (else it starts at level 1). */
  owned: boolean
  current: WeaponState
  target: WeaponTarget
  requirement: Requirement | null
  /** Level, ascension and refinement reached. */
  done: boolean
}

export interface CharacterGoalView {
  id: string
  key: string
  name: string
  rarity: number | null
  element: Element | null
  owned: boolean
  current: CharacterState
  target: CharacterTarget
  requirement: Requirement | null
  done: boolean
}

/** One card on the Goals tab: a character with its weapon goals, or a weapon on its own. */
export interface GoalEntry {
  id: string
  character: CharacterGoalView | null
  weapons: WeaponGoalView[]
  /** Character key for the portrait (the weapon's owner on a weapon-only card). */
  owner: string
  name: string
  active: boolean
  done: boolean
}

export interface Board {
  entries: GoalEntry[]
  /** Every goal, for the totals. */
  goals: PlanGoal[]
  characterGoals: Map<string, CharacterGoalView>
  weaponGoals: Map<string, WeaponGoalView>
}

const ELEMENTS: Record<string, Element> = {
  Pyro: 'pyro',
  Hydro: 'hydro',
  Anemo: 'anemo',
  Electro: 'electro',
  Dendro: 'dendro',
  Cryo: 'cryo',
  Geo: 'geo',
}

export function characterName(key: string): string {
  return keyToName(key)
}

export function weaponName(key: string): string {
  return itemName(key)
}

export function characterGoalView(
  planner: PlannerData,
  good: Good,
  cache: RequirementCache,
  key: string,
  target: CharacterTarget,
): CharacterGoalView {
  const data = planner.characters.get(key)
  const { state, owned } = findCharacterState(good.characters, key)
  const requirement = cache.character(key, state, target)
  return {
    id: characterGoalId(key),
    key,
    name: characterName(key),
    rarity: data?.rarity ?? null,
    element: data?.element ? (ELEMENTS[data.element] ?? null) : null,
    owned,
    current: state,
    target,
    requirement,
    done: requirement ? isDone(requirement) : false,
  }
}

export function weaponGoalView(
  planner: PlannerData,
  good: Good,
  cache: RequirementCache,
  key: string,
  owner: string,
  target: WeaponTarget,
): WeaponGoalView {
  const data = planner.weapons.get(key)
  const { state, owned } = findWeaponState(good.weapons, key, owner)
  const requirement = cache.weapon(key, state, target)
  return {
    id: weaponGoalId(key, owner),
    key,
    owner,
    name: weaponName(key),
    rarity: data?.rarity ?? null,
    owned,
    current: state,
    target,
    requirement,
    done: (requirement ? isDone(requirement) : false) && state.refinement >= target.refinement,
  }
}

/** Joins the targets with the inventory; characters by name, done ones last. */
export function buildBoard(
  planner: PlannerData,
  good: Good,
  targets: readonly PlannerTarget[],
  cache: RequirementCache,
): Board {
  const characterGoals = new Map<string, CharacterGoalView>()
  const weaponGoals = new Map<string, WeaponGoalView>()
  for (const t of targets) {
    if (t.kind === 'character') {
      characterGoals.set(t.key, characterGoalView(planner, good, cache, t.key, t.target))
    } else {
      const view = weaponGoalView(planner, good, cache, t.key, t.owner, t.target)
      weaponGoals.set(view.id, view)
    }
  }

  const entries: GoalEntry[] = []
  const byOwner = new Map<string, WeaponGoalView[]>()
  for (const w of weaponGoals.values()) {
    if (w.owner && characterGoals.has(w.owner)) {
      const list = byOwner.get(w.owner)
      if (list) list.push(w)
      else byOwner.set(w.owner, [w])
    } else {
      entries.push({
        id: w.id,
        character: null,
        weapons: [w],
        owner: w.owner,
        name: w.name,
        active: w.target.active,
        done: w.done,
      })
    }
  }
  for (const c of characterGoals.values()) {
    const weapons = byOwner.get(c.key) ?? []
    entries.push({
      id: c.id,
      character: c,
      weapons,
      owner: c.key,
      name: c.name,
      active: c.target.active || weapons.some((w) => w.target.active),
      done: c.done && weapons.every((w) => w.done),
    })
  }
  entries.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      Number(a.character === null) - Number(b.character === null) ||
      a.name.localeCompare(b.name),
  )

  const goals: PlanGoal[] = []
  for (const c of characterGoals.values()) {
    if (c.requirement) goals.push({ id: c.id, requirement: c.requirement, active: c.target.active })
  }
  for (const w of weaponGoals.values()) {
    if (w.requirement) goals.push({ id: w.id, requirement: w.requirement, active: w.target.active })
  }
  return { entries, goals, characterGoals, weaponGoals }
}

/** Default goal for a character: 90/6 and talents at least 9. */
export function defaultCharacterTarget(current: CharacterState): CharacterTarget {
  return {
    level: 90,
    ascension: 6,
    talents: {
      auto: Math.max(9, current.talents.auto),
      skill: Math.max(9, current.talents.skill),
      burst: Math.max(9, current.talents.burst),
    },
    active: true,
  }
}

/** Default goal for a weapon: its top level, the current refinement. */
export function defaultWeaponTarget(planner: PlannerData, key: string, current: WeaponState) {
  const weapon = planner.weapons.get(key)
  const top = (weapon?.ascension.length ?? 7) - 1
  return {
    level: weapon?.maxLevel ?? 90,
    ascension: top,
    refinement: current.refinement,
    active: true,
  } satisfies WeaponTarget
}

/** "Lv 80" or "Lv 80+" (ascended at the cap, ready for the next band). */
export function levelLabel(
  planner: PlannerData,
  kind: 'character' | 'weapon',
  key: string,
  level: number,
  ascension: number,
): string {
  const phases =
    kind === 'character'
      ? planner.characters.get(key)?.ascension
      : planner.weapons.get(key)?.ascension
  const capBelow = ascension > 0 ? phases?.[ascension - 1]?.cap : undefined
  const ascended = capBelow === level && phases?.[ascension]?.cap !== level
  return `${level}${ascended ? '+' : ''}`
}
