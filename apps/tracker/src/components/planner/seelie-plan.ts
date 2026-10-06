/**
 * What a Seelie import writes, section by section, pure: the file as read
 * (`parseSeelie`, mapping in @/data/seelie, seelie-items, @/data/seelie-extras)
 * against the account now, with each section opt-in.
 *
 * - goals: character level/talent goals, weapon goals (file order; matched
 *   to the stored ones of a weapon and owner in order, so the same file twice
 *   changes nothing) and extra item needs. The tracker's own fields (notes,
 *   favourites, priorities, constellation, artifact goals) stay as stored.
 * - artifacts: Seelie's artifact goals onto the character goals (a character
 *   with only an artifact goal gets a goal at its current levels).
 * - customs: Seelie's custom characters with their goals.
 * - current: Seelie's current values as hand-set "Now" states (Phase 1
 *   rules: only where ahead of the capture), and its constellations.
 * - inventory: Seelie's counts as hand edits on top of the newest capture
 *   (a count equal to the capture's drops the edit).
 * - tasks: Seelie's custom tasks (`seelie<n>`, so a re-import updates them)
 *   and the permanent ones it has done or snoozed.
 * - resin: its tracker's value, when it is newer than ours.
 * - settings: AR, World Level, the Traveler and the server.
 */

import type { PlannerData } from '@gdt/game-data'
import { raiseForTalents } from '@gdt/game-data/planner-goals'
import {
  NEW_CHARACTER,
  findCharacterState,
  findWeaponState,
  type CharacterState,
} from '@gdt/game-data/planner-math'
import type {
  CharacterCurrent,
  CharacterTarget,
  CustomTarget,
  GenshinServer,
  Good,
  InventoryChange,
  ManualResin,
  PlannerTarget,
  PlannerTask,
  PlannerTaskInput,
  WeaponCurrent,
  WeaponTarget,
  currentOverride,
} from '@gdt/shared'
import type { z } from 'zod'
import { mapSeelieGoals, type SeelieContext, type SeelieImport } from '@/data/seelie'
import {
  mapSeelieResin,
  mapSeelieSettings,
  mapSeelieTasks,
  type SeelieSettings,
  type SeelieTasks,
} from '@/data/seelie-extras'
import { characterGoalId, customGoalId, itemGoalId, targetId, weaponGoalId } from './goal-ids'
import { characterNow, countChange, weaponNow } from './hand-edits'
import { isCustomKey } from './custom-character'
import type { ResinReading } from './resin'
import {
  mapSeelieInventory,
  mapSeelieItems,
  matchWeaponGoals,
  type SeelieItems,
  type SeeliePlanner,
} from './seelie-items'
import type { TargetInput, TargetRef } from './model'

/** A current state to write (as the planner-state store takes it). */
type CurrentChange = z.input<typeof currentOverride>

export const SEELIE_SECTIONS = [
  'goals',
  'artifacts',
  'customs',
  'current',
  'inventory',
  'tasks',
  'resin',
  'settings',
] as const
export type SeelieSection = (typeof SEELIE_SECTIONS)[number]
export type SeeliePicks = Record<SeelieSection, boolean>

/** The file, read. */
export interface SeelieParsed {
  goals: SeelieImport
  items: SeelieItems
  inventory: SeelieItems
  tasks: SeelieTasks
  resin: ManualResin | null
  settings: SeelieSettings
}

type Planner = PlannerData & SeeliePlanner

/** Reads a Seelie export (throws when it isn't one). Talents the target ascension can't reach raise it. */
export function parseSeelie(
  json: unknown,
  planner: Planner,
  context: SeelieContext,
  server: string | null,
  now: number,
): SeelieParsed {
  const goals = mapSeelieGoals(json, planner, context)
  const raise = <T extends { key: string; target: CharacterState }>(c: T, phasesOf?: string): T => {
    const phases = planner.characters.get(phasesOf ?? c.key)?.ascension
    return phases
      ? { ...c, target: raiseForTalents(phases, c.target, planner.talentAscension).target }
      : c
  }
  // Every character has the same level caps: a custom one borrows any.
  const anyCharacter = planner.characters.keys().next().value
  return {
    goals: {
      ...goals,
      characters: goals.characters.map((c) => raise(c)),
      customs: goals.customs.map((c) => raise(c, anyCharacter)),
    },
    items: mapSeelieItems(json, planner),
    inventory: mapSeelieInventory(json, planner),
    tasks: mapSeelieTasks(json, server, now),
    resin: mapSeelieResin(json),
    settings: mapSeelieSettings(json),
  }
}

/** The account now, as the import compares and writes against it. */
export interface SeelieAccount {
  /** The newest capture (characters, weapons; its materials are the capture's counts). */
  capture: Pick<Good, 'characters' | 'weapons' | 'materials'>
  /** The planner's bag: the capture with the hand edits. */
  bag: Readonly<Record<string, number>>
  targets: readonly PlannerTarget[]
  /** Hand-set current states by goal id. */
  overrides: ReadonlyMap<string, CharacterCurrent | WeaponCurrent>
  tasks: readonly PlannerTask[]
  /** The resin the tracker counts from now. */
  resin: ResinReading | null
  /** AR and World Level as the planner uses them (the setting, else irminsul's). */
  settings: { ar: number | null; wl: number | null; traveler: 'F' | 'M' }
  server: GenshinServer | null
  /** A new weapon goal's id (tests pass a counter). */
  newId: () => string
}

export type SeelieOp = { kind: 'upsert'; input: TargetInput } | { kind: 'remove'; ref: TargetRef }

export interface SeelieWrites {
  targets: SeelieOp[]
  current: CurrentChange[]
  inventory: InventoryChange[]
  tasks: PlannerTaskInput[]
  /** A hand-set resin value (none: unchanged). */
  resin?: ManualResin
  settings: { ar?: number; wl?: number }
  traveler?: 'F' | 'M'
  server?: GenshinServer
}

export interface SectionSummary {
  /** Entries the file has for it. */
  total: number
  added: number
  changed: number
  same: number
  /** Short facts for its row ("AR 60 · WL 8"). */
  facts: string[]
}

export interface SeeliePlan {
  writes: SeelieWrites
  sections: Record<SeelieSection, SectionSummary>
  /** Stored goals the file doesn't have (what "Replace" removes). */
  dropped: PlannerTarget[]
  /** Slugs and keys that mapped to nothing. */
  unmapped: string[]
  /** Targets lowered to level 90. */
  clamped: number
}

/** Key order doesn't matter: the server answers with targets as stored. */
const canon = (value: unknown) =>
  JSON.stringify(value, (_, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  )
const same = (a: unknown, b: unknown) => canon(a) === canon(b)

const tally = () => ({ total: 0, added: 0, changed: 0, same: 0, facts: [] as string[] })
function count(s: SectionSummary, before: unknown, after: unknown) {
  s.total++
  if (before === undefined) s.added++
  else if (same(before, after)) s.same++
  else s.changed++
}

const levels = (state: CharacterState) => ({
  level: state.level,
  ascension: state.ascension,
  talents: { ...state.talents },
})

/** What the import writes with `picks` (and `replace`: remove the stored goals the file lacks). */
export function planSeelie(
  parsed: SeelieParsed,
  account: SeelieAccount,
  picks: SeeliePicks,
  replace = false,
): SeeliePlan {
  const stored = new Map(account.targets.map((t) => [targetId(t), t]))
  const sections = Object.fromEntries(SEELIE_SECTIONS.map((s) => [s, tally()])) as Record<
    SeelieSection,
    SectionSummary
  >
  const writes: SeelieWrites = { targets: [], current: [], inventory: [], tasks: [], settings: {} }
  const g = parsed.goals
  /** Goal ids there will be after the import (current states land only on those). */
  const kept = new Set(stored.keys())
  const captured = (key: string) => findCharacterState(account.capture.characters, key).state
  const capturedCons = (key: string) =>
    account.capture.characters.find((c) => c.key === key)?.constellation ?? 0

  // ---------------------------------------------------------- characters

  for (const c of g.characters) {
    const id = characterGoalId(c.key)
    const before = stored.get(id)
    const keep = before?.kind === 'character' ? before.target : null
    const own = {
      note: keep?.note ?? c.note,
      favorite: keep?.favorite,
      priority: keep?.priority,
      constellation: keep?.constellation,
      artifacts: keep?.artifacts,
    }
    const fromGoals: CharacterTarget = { ...c.target, ...own }
    if (c.levelGoal) count(sections.goals, keep ?? undefined, fromGoals)
    if (c.artifacts) count(sections.artifacts, keep?.artifacts, c.artifacts)

    let next: CharacterTarget | null =
      picks.goals && c.levelGoal
        ? fromGoals
        : keep
          ? { ...keep }
          : picks.artifacts && c.artifacts
            ? { ...levels(captured(c.key)), active: true }
            : null
    if (!next) continue
    if (picks.artifacts && c.artifacts) next = { ...next, artifacts: c.artifacts }
    if (
      picks.current &&
      c.constellation !== undefined &&
      c.constellation > Math.max(capturedCons(c.key), next.constellation ?? 0)
    ) {
      next = { ...next, constellation: c.constellation }
    }
    kept.add(id)
    if (!keep || !same(keep, next)) {
      writes.targets.push({
        kind: 'upsert',
        input: { kind: 'character', key: c.key, target: next },
      })
    }
  }

  // ---------------------------------------------------------- custom characters

  for (const c of g.customs) {
    const id = customGoalId(c.key)
    const before = stored.get(id)
    const keep = before?.kind === 'custom' ? before.target : null
    const next: CustomTarget = {
      ...c.target,
      note: keep?.note ?? c.note,
      favorite: keep?.favorite,
      priority: keep?.priority,
      constellation: keep?.constellation,
      artifacts: picks.artifacts && c.artifacts ? c.artifacts : keep?.artifacts,
      custom: c.custom,
    }
    count(sections.customs, keep ?? undefined, next)
    if (c.artifacts) count(sections.artifacts, keep?.artifacts, c.artifacts)
    if (!picks.customs) continue
    kept.add(id)
    if (!keep || !same(keep, next)) {
      writes.targets.push({ kind: 'upsert', input: { kind: 'custom', key: c.key, target: next } })
    }
  }

  // ---------------------------------------------------------- weapons

  const storedWeapons = account.targets.flatMap((t) => (t.kind === 'weapon' ? [t] : []))
  const matched = matchWeaponGoals(g.weapons, storedWeapons)
  const owners = new Set([...kept].map((k) => k.replace(/^(character|custom):/, '')))
  const weaponIds: (string | null)[] = []
  g.weapons.forEach((w, i) => {
    // A custom owner that won't be there: a spare.
    const owner = isCustomKey(w.owner) && !owners.has(w.owner) ? '' : w.owner
    const goalId = matched[i] ?? null
    const before = goalId
      ? storedWeapons.find((t) => t.id === goalId && t.key === w.key && t.owner === owner)
      : undefined
    const next: WeaponTarget = {
      ...w.target,
      note: before?.target.note,
      priority: before?.target.priority,
    }
    count(sections.goals, before?.target, next)
    if (!picks.goals) {
      weaponIds.push(goalId)
      return
    }
    const id = goalId ?? account.newId()
    weaponIds.push(id)
    kept.add(weaponGoalId(w.key, owner, id))
    if (!before || !same(before.target, next)) {
      writes.targets.push({
        kind: 'upsert',
        input: { kind: 'weapon', id, key: w.key, owner, target: next },
      })
    }
  })

  // ---------------------------------------------------------- item needs

  for (const item of parsed.items.items) {
    const before = stored.get(itemGoalId(item.key))
    const keep = before?.kind === 'item' ? before.target : null
    const next = { count: item.count, active: keep?.active ?? true, note: keep?.note }
    count(sections.goals, keep ?? undefined, next)
    if (!picks.goals) continue
    kept.add(itemGoalId(item.key))
    if (!keep || !same(keep, next)) {
      writes.targets.push({ kind: 'upsert', input: { kind: 'item', key: item.key, target: next } })
    }
  }

  const incoming = new Set<string>([
    ...g.characters.map((c) => characterGoalId(c.key)),
    ...(picks.customs ? g.customs.map((c) => customGoalId(c.key)) : []),
    ...parsed.items.items.map((i) => itemGoalId(i.key)),
  ])
  for (const id of kept) if (id.startsWith('weapon:')) incoming.add(id)
  const dropped = account.targets.filter(
    (t) => !incoming.has(targetId(t)) && (t.kind !== 'custom' || picks.customs),
  )
  if (picks.goals && replace) {
    for (const t of dropped) {
      writes.targets.unshift({
        kind: 'remove',
        ref:
          t.kind === 'weapon'
            ? { kind: 'weapon', key: t.key, owner: t.owner, id: t.id }
            : { kind: t.kind, key: t.key },
      })
      kept.delete(targetId(t))
    }
  }

  // ---------------------------------------------------------- current values

  const current = sections.current
  const nowOf = (kind: 'character' | 'custom', key: string, state: CharacterState) => {
    const id = kind === 'character' ? characterGoalId(key) : customGoalId(key)
    const capture = kind === 'character' ? captured(key) : NEW_CHARACTER
    const shown = characterNow(capture, state)
    if (!shown.edited) return
    const value = levels(state)
    const before = account.overrides.get(id)
    count(current, before, value)
    if (!picks.current || !kept.has(id) || (before && same(before, value))) return
    writes.current.push({ kind, key, current: value })
  }
  for (const c of g.characters) if (c.current) nowOf('character', c.key, c.current)
  for (const c of g.customs) if (c.current && picks.customs) nowOf('custom', c.key, c.current)
  g.weapons.forEach((w, i) => {
    const id = weaponIds[i]
    if (!w.current || !id) return
    const owner = isCustomKey(w.owner) && !owners.has(w.owner) ? '' : w.owner
    const capture = findWeaponState(account.capture.weapons, w.key, owner).state
    if (!weaponNow(capture, w.current).edited) return
    const goal = weaponGoalId(w.key, owner, id)
    const before = account.overrides.get(goal)
    count(current, before, w.current)
    if (!picks.current || !kept.has(goal) || (before && same(before, w.current))) return
    writes.current.push({ kind: 'weapon', id, key: w.key, owner, current: { ...w.current } })
  })

  // ---------------------------------------------------------- inventory

  const inventory = sections.inventory
  for (const { key, count: n } of parsed.inventory.items) {
    inventory.total++
    const have = Math.max(0, account.bag[key] ?? 0)
    if (have === n) {
      inventory.same++
      continue
    }
    if (key in account.bag) inventory.changed++
    else inventory.added++
    if (picks.inventory) {
      writes.inventory.push(countChange(key, n, account.capture.materials[key] ?? 0))
    }
  }

  // ---------------------------------------------------------- tasks

  const tasks = sections.tasks
  const storedTasks = new Map(account.tasks.map((t) => [`${t.kind}:${t.id}`, t]))
  const lastPosition = Math.max(
    0,
    ...account.tasks.map((t) => (t.kind === 'custom' ? (t.position ?? 0) : 0)),
  )
  // A task the file names by Seelie's number is that one; else one of ours with its name (an
  // export of ours read back numbers our tasks anew), else a new one.
  const customTasks = account.tasks.flatMap((t) => (t.kind === 'custom' ? [t] : []))
  const claimed = new Set(
    parsed.tasks.custom.flatMap((t) => (storedTasks.has(`custom:${t.id}`) ? [t.id] : [])),
  )
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  for (const t of parsed.tasks.custom) {
    let before = storedTasks.get(`custom:${t.id}`)
    if (!before) {
      before = customTasks.find((c) => !claimed.has(c.id) && sameName(c.task.name, t.task.name))
      if (before) claimed.add(before.id)
    }
    const keep = before?.kind === 'custom' ? before : null
    const next: PlannerTaskInput = {
      kind: 'custom',
      id: keep?.id ?? t.id,
      task: t.task,
      due: t.due,
      position: keep?.position ?? lastPosition + 1 + t.position,
    }
    count(tasks, keep ? { task: keep.task, due: keep.due } : undefined, {
      task: t.task,
      due: t.due,
    })
    if (
      picks.tasks &&
      (!keep || !same({ task: keep.task, due: keep.due }, { task: t.task, due: t.due }))
    ) {
      writes.tasks.push(next)
    }
  }
  for (const t of parsed.tasks.builtin) {
    const before = storedTasks.get(`builtin:${t.id}`)
    const keep = before?.kind === 'builtin' ? before : null
    count(tasks, keep?.next ?? undefined, t.next)
    if (picks.tasks && keep?.next !== t.next) {
      writes.tasks.push({
        kind: 'builtin',
        id: t.id,
        next: t.next,
        ...(keep?.hidden ? { hidden: true } : {}),
      })
    }
  }
  const events = parsed.tasks.skipped.length
  if (events) tasks.facts.push(`${events} ${events === 1 ? 'event' : 'events'} left out`)

  // ---------------------------------------------------------- resin

  const resin = parsed.resin
  if (resin) {
    const ours = account.resin
    sections.resin.total = 1
    if (ours && ours.at >= resin.at) sections.resin.facts.push('older than ours')
    else {
      sections.resin.changed = ours ? 1 : 0
      sections.resin.added = ours ? 0 : 1
      if (picks.resin) writes.resin = resin
    }
  }

  // ---------------------------------------------------------- settings

  const s = parsed.settings
  const set = sections.settings
  const fact = (label: string, differs: boolean) => {
    set.total++
    if (differs) set.changed++
    else set.same++
    set.facts.push(label)
  }
  if (s.ar !== undefined) {
    fact(`AR ${s.ar}`, s.ar !== account.settings.ar)
    if (picks.settings && s.ar !== account.settings.ar) writes.settings.ar = s.ar
  }
  if (s.wl !== undefined) {
    fact(`WL ${s.wl}`, s.wl !== account.settings.wl)
    if (picks.settings && s.wl !== account.settings.wl) writes.settings.wl = s.wl
  }
  if (s.server !== undefined) {
    fact(SERVER_NAMES[s.server], s.server !== account.server)
    if (picks.settings && s.server !== account.server) writes.server = s.server
  }
  if (s.traveler !== undefined) {
    fact(s.traveler === 'F' ? 'Lumine' : 'Aether', s.traveler !== account.settings.traveler)
    if (picks.settings && s.traveler !== account.settings.traveler) writes.traveler = s.traveler
  }

  return {
    writes,
    sections,
    dropped,
    unmapped: [
      ...g.unmapped.characters,
      ...g.unmapped.weapons,
      ...g.unmapped.artifacts,
      ...g.unmapped.other,
      ...parsed.items.unmapped,
      ...parsed.inventory.unmapped,
    ],
    clamped: g.clamped,
  }
}

const SERVER_NAMES: Record<GenshinServer, string> = {
  AMERICA: 'America',
  EUROPE: 'Europe',
  ASIA: 'Asia',
  SAR: 'TW, HK, MO',
}

/** Whether a section has anything to write (its checkbox can do something). */
export function sectionHasChanges(s: SectionSummary): boolean {
  return s.added + s.changed > 0
}

/**
 * Sections ticked when a file is read: those with changes, but not the
 * settings when irminsul already says AR and World Level (a Seelie value
 * would override them for good), nor the server when the account has one.
 */
export function defaultPicks(
  plan: SeeliePlan,
  account: { irminsulAr: boolean; server: GenshinServer | null },
): SeeliePicks {
  const picks = Object.fromEntries(
    SEELIE_SECTIONS.map((s) => [s, sectionHasChanges(plan.sections[s])]),
  ) as SeeliePicks
  if (account.irminsulAr || account.server !== null) picks.settings = false
  return picks
}
