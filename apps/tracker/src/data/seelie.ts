/**
 * Planner goals from a Seelie export (seelie.me, Settings -> Export Account:
 * `<date>-main-seelie-gi.json`). Seelie stores four kinds of goal:
 *
 * - `{type: "character", character, cons, current: {level, asc}, goal: {level, asc}, id}`
 * - `{type: "talent", character, normal|skill|burst: {current, goal}, id}`
 * - `{type: "weapon", character (owner), weapon, current, goal: {level, asc, craft}, id}`
 * - `{type: "artifact", character, artifacts: [set], sands, goblet, circlet, done: {set: true}}`
 *
 * and keys characters, weapons and sets by snake_case slugs ("hu_tao" or
 * "hutao", "freedom-sworn", "traveler_cryo", "gladiators_finale"). Most slugs
 * are the English name, so they map to GOOD keys by comparing letters and
 * digits only; the rest are older or shorter names (Raiden is "shogun",
 * Engulfing Lightning "grasscutters_light") kept in the alias tables
 * (`seelie-slugs.ts`). Anything still unknown is reported, not guessed.
 *
 * Custom characters (`customs: {"custom-xyz": {custom: "character", name,
 * tier, element, weapon, talent, common, element_2, local, boss}}`) become
 * goals of kind `custom` keyed `xyz` (see `customKeyFromSeelie`); goals and
 * weapon goals naming `custom-xyz` belong to them.
 *
 * A character's level, talent and artifact goals become one tracker goal.
 * Seelie's "current" values come along as `current` (the import may set
 * them as hand-set current states); `cons` as `constellation`, its notes as
 * `note`. A weapon goal's refinement is Seelie's `craft` when that is 1-5,
 * else the copy's current refinement.
 */

import type { PlannerData } from '@gdt/game-data'
import {
  normalizeLevel,
  type CharacterGoal,
  type CharacterState,
  type WeaponGoal,
  type WeaponState,
} from '@gdt/game-data/planner-math'
import {
  ELEMENT_KEYS,
  WEAPON_TYPE_KEYS,
  type ArtifactGoal,
  type CustomCharacter,
} from '@gdt/shared'
import { seelieMaterial, type SeeliePlanner } from '@/components/planner/seelie-items'
import {
  SEELIE_ELEMENT_GEMS,
  SEELIE_STATS,
  SEELIE_WEAPON_KEYS,
  artifactSetOfSlug,
  slugLetters,
} from '@/components/planner/seelie-slugs'

const norm = slugLetters

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
export const SEELIE_WEAPON_ALIASES: Readonly<Record<string, string>> = SEELIE_WEAPON_KEYS

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

/** One character's goals from the file, merged. */
export interface SeelieCharacter {
  /** GOOD key (a custom character's own id for `customs`). */
  key: string
  target: CharacterGoal
  /** The file has a level or talent goal for it (not only an artifact goal or current values). */
  levelGoal: boolean
  /** Seelie's current values (the account's where Seelie has none); absent when it has none. */
  current?: CharacterState
  /** Seelie's `cons` (0-6). */
  constellation?: number
  /** Seelie's artifact goal. */
  artifacts?: ArtifactGoal
  /** Seelie's note on the character. */
  note?: string
}

/** A custom character from the file's `customs`, with its goals. */
export interface SeelieCustom extends SeelieCharacter {
  custom: CustomCharacter
}

export interface SeelieWeapon {
  key: string
  /** GOOD key or custom id of the character; '' for a spare (or an owner not mapped). */
  owner: string
  target: WeaponGoal
  /** Seelie's current values; absent when it has none. */
  current?: WeaponState
}

export interface SeelieImport {
  /** One goal per character: Seelie's level, talent and artifact goals merged. */
  characters: SeelieCharacter[]
  /** Custom characters (with their merged goals), keyed by `customKeyFromSeelie`. */
  customs: SeelieCustom[]
  /**
   * Weapon goals in file order, one per Seelie goal (two of one weapon stay
   * two); owner '' when Seelie's owner is unknown.
   */
  weapons: SeelieWeapon[]
  /**
   * Seelie slugs with no GOOD key in the planner data, sorted: characters,
   * weapons, artifact sets, and `other` (custom characters' materials as
   * `field/slug`).
   */
  unmapped: { characters: string[]; weapons: string[]; artifacts: string[]; other: string[] }
  /** Goals read, by Seelie type ("other": unknown types and malformed rows). */
  read: { character: number; talent: number; weapon: number; artifact: number; other: number }
  /** Targets lowered to what the tracker plans (levels above 90). */
  clamped: number
}

/** What the import needs to know about the account now. */
export interface SeelieContext {
  /** Current state of a character (level 1 when not owned). */
  character(key: string): CharacterState
  /** Current refinement of a weapon goal's copy (1 when not owned). */
  refinement(key: string, owner: string): number
  /** Artifact set GOOD keys the planner knows (artifact goals); none: every set is unmapped. */
  artifactSets?: readonly string[]
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const int = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** True when `json` looks like a Seelie export (an object with a `goals` array). */
export function isSeelieExport(json: unknown): boolean {
  return isObject(json) && Array.isArray(json.goals)
}

const CUSTOM_KEY = /^[a-z][a-z0-9]{5,31}$/

/** FNV-1a, base 36: a short stable name for an id that can't be kept as is. */
function hashName(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

/**
 * A Seelie custom character's id ("custom-k3j9xz") as a tracker custom id:
 * what follows "custom-", lower-case letters and digits, when that is a
 * valid one (an export of ours writes `custom-<id>`, so ids round-trip);
 * else "c" and it, or a hash of the id when even that isn't.
 */
export function customKeyFromSeelie(id: string): string {
  const rest = id
    .replace(/^custom-?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (CUSTOM_KEY.test(rest)) return rest
  const prefixed = `c${rest}`.slice(0, 32)
  if (CUSTOM_KEY.test(prefixed)) return prefixed
  return `c${hashName(id)}`
}

/** The custom character Seelie describes, or null when it isn't one. */
function customOf(
  value: unknown,
  planner: SeeliePlanner,
  unmapped: Set<string>,
): CustomCharacter | null {
  if (!isObject(value) || (value.custom !== undefined && value.custom !== 'character')) return null
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : ''
  // Seelie leaves the element unset until picked; its gem says it then.
  const gem = Object.entries(SEELIE_ELEMENT_GEMS).find(([, slug]) => slug === value.element_1)
  const element = typeof value.element === 'string' ? value.element.toLowerCase() : (gem?.[0] ?? '')
  const weapon = typeof value.weapon === 'string' ? value.weapon.toLowerCase() : ''
  const material = (field: string, type: string): string | undefined => {
    const slug = value[field]
    if (typeof slug !== 'string' || slug === '') return undefined
    const found = seelieMaterial(planner, type, slug, 0)
    if (!found) unmapped.add(`${field}/${slug}`)
    return found ? (found.family?.members[0] ?? found).key : undefined
  }
  const custom: CustomCharacter = {
    name: name || 'Custom',
    rarity: int(value.tier) === 4 ? 4 : 5,
    element: ELEMENT_KEYS.find((e) => e.toLowerCase() === element) ?? ELEMENT_KEYS[0],
    weapon: WEAPON_TYPE_KEYS.find((w) => w === weapon) ?? 'sword',
  }
  const book = material('talent', 'talent')
  const common = material('common', 'common')
  const boss = material('element_2', 'element_2')
  const local = material('local', 'local')
  const weekly = material('boss', 'boss')
  if (book) custom.book = book
  if (common) custom.common = common
  if (boss) custom.boss = boss
  if (local) custom.local = local
  if (weekly) custom.weekly = weekly
  return custom
}

/** An artifact goal from Seelie's (sets mapped among `sets`; unknown ones reported). */
function artifactGoalOf(goal: Json, sets: readonly string[], unmapped: Set<string>): ArtifactGoal {
  const done = isObject(goal.done) ? goal.done : {}
  const list: ArtifactGoal['sets'] = []
  for (const slug of Array.isArray(goal.artifacts) ? goal.artifacts : []) {
    if (typeof slug !== 'string') continue
    const key = artifactSetOfSlug(slug, sets)
    if (!key) {
      unmapped.add(slug)
      continue
    }
    if (list.some((s) => s.key === key) || list.length >= 8) continue
    list.push(done[slug] ? { key, done: true } : { key })
  }
  const result: ArtifactGoal = { sets: list }
  for (const slot of ['sands', 'goblet', 'circlet'] as const) {
    const stat = goal[slot]
    const keys = typeof stat === 'string' ? SEELIE_STATS[stat] : undefined
    if (keys) result[slot] = [...keys]
  }
  return result
}

/**
 * Maps a Seelie export's goals to tracker goals. Throws when the file is not
 * a Seelie export.
 */
export function mapSeelieGoals(
  json: unknown,
  planner: Pick<PlannerData, 'characters' | 'weapons'> & SeeliePlanner,
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
  const notes = isObject(json.notes) ? json.notes : {}
  const read = { character: 0, talent: 0, weapon: 0, artifact: 0, other: 0 }
  const unmapped = {
    characters: new Set<string>(),
    weapons: new Set<string>(),
    artifacts: new Set<string>(),
    other: new Set<string>(),
  }
  let clamped = 0

  // Custom characters, by their Seelie id.
  const customs = new Map<string, { key: string; custom: CustomCharacter }>()
  if (isObject(json.customs)) {
    for (const [id, value] of Object.entries(json.customs)) {
      const custom = customOf(value, planner, unmapped.other)
      if (custom) customs.set(id, { key: customKeyFromSeelie(id), custom })
    }
  }
  /** GOOD key or custom id of a character slug; null when neither. */
  const characterOf = (slug: string) => customs.get(slug)?.key ?? keys.character(slug)
  const isCustom = (slug: string) => customs.has(slug)
  /** Any regular character's ascension table: every character's level caps are the same. */
  const anyPhases = [...planner.characters.values()].find((c) => !/^[a-z]/.test(c.key))?.ascension

  interface Merged {
    slug: string
    level?: { level: number; ascension: number }
    talents?: Partial<Record<'auto' | 'skill' | 'burst', number>>
    nowLevel?: { level: number; ascension: number }
    nowTalents?: Partial<Record<'auto' | 'skill' | 'burst', number>>
    constellation?: number
    artifacts?: ArtifactGoal
    active: boolean
  }
  const merged = new Map<string, Merged>()
  const weapons: SeelieImport['weapons'] = []
  const isInactive = (goal: Json) =>
    inactive.has(String(goal.id)) ||
    (typeof goal.character === 'string' && inactive.has(goal.character))

  for (const goal of json.goals as unknown[]) {
    if (!isObject(goal) || typeof goal.type !== 'string') {
      read.other++
      continue
    }
    const slug = typeof goal.character === 'string' ? goal.character : ''

    if (goal.type === 'character' || goal.type === 'talent' || goal.type === 'artifact') {
      const key = characterOf(slug)
      read[goal.type]++
      if (!key) {
        if (slug) unmapped.characters.add(slug)
        continue
      }
      const entry = merged.get(key) ?? { slug, active: true }
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
        const now = isObject(goal.current) ? goal.current : null
        const nowLevel = now ? int(now.level) : null
        if (now && nowLevel !== null) {
          entry.nowLevel = { level: nowLevel, ascension: int(now.asc) ?? 0 }
        }
        const cons = int(goal.cons)
        if (cons !== null) entry.constellation = clamp(cons, 0, 6)
      } else if (goal.type === 'talent') {
        const talents: Merged['talents'] = {}
        const nows: Merged['nowTalents'] = {}
        for (const [from, to] of [
          ['normal', 'auto'],
          ['skill', 'skill'],
          ['burst', 'burst'],
        ] as const) {
          const part = isObject(goal[from]) ? (goal[from] as Json) : null
          const value = part ? int(part.goal) : null
          if (value !== null) talents[to] = value
          const now = part ? int(part.current) : null
          if (now !== null) nows[to] = now
        }
        entry.talents = talents
        if (Object.keys(nows).length) entry.nowTalents = nows
      } else {
        entry.artifacts = artifactGoalOf(goal, context.artifactSets ?? [], unmapped.artifacts)
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
      const owner = slug ? characterOf(slug) : null
      if (slug && !owner) unmapped.characters.add(slug)
      const weapon = planner.weapons.get(key)!
      const target = isObject(goal.goal) ? goal.goal : {}
      const level = int(target.level) ?? 1
      if (level > weapon.maxLevel) clamped++
      const lv = normalizeLevel(weapon.ascension, level, int(target.asc) ?? 0)
      const held = Math.max(1, Math.min(5, context.refinement(key, owner ?? '')))
      const craft = (value: unknown) => {
        const n = int(value)
        return n !== null && n >= 1 && n <= 5 ? n : null
      }
      const entry: SeelieWeapon = {
        key,
        owner: owner ?? '',
        target: { ...lv, refinement: craft(target.craft) ?? held, active: !isInactive(goal) },
      }
      const now = isObject(goal.current) ? goal.current : null
      const nowLevel = now ? int(now.level) : null
      if (now && nowLevel !== null) {
        entry.current = {
          ...normalizeLevel(weapon.ascension, nowLevel, int(now.asc) ?? 0),
          refinement: craft(now.craft) ?? held,
        }
      }
      weapons.push(entry)
      continue
    }

    read.other++
  }

  const characters: SeelieImport['characters'] = []
  const customList: SeelieImport['customs'] = []
  for (const [key, entry] of merged) {
    const phases = planner.characters.get(key)?.ascension ?? anyPhases
    if (!phases) continue
    const now = context.character(key)
    const wanted = entry.level ?? { level: now.level, ascension: now.ascension }
    const lv = normalizeLevel(phases, wanted.level, wanted.ascension)
    const talent = (name: 'auto' | 'skill' | 'burst') =>
      clamp(entry.talents?.[name] ?? now.talents[name], 1, 10)
    const result: SeelieCharacter = {
      key,
      levelGoal: entry.level !== undefined || entry.talents !== undefined,
      target: {
        ...lv,
        talents: { auto: talent('auto'), skill: talent('skill'), burst: talent('burst') },
        active: entry.active,
      },
    }
    if (entry.nowLevel || entry.nowTalents) {
      const level = entry.nowLevel
        ? normalizeLevel(phases, entry.nowLevel.level, entry.nowLevel.ascension)
        : { level: now.level, ascension: now.ascension }
      const nowTalent = (name: 'auto' | 'skill' | 'burst') =>
        clamp(entry.nowTalents?.[name] ?? now.talents[name], 1, 10)
      result.current = {
        ...level,
        talents: { auto: nowTalent('auto'), skill: nowTalent('skill'), burst: nowTalent('burst') },
      }
    }
    if (entry.constellation !== undefined) result.constellation = entry.constellation
    if (entry.artifacts) result.artifacts = entry.artifacts
    const note = notes[entry.slug]
    if (typeof note === 'string' && note.trim()) result.note = note.trim().slice(0, 1000)
    const custom = isCustom(entry.slug) ? customs.get(entry.slug)! : null
    if (custom) customList.push({ ...result, custom: custom.custom })
    else characters.push(result)
  }
  // A custom character with no goals in the file still comes along (at its current state).
  for (const [slug, { key, custom }] of customs) {
    if (merged.has(key) || !anyPhases) continue
    const now = context.character(key)
    customList.push({
      key,
      custom,
      levelGoal: false,
      target: {
        level: now.level,
        ascension: now.ascension,
        talents: { ...now.talents },
        active: !inactive.has(slug),
      },
    })
  }

  return {
    characters,
    customs: customList,
    weapons,
    unmapped: {
      characters: [...unmapped.characters].sort(),
      weapons: [...unmapped.weapons].sort(),
      artifacts: [...unmapped.artifacts].sort(),
      other: [...unmapped.other].sort(),
    },
    read,
    clamped,
  }
}
