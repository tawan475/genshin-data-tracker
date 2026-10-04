/**
 * The Planner page's model: stored targets joined with the newest snapshot
 * (current levels, talents, weapons) and the planner data, each goal's cost
 * memoised (`createRequirementCache`). Costs, totals, conversions and
 * estimates come from `@gdt/game-data` (planner-math, planner-goals,
 * planner-estimate); this file only shapes them for the page. Pure
 * functions; the view keeps them in computed()s.
 */

import type { PlannerData, PlannerMaterial, WeaponType } from '@gdt/game-data'
import {
  nextCharacterStep,
  nextWeaponStep,
  raiseForTalents,
  type NextStep,
} from '@gdt/game-data/planner-goals'
import {
  boostedTalents,
  createRequirementCache,
  emptyRequirement,
  findCharacterState,
  findWeaponState,
  isDone,
  itemGoal,
  passiveDiscount,
  planTotals,
  type CharacterState,
  type PlanGoal,
  type PlanOptions,
  type Requirement,
  type Talents,
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
import { formatNumber, keyToName } from '@/lib/format'

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
  /** Constellation now (0 when not owned). */
  constellation: number
  /** Talent levels as the game shows them with C3/C5 (current and target). */
  boosted: { current: Talents; target: Talents }
  /** The stored target, made valid (`raiseForTalents`). */
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
    ? raiseForTalents(data.ascension, stored, planner.talentAscension)
    : { target: stored, raised: null }
  const requirement = cache.character(key, state, target)
  const constellation = good.characters.find((c) => c.key === key)?.constellation ?? 0
  return {
    id: characterGoalId(key),
    key,
    name: characterName(key),
    rarity: data?.rarity ?? null,
    element: data?.element ? (ELEMENTS[data.element] ?? null) : null,
    weapon: data?.weapon ?? null,
    owned,
    current: state,
    constellation,
    boosted: {
      current: boostedTalents(planner, key, state.talents, constellation),
      target: boostedTalents(planner, key, target.talents, constellation),
    },
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

  const pendingAr = (x: { done: boolean; requirement: Requirement | null }) =>
    x.done ? 0 : (x.requirement?.ar ?? 0)
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
        ar: pendingAr(w),
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
      ar: Math.max(pendingAr(c), ...weapons.map(pendingAr)),
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
  for (const i of items) goals.push(itemGoal(planner, i.key, i.target))
  return { entries, items, goals, characterGoals, weaponGoals }
}

// ------------------------------------------------------------ whole subjects

/**
 * Several requirements as one (a character with its weapons): summed, with
 * each weapon's Mora passive already taken off (`owned`: the characters
 * whose passives apply), since the merged one has no weapon type.
 */
export function mergeRequirements(
  planner: PlannerData,
  list: readonly Requirement[],
  owned: ReadonlySet<string> | null,
): Requirement {
  const merged = emptyRequirement()
  merged.ar = 0
  for (const r of list) {
    for (const [key, count] of r.items) merged.items.set(key, (merged.items.get(key) ?? 0) + count)
    merged.mora += r.mora - (owned ? passiveDiscount(planner, r, owned).mora : 0)
    merged.characterExp += r.characterExp
    merged.weaponExp += r.weaponExp
    merged.ar = Math.max(merged.ar, r.ar ?? 0)
  }
  return merged
}

/** Planner options without the passives (for a merged requirement, see mergeRequirements). */
export function withoutPassives(options: PlanOptions): PlanOptions {
  return { ...options, passives: null }
}

/** A goal card's requirements as one goal (id = the entry's). */
export function entryGoal(
  planner: PlannerData,
  entry: GoalEntry,
  owned: ReadonlySet<string> | null,
): PlanGoal | null {
  const list = [entry.character, ...entry.weapons].flatMap((x) =>
    x?.requirement ? [x.requirement] : [],
  )
  if (list.length === 0) return null
  return { id: entry.id, requirement: mergeRequirements(planner, list, owned) }
}

/**
 * How many things (materials, EXP, Mora) the stock is short of for one goal
 * on its own, crafting and conversions included: 0 means it can be done now.
 */
export function shortCount(
  planner: PlannerData,
  goal: PlanGoal,
  inventory: Readonly<Record<string, number>>,
  options: PlanOptions,
): number {
  const alone = planTotals(planner, [{ ...goal, active: true }], inventory, options)
  let short = [...alone.lines.values()].filter((l) => l.missing > 0 && l.need > 0).length
  if (alone.mora.missing > 0) short++
  if (alone.characterExp.missing > 0) short++
  if (alone.weaponExp.missing > 0) short++
  return short
}

// ------------------------------------------------------------ next step

export interface NextHint {
  /** "Lv 70+ · 6/8/8", "Lv 80" */
  text: string
  title: string
}

/**
 * What a goal card can level right now (`nextCharacterStep` /
 * `nextWeaponStep`), when that is part of the goal but not all of it; null
 * when nothing is affordable yet or all of it is (the card shows "In stock").
 */
export function nextHint(
  planner: PlannerData,
  entry: GoalEntry,
  inventory: Readonly<Record<string, number>>,
  options: PlanOptions & { ar?: number | null },
): NextHint | null {
  if (entry.done) return null
  const parts: string[] = []
  const details: string[] = []
  const stops = new Set<'stock' | 'ar'>()
  let full = true
  const note = <S>(step: NextStep<S> | null) => {
    if (!step) {
      full = false
      return false
    }
    if (!step.full) full = false
    if (step.stop) stops.add(step.stop)
    return true
  }

  const c = entry.character
  if (c && !c.done) {
    const step = nextCharacterStep(planner, c.key, c.current, c.target, inventory, options)
    if (note(step) && step) {
      const s = step.state
      const levelUp = s.level > c.current.level || s.ascension > c.current.ascension
      const talentsUp = (['auto', 'skill', 'burst'] as const).some(
        (t) => s.talents[t] > c.current.talents[t],
      )
      if (levelUp) parts.push(`Lv ${levelLabel(planner, 'character', c.key, s.level, s.ascension)}`)
      if (talentsUp) parts.push(`${s.talents.auto}/${s.talents.skill}/${s.talents.burst}`)
      details.push(
        `${c.name}: Lv ${s.level} (A${s.ascension}), talents ${s.talents.auto}/${s.talents.skill}/${s.talents.burst}`,
      )
    }
  }
  for (const w of entry.weapons) {
    if (w.done) continue
    const step = nextWeaponStep(planner, w.key, w.current, w.target, inventory, options)
    if (note(step) && step) {
      const label = levelLabel(planner, 'weapon', w.key, step.state.level, step.state.ascension)
      if (!c) parts.push(`Lv ${label}`)
      details.push(`${w.name}: Lv ${step.state.level} (A${step.state.ascension})`)
    }
  }
  if (details.length === 0 || full) return null
  const then = stops.has('ar')
    ? `then AR ${formatNumber(entry.ar)}`
    : stops.has('stock')
      ? 'then short of materials'
      : ''
  return {
    text: parts.length ? parts.join(' · ') : 'Weapon',
    title: ['Can level now', ...details, then].filter(Boolean).join(' · '),
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
