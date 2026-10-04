/**
 * Planner goals from a Seelie export (seelie.me, Settings -> Export Account:
 * `<date>-main-seelie-gi.json`). Seelie stores three kinds of goal:
 *
 * - `{type: "character", character, current: {level, asc}, goal: {level, asc}, id}`
 * - `{type: "talent", character, normal|skill|burst: {current, goal}, id}`
 * - `{type: "weapon", character (owner), weapon, current, goal: {level, asc}, id}`
 *
 * and keys characters and weapons by snake_case slugs ("hu_tao" or "hutao",
 * "freedom-sworn", "traveler_cryo"). Most slugs are the English name, so they
 * map to GOOD keys by comparing letters and digits only; the rest are older
 * names (Raiden is "shogun", Engulfing Lightning "grasscutters_light") kept
 * in the alias tables below. Anything still unknown is reported, not guessed.
 *
 * A character's level and talent goals become one tracker goal. Seelie's own
 * "current" values are ignored: the tracker reads the current state from the
 * newest snapshot. Weapon refinement is not a Seelie goal, so it stays at the
 * current refinement.
 */

import type { PlannerData } from './index'
import {
  normalizeLevel,
  type CharacterGoal,
  type CharacterState,
  type WeaponGoal,
} from './planner-math'

const norm = (slug: string) => slug.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Seelie character slugs that are not the GOOD name (normalised slug -> GOOD key). */
export const SEELIE_CHARACTER_ALIASES: Readonly<Record<string, string>> = {
  shogun: 'RaidenShogun',
  raiden: 'RaidenShogun',
  kazuha: 'KaedeharaKazuha',
  ayaka: 'KamisatoAyaka',
  ayato: 'KamisatoAyato',
  kokomi: 'SangonomiyaKokomi',
  itto: 'AratakiItto',
  sara: 'KujouSara',
  shinobu: 'KukiShinobu',
  heizou: 'ShikanoinHeizou',
  mizuki: 'YumemizukiMizuki',
  yae: 'YaeMiko',
  childe: 'Tartaglia',
  scaramouche: 'Wanderer',
}

/** Seelie weapon slugs that are not the GOOD name (normalised slug -> GOOD key). */
export const SEELIE_WEAPON_ALIASES: Readonly<Record<string, string>> = {
  grasscutterslight: 'EngulfingLightning',
  mistsplittersreflection: 'MistsplitterReforged',
}

export interface SeelieKeys {
  character(slug: string): string | null
  weapon(slug: string): string | null
}

/**
 * Slug -> GOOD key lookups over the planner data: alias, then same letters,
 * then (characters only) the one key that ends with the slug ("kazuha").
 */
export function seelieKeys(planner: Pick<PlannerData, 'characters' | 'weapons'>): SeelieKeys {
  const index = (keys: Iterable<string>) => new Map([...keys].map((key) => [norm(key), key]))
  const characters = index(planner.characters.keys())
  const weapons = index(planner.weapons.keys())
  return {
    character(slug) {
      const n = norm(slug)
      if (!n) return null
      const alias = SEELIE_CHARACTER_ALIASES[n]
      if (alias && planner.characters.has(alias)) return alias
      const exact = characters.get(n)
      if (exact) return exact
      if (n.length < 4) return null
      const endings = [...characters].filter(([key]) => key.endsWith(n))
      return endings.length === 1 ? endings[0]![1] : null
    },
    weapon(slug) {
      const n = norm(slug)
      if (!n) return null
      const alias = SEELIE_WEAPON_ALIASES[n]
      if (alias && planner.weapons.has(alias)) return alias
      return weapons.get(n) ?? null
    },
  }
}

export interface SeelieImport {
  /** One goal per character: Seelie's level and talent goals merged. */
  characters: { key: string; target: CharacterGoal }[]
  /** Weapon goals by (weapon, owner); owner '' when Seelie's owner is unknown. */
  weapons: { key: string; owner: string; target: WeaponGoal }[]
  /** Seelie slugs with no GOOD key in the planner data, sorted. */
  unmapped: { characters: string[]; weapons: string[] }
  /** Goals read, by Seelie type ("other": unknown types and malformed rows). */
  read: { character: number; talent: number; weapon: number; other: number }
  /** Targets lowered to what the tracker plans (levels above 90). */
  clamped: number
}

/** What the import needs to know about the account now. */
export interface SeelieContext {
  /** Current state of a character (level 1 when not owned). */
  character(key: string): CharacterState
  /** Current refinement of a weapon goal's copy (1 when not owned). */
  refinement(key: string, owner: string): number
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const int = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null

/** True when `json` looks like a Seelie export (an object with a `goals` array). */
export function isSeelieExport(json: unknown): boolean {
  return isObject(json) && Array.isArray(json.goals)
}

/**
 * Maps a Seelie export's goals to tracker goals. Throws when the file is not
 * a Seelie export.
 */
export function mapSeelieGoals(
  json: unknown,
  planner: Pick<PlannerData, 'characters' | 'weapons'>,
  context: SeelieContext,
): SeelieImport {
  if (!isObject(json) || !Array.isArray(json.goals)) {
    throw new Error('Not a Seelie export (no goals)')
  }
  const keys = seelieKeys(planner)
  const inactive = new Set(
    isObject(json.inactive)
      ? Object.entries(json.inactive)
          .filter(([, on]) => Boolean(on))
          .map(([key]) => key)
      : [],
  )
  const read = { character: 0, talent: 0, weapon: 0, other: 0 }
  const unmapped = { characters: new Set<string>(), weapons: new Set<string>() }
  let clamped = 0

  interface Merged {
    level?: { level: number; ascension: number }
    talents?: Partial<Record<'auto' | 'skill' | 'burst', number>>
    active: boolean
  }
  const merged = new Map<string, Merged>()
  const weapons = new Map<string, { key: string; owner: string; target: WeaponGoal }>()
  const isInactive = (goal: Json) =>
    inactive.has(String(goal.id)) ||
    (typeof goal.character === 'string' && inactive.has(goal.character))

  for (const goal of json.goals as unknown[]) {
    if (!isObject(goal) || typeof goal.type !== 'string') {
      read.other++
      continue
    }
    const slug = typeof goal.character === 'string' ? goal.character : ''

    if (goal.type === 'character' || goal.type === 'talent') {
      const key = keys.character(slug)
      read[goal.type]++
      if (!key) {
        if (slug) unmapped.characters.add(slug)
        continue
      }
      const entry = merged.get(key) ?? { active: true }
      merged.set(key, entry)
      if (isInactive(goal)) entry.active = false
      if (goal.type === 'character') {
        const target = isObject(goal.goal) ? goal.goal : {}
        const level = int(target.level)
        const asc = int(target.asc)
        if (level !== null) {
          if (level > 90) clamped++
          entry.level = { level, ascension: asc ?? 0 }
        }
      } else {
        const talents: Merged['talents'] = {}
        for (const [from, to] of [
          ['normal', 'auto'],
          ['skill', 'skill'],
          ['burst', 'burst'],
        ] as const) {
          const value = isObject(goal[from]) ? int((goal[from] as Json).goal) : null
          if (value !== null) talents[to] = value
        }
        entry.talents = talents
      }
      continue
    }

    if (goal.type === 'weapon') {
      read.weapon++
      const weaponSlug = typeof goal.weapon === 'string' ? goal.weapon : ''
      const key = keys.weapon(weaponSlug)
      if (!key) {
        if (weaponSlug) unmapped.weapons.add(weaponSlug)
        continue
      }
      const owner = slug ? keys.character(slug) : null
      if (slug && !owner) unmapped.characters.add(slug)
      const weapon = planner.weapons.get(key)!
      const target = isObject(goal.goal) ? goal.goal : {}
      const level = int(target.level) ?? 1
      if (level > weapon.maxLevel) clamped++
      const lv = normalizeLevel(weapon.ascension, level, int(target.asc) ?? 0)
      weapons.set(`${key}:${owner ?? ''}`, {
        key,
        owner: owner ?? '',
        target: {
          ...lv,
          refinement: Math.max(1, Math.min(5, context.refinement(key, owner ?? ''))),
          active: !isInactive(goal),
        },
      })
      continue
    }

    read.other++
  }

  const characters: SeelieImport['characters'] = []
  for (const [key, entry] of merged) {
    const character = planner.characters.get(key)!
    const now = context.character(key)
    const wanted = entry.level ?? { level: now.level, ascension: now.ascension }
    const lv = normalizeLevel(character.ascension, wanted.level, wanted.ascension)
    const talent = (name: 'auto' | 'skill' | 'burst') =>
      Math.max(1, Math.min(10, entry.talents?.[name] ?? now.talents[name]))
    characters.push({
      key,
      target: {
        ...lv,
        talents: { auto: talent('auto'), skill: talent('skill'), burst: talent('burst') },
        active: entry.active,
      },
    })
  }

  return {
    characters,
    weapons: [...weapons.values()],
    unmapped: {
      characters: [...unmapped.characters].sort(),
      weapons: [...unmapped.weapons].sort(),
    },
    read,
    clamped,
  }
}
