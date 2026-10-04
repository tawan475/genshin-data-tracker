/**
 * The Planner page's model: stored targets joined with the newest snapshot
 * (current levels, talents, weapons) and the planner data, each goal's cost
 * memoised (`createRequirementCache`), plus the totals and farming groups
 * from `@gdt/game-data/planner-math`. Pure functions; the view keeps them in
 * computed()s.
 */

import type { AscensionPhase, PlannerData, PlannerMaterial, WeaponType } from '@gdt/game-data'
import {
  createRequirementCache,
  emptyRequirement,
  findCharacterState,
  findWeaponState,
  isDone,
  normalizeLevel,
  planTotals,
  talentCap,
  TALENTS,
  type CharacterState,
  type PlanGoal,
  type Requirement,
  type WeaponState,
} from '@gdt/game-data/planner-math'
import type {
  CharacterTarget,
  Good,
  ItemTarget,
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

/** What the editor dialog is open on (`?goal=` in the URL). */
export type EditorSubject =
  | { kind: 'character'; key: string }
  | { kind: 'weapon'; key: string; owner: string }
  | { kind: 'item'; key: string }

export const characterGoalId = (key: string) => `character:${key}`
export const weaponGoalId = (key: string, owner: string) => `weapon:${key}:${owner}`
export const itemGoalId = (key: string) => `item:${key}`

export function targetId(t: { kind: PlannerTarget['kind']; key: string; owner?: string }) {
  if (t.kind === 'character') return characterGoalId(t.key)
  if (t.kind === 'item') return itemGoalId(t.key)
  return weaponGoalId(t.key, t.owner ?? '')
}

/** A stored target as a removal. */
export function refOf(t: PlannerTarget): TargetRef {
  return t.kind === 'weapon'
    ? { kind: 'weapon', key: t.key, owner: t.owner }
    : { kind: t.kind, key: t.key }
}

/** A stored target as an upsert (to put it back). */
export function inputOf(t: PlannerTarget): TargetInput {
  if (t.kind === 'character') return { kind: 'character', key: t.key, target: t.target }
  if (t.kind === 'item') return { kind: 'item', key: t.key, target: t.target }
  return { kind: 'weapon', key: t.key, owner: t.owner, target: t.target }
}

export type RequirementCache = ReturnType<typeof createRequirementCache>

// ------------------------------------------------------------ valid goals

/** Adventure Rank each ascension phase needs (characters and weapons alike). */
const AR_BY_ASCENSION = [0, 15, 25, 30, 35, 40, 50] as const

export function arForAscension(ascension: number): number {
  return AR_BY_ASCENSION[Math.max(0, Math.min(6, ascension))] ?? 0
}

/** The lowest ascension whose talent cap allows talent `level`. */
export function ascensionForTalent(level: number): number {
  for (let a = 0; a < 6; a++) if (talentCap(a) >= level) return a
  return 6
}

/**
 * A character target the game allows: the ascension raised to what its
 * talents need (and the level with it, to that phase's starting cap).
 * `raised` is the ascension it took, or null when it was already valid.
 */
export function validCharacterTarget(
  phases: readonly AscensionPhase[],
  target: CharacterTarget,
): { target: CharacterTarget; raised: number | null } {
  const top = Math.max(...TALENTS.map((t) => target.talents[t]))
  const need = ascensionForTalent(top)
  if (need <= target.ascension || need >= phases.length) return { target, raised: null }
  const lv = normalizeLevel(phases, Math.max(target.level, phases[need - 1]!.cap), need)
  return { target: { ...target, ...lv }, raised: need }
}

// ------------------------------------------------------------ goal views

export interface WeaponGoalView {
  id: string
  key: string
  owner: string
  name: string
  rarity: number | null
  type: WeaponType | null
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
  weapon: WeaponType | null
  owned: boolean
  current: CharacterState
  /** The stored target, made valid (`validCharacterTarget`). */
  target: CharacterTarget
  /** Ascension the stored target was raised to for its talents, else null. */
  raised: number | null
  requirement: Requirement | null
  done: boolean
}

/** An extra need for one material (Seelie's custom items). */
export interface ItemGoalView {
  id: string
  key: string
  /** Null for a key the planner data doesn't know. */
  material: PlannerMaterial | null
  name: string
  target: ItemTarget
  have: number
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
  /** The character's, or the weapon's on a weapon-only card. */
  note: string
  favorite: boolean
  priority: number | null
  element: Element | null
  weaponType: WeaponType | null
  rarity: number | null
  /** Highest AR a pending ascension of this goal needs (0 when none). */
  ar: number
}

export interface Board {
  entries: GoalEntry[]
  /** Extra item needs, by name. */
  items: ItemGoalView[]
  /** Every goal, for the totals (item needs included). */
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
  stored: CharacterTarget,
): CharacterGoalView {
  const data = planner.characters.get(key)
  const { state, owned } = findCharacterState(good.characters, key)
  const { target, raised } = data
    ? validCharacterTarget(data.ascension, stored)
    : { target: stored, raised: null }
  const requirement = cache.character(key, state, target)
  return {
    id: characterGoalId(key),
    key,
    name: characterName(key),
    rarity: data?.rarity ?? null,
    element: data?.element ? (ELEMENTS[data.element] ?? null) : null,
    weapon: data?.weapon ?? null,
    owned,
    current: state,
    target,
    raised,
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
    type: data?.type ?? null,
    owned,
    current: state,
    target,
    requirement,
    done: (requirement ? isDone(requirement) : false) && state.refinement >= target.refinement,
  }
}

/**
 * What an extra item need costs, as a requirement `planTotals` already
 * counts: Mora and EXP items as Mora and EXP points, anything else as the
 * item. Remove once planTotals takes item needs itself.
 */
export function itemRequirement(planner: PlannerData, key: string, count: number): Requirement {
  const r = emptyRequirement()
  if (key === planner.mora.key) {
    r.mora = count
    return r
  }
  const book = planner.expItems.character.find((i) => i.material.key === key)
  const ore = planner.expItems.weapon.find((i) => i.material.key === key)
  if (book) r.characterExp = book.exp * count
  else if (ore) r.weaponExp = ore.exp * count
  else r.items.set(key, count)
  return r
}

/** AR the pending ascensions need: the target's, when it is above the current one. */
const arNeeded = (current: { ascension: number }, target: { ascension: number }) =>
  target.ascension > current.ascension ? arForAscension(target.ascension) : 0

/** Joins the targets with the inventory; characters by name, done ones last. */
export function buildBoard(
  planner: PlannerData,
  good: Good,
  targets: readonly PlannerTarget[],
  cache: RequirementCache,
): Board {
  const characterGoals = new Map<string, CharacterGoalView>()
  const weaponGoals = new Map<string, WeaponGoalView>()
  const items: ItemGoalView[] = []
  for (const t of targets) {
    if (t.kind === 'character') {
      characterGoals.set(t.key, characterGoalView(planner, good, cache, t.key, t.target))
    } else if (t.kind === 'weapon') {
      const view = weaponGoalView(planner, good, cache, t.key, t.owner, t.target)
      weaponGoals.set(view.id, view)
    } else {
      const material = planner.materialsByKey.get(t.key) ?? null
      items.push({
        id: itemGoalId(t.key),
        key: t.key,
        material,
        name: material?.name ?? keyToName(t.key),
        target: t.target,
        have: Math.max(0, Math.trunc(good.materials[t.key] ?? 0)),
      })
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name))

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
        note: w.target.note ?? '',
        favorite: false,
        priority: null,
        element: null,
        weaponType: w.type,
        rarity: w.rarity,
        ar: arNeeded(w.current, w.target),
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
      note: c.target.note ?? '',
      favorite: c.target.favorite ?? false,
      priority: c.target.priority ?? null,
      element: c.element,
      weaponType: c.weapon,
      rarity: c.rarity,
      ar: Math.max(
        c.done ? 0 : arNeeded(c.current, c.target),
        ...weapons.map((w) => (w.done ? 0 : arNeeded(w.current, w.target))),
      ),
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
  for (const i of items) {
    if (!i.material) continue
    const requirement = itemRequirement(planner, i.key, i.target.count)
    goals.push({ id: i.id, requirement, active: i.target.active })
  }
  return { entries, items, goals, characterGoals, weaponGoals }
}

// ------------------------------------------------------------ cost status

/**
 * Seelie's three states for a goal's cost: the bag covers it with every
 * other goal counted (`all`), only on its own (`alone`), or not even that.
 */
export type CostStatus = 'all' | 'alone' | 'short'

export interface CostState {
  status: CostStatus
  /** Missing for this goal alone. */
  missing: number
  /** Missing with every counted goal. */
  missingAll: number
  /** Crafted from lower tiers to get there (with every goal when that is enough, else alone). */
  crafted: number
}

export interface CostCheck {
  item(key: string): CostState
  characterExp: CostState
  weaponExp: CostState
  mora: CostState
}

function costState(
  alone: { missing: number; crafted?: number } | undefined,
  all: { missing: number; crafted?: number } | undefined,
): CostState {
  const missing = alone?.missing ?? 0
  const missingAll = all?.missing ?? 0
  return {
    status: missingAll === 0 ? 'all' : missing === 0 ? 'alone' : 'short',
    missing,
    missingAll,
    crafted: (missingAll === 0 ? all?.crafted : alone?.crafted) ?? 0,
  }
}

/** Checks `mine` against the inventory alone and on top of the `others` (crafting included). */
export function costCheck(
  planner: PlannerData,
  mine: readonly Requirement[],
  others: readonly PlanGoal[],
  inventory: Readonly<Record<string, number>>,
): CostCheck {
  const goals = mine.map((requirement, index) => ({ id: `self:${index}`, requirement }))
  const alone = planTotals(planner, goals, inventory)
  const all = planTotals(planner, [...others, ...goals], inventory)
  return {
    item: (key) => costState(alone.lines.get(key), all.lines.get(key)),
    characterExp: costState(alone.characterExp, all.characterExp),
    weaponExp: costState(alone.weaponExp, all.weaponExp),
    mora: costState(alone.mora, all.mora),
  }
}

// ------------------------------------------------------------ defaults

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
