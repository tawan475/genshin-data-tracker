/**
 * A paimon.moe backup as a planner import, pure: its to-do list and settings
 * read into the shape a Seelie import has (`SeelieParsed`), so the same
 * plan (`planSeelie`: new / changed / same per section, each opt-in) and
 * dialog apply it.
 *
 * What overlaps (@/data/paimon-backup reads the file):
 * - goals: each character to-do as a level goal (the highest per
 *   character), each weapon to-do as a weapon goal, the item to-dos as
 *   extra item needs. paimon.moe keeps a to-do's levels and materials, not
 *   its ascension or talent levels: the ascension is the one whose
 *   ascension materials match what the to-do asked for (at a level cap,
 *   ascended or not), and talents stay as the stored goal has them (else as
 *   they are now).
 * - settings: AR, World Level and server.
 * Its achievements import on the Achievements page; its wish history on
 * Wishes. Characters and weapons it lists as owned come from captures here.
 */

import type { AscensionPhase, PlannerData } from '@gdt/game-data'
import { ascensionForLevel, normalizeLevel, type CharacterState } from '@gdt/game-data/planner-math'
import { paimonSettings, paimonTodos, type PaimonLevelTodo } from '@/data/paimon-backup'
import { seelieKeys, type SeelieCharacter, type SeelieWeapon } from '@/data/seelie'
import { slugLetters } from './seelie-slugs'
import type { SeelieParsed } from './seelie-plan'

type Planner = Pick<PlannerData, 'characters' | 'weapons' | 'materialsByKey' | 'mora'>

export interface PaimonContext {
  /** Current state of a character (level 1 when not owned). */
  character(key: string): CharacterState
  /** Current refinement of a spare copy of a weapon (1 when not owned). */
  refinement(key: string): number
  /** Talent levels of the stored goal for a character, if it has one. */
  goalTalents(key: string): CharacterState['talents'] | null
}

/** paimon.moe item id ("heros_wit") -> GOOD key, by letters and digits. */
function materialKeys(planner: Planner): (id: string) => string | null {
  const index = new Map<string, string>()
  for (const key of planner.materialsByKey.keys()) index.set(slugLetters(key), key)
  index.set(slugLetters(planner.mora.key), planner.mora.key)
  return (id) => index.get(slugLetters(id)) ?? null
}

/**
 * Level and ascension a to-do aims at. paimon.moe saves `from` and `to`
 * levels only; at a level cap (80) the goal may be ascended or not, and the
 * start too. The pair whose ascension materials (those talents don't use)
 * add up to what the to-do asked for wins; with none, the lowest.
 */
export function todoLevel(
  phases: readonly AscensionPhase[],
  todo: Pick<PaimonLevelTodo, 'from' | 'to'>,
  asked: ReadonlyMap<string, number>,
  talentKeys: ReadonlySet<string> = new Set(),
): { level: number; ascension: number } {
  const lowest = normalizeLevel(phases, todo.to, 0)
  const options = (level: number) => {
    const asc = ascensionForLevel(phases, level)
    return phases[asc]?.cap === level && asc + 1 < phases.length ? [asc, asc + 1] : [asc]
  }
  const keys = new Set(
    phases.flatMap((p) => p.items.map((i) => i.material.key)).filter((k) => !talentKeys.has(k)),
  )
  let best: number | null = null
  for (const start of options(todo.from)) {
    for (const end of options(todo.to)) {
      if (end < start) continue
      const sum = new Map<string, number>()
      for (const phase of phases.slice(start + 1, end + 1)) {
        for (const i of phase.items)
          sum.set(i.material.key, (sum.get(i.material.key) ?? 0) + i.count)
      }
      const matches = [...keys].every((k) => (sum.get(k) ?? 0) === (asked.get(k) ?? 0))
      if (matches && (best === null || end > best)) best = end
    }
  }
  return best === null ? lowest : normalizeLevel(phases, todo.to, best)
}

/** Reads one account (`prefix`) of a paimon.moe backup as an import. */
export function parsePaimon(
  json: Record<string, unknown>,
  prefix: string,
  planner: Planner,
  context: PaimonContext,
): SeelieParsed {
  const keys = seelieKeys(planner)
  const material = materialKeys(planner)
  const todos = paimonTodos(json, prefix)
  const unmapped = { characters: new Set<string>(), weapons: new Set<string>() }
  const other = new Set<string>()
  const read = { character: 0, talent: 0, weapon: 0, artifact: 0, other: todos.anonymous }

  const asked = (todo: PaimonLevelTodo) => {
    const map = new Map<string, number>()
    for (const [id, n] of Object.entries(todo.original)) {
      const key = material(id)
      if (key) map.set(key, (map.get(key) ?? 0) + n)
    }
    return map
  }

  // Characters: the highest goal per character.
  const characters = new Map<string, SeelieCharacter>()
  const weapons: SeelieWeapon[] = []
  for (const todo of todos.levels) {
    if (todo.type === 'character') {
      read.character++
      const key = keys.character(todo.id)
      const data = key ? planner.characters.get(key) : undefined
      if (!key || !data) {
        unmapped.characters.add(todo.id)
        continue
      }
      const talentKeys = new Set(
        Object.values(data.talents).flatMap((levels) =>
          levels.flatMap((l) => l.items.map((i) => i.material.key)),
        ),
      )
      const lv = todoLevel(data.ascension, todo, asked(todo), talentKeys)
      const before = characters.get(key)
      if (
        before &&
        (before.target.ascension > lv.ascension ||
          (before.target.ascension === lv.ascension && before.target.level >= lv.level))
      ) {
        continue
      }
      const talents = context.goalTalents(key) ?? context.character(key).talents
      characters.set(key, {
        key,
        levelGoal: true,
        target: { ...lv, talents: { ...talents }, active: true },
      })
      continue
    }
    read.weapon++
    const key = keys.weapon(todo.id)
    const data = key ? planner.weapons.get(key) : undefined
    if (!key || !data) {
      unmapped.weapons.add(todo.id)
      continue
    }
    const lv = todoLevel(data.ascension, todo, asked(todo))
    const refinement = Math.max(1, Math.min(5, context.refinement(key)))
    weapons.push({ key, owner: '', target: { ...lv, refinement, active: true } })
  }

  const items = new Map<string, number>()
  for (const [id, n] of Object.entries(todos.items)) {
    const key = material(id)
    if (!key) {
      other.add(id)
      continue
    }
    items.set(key, (items.get(key) ?? 0) + n)
  }

  return {
    goals: {
      characters: [...characters.values()],
      customs: [],
      weapons,
      unmapped: {
        characters: [...unmapped.characters].sort(),
        weapons: [...unmapped.weapons].sort(),
        artifacts: [],
        other: [],
      },
      read,
      clamped: 0,
    },
    items: {
      items: [...items].map(([key, count]) => ({ key, count })),
      unmapped: [...other].sort(),
    },
    inventory: { items: [], unmapped: [] },
    tasks: { custom: [], builtin: [], skipped: [] },
    resin: null,
    settings: paimonSettings(json, prefix),
  }
}
