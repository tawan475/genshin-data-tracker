/**
 * Loads and checks the hand-kept files in overrides/ (see overrides/README.md).
 * Keys starting with "$" are comments and ignored everywhere.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readJson } from './json.ts'
import { OVERRIDES_DIR } from './paths.ts'
import type { Problems } from './problems.ts'

export const WEEKDAY_SETS = {
  'mon-thu': [1, 4, 0],
  'tue-fri': [2, 5, 0],
  'wed-sat': [3, 6, 0],
} as const satisfies Record<string, number[]>
export type WeekdaySet = keyof typeof WEEKDAY_SETS

export interface KeysOverride {
  characters: { exclude: Map<number, string>; key: Map<number, string> }
  weapons: { include: Map<number, string>; exclude: Map<number, string>; key: Map<number, string> }
  materials: { key: Map<number, string>; prefer: Map<string, number> }
  /** Ids/keys a maintainer confirmed are gone from the game, so the append-only check lets them go. */
  removed: {
    achievements: Set<number>
    goals: Set<number>
    characters: Set<string>
    weapons: Set<string>
  }
}

export interface WeekdaysOverride {
  talentBooks: Map<string, WeekdaySet>
  weaponMaterials: Map<string, WeekdaySet>
}

export interface Overrides {
  keys: KeysOverride
  weekdays: WeekdaysOverride
  /** achievement id -> version it was added in */
  versions: Map<number, string>
  drops: Record<string, unknown>
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function entries(value: unknown): [string, unknown][] {
  return isObject(value) ? Object.entries(value).filter(([k]) => !k.startsWith('$')) : []
}

function load(problems: Problems, file: string): Json {
  const path = join(OVERRIDES_DIR, file)
  if (!existsSync(path)) {
    problems.error(`overrides/${file} is missing`)
    return {}
  }
  try {
    const value = readJson<unknown>(path)
    if (isObject(value)) return value
    problems.error(`overrides/${file} must hold a JSON object`)
  } catch (error) {
    problems.error(`overrides/${file} is not valid JSON: ${(error as Error).message}`)
  }
  return {}
}

function checkSections(problems: Problems, file: string, json: Json, allowed: string[]): void {
  for (const key of Object.keys(json)) {
    if (!key.startsWith('$') && !allowed.includes(key)) {
      problems.error(`overrides/${file}: unknown section "${key}" (expected ${allowed.join(', ')})`)
    }
  }
}

function idMap(problems: Problems, where: string, value: unknown): Map<number, string> {
  const map = new Map<number, string>()
  for (const [key, v] of entries(value)) {
    const id = Number(key)
    if (!Number.isInteger(id) || id <= 0 || typeof v !== 'string' || v === '') {
      problems.error(`${where}: "${key}" must be a game id mapped to a non-empty string`)
      continue
    }
    map.set(id, v)
  }
  return map
}

function stringList(problems: Problems, where: string, value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    problems.error(`${where} must be an array of strings`)
    return []
  }
  return value as string[]
}

function idList(problems: Problems, where: string, value: unknown): number[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v))) {
    problems.error(`${where} must be an array of ids`)
    return []
  }
  return value as number[]
}

function loadKeys(problems: Problems): KeysOverride {
  const file = 'keys.json'
  const json = load(problems, file)
  checkSections(problems, file, json, ['characters', 'weapons', 'materials', 'removed'])
  const characters = isObject(json.characters) ? json.characters : {}
  const weapons = isObject(json.weapons) ? json.weapons : {}
  const materials = isObject(json.materials) ? json.materials : {}
  const removed = isObject(json.removed) ? json.removed : {}
  checkSections(problems, `${file} characters`, characters, ['exclude', 'key'])
  checkSections(problems, `${file} weapons`, weapons, ['include', 'exclude', 'key'])
  checkSections(problems, `${file} materials`, materials, ['key', 'prefer'])
  checkSections(problems, `${file} removed`, removed, [
    'achievements',
    'goals',
    'characters',
    'weapons',
  ])

  const prefer = new Map<string, number>()
  for (const [key, id] of entries(materials.prefer)) {
    if (!Number.isInteger(id)) problems.error(`${file} materials.prefer.${key} must be an item id`)
    else prefer.set(key, id as number)
  }
  return {
    characters: {
      exclude: idMap(problems, `${file} characters.exclude`, characters.exclude),
      key: idMap(problems, `${file} characters.key`, characters.key),
    },
    weapons: {
      include: idMap(problems, `${file} weapons.include`, weapons.include),
      exclude: idMap(problems, `${file} weapons.exclude`, weapons.exclude),
      key: idMap(problems, `${file} weapons.key`, weapons.key),
    },
    materials: { key: idMap(problems, `${file} materials.key`, materials.key), prefer },
    removed: {
      achievements: new Set(idList(problems, `${file} removed.achievements`, removed.achievements)),
      goals: new Set(idList(problems, `${file} removed.goals`, removed.goals)),
      characters: new Set(stringList(problems, `${file} removed.characters`, removed.characters)),
      weapons: new Set(stringList(problems, `${file} removed.weapons`, removed.weapons)),
    },
  }
}

function loadWeekdays(problems: Problems): WeekdaysOverride {
  const file = 'weekdays.json'
  const json = load(problems, file)
  checkSections(problems, file, json, ['talentBooks', 'weaponMaterials'])
  const section = (name: 'talentBooks' | 'weaponMaterials') => {
    const map = new Map<string, WeekdaySet>()
    for (const [family, days] of entries(json[name])) {
      if (typeof days !== 'string' || !(days in WEEKDAY_SETS)) {
        problems.error(
          `${file} ${name}.${family} is ${JSON.stringify(days)}; use one of ${Object.keys(WEEKDAY_SETS).join(', ')}`,
        )
        continue
      }
      map.set(family, days as WeekdaySet)
    }
    return map
  }
  return { talentBooks: section('talentBooks'), weaponMaterials: section('weaponMaterials') }
}

function loadVersions(problems: Problems): Map<number, string> {
  const file = 'achievement-versions.json'
  const json = load(problems, file)
  const versions = new Map<number, string>()
  for (const [version, ids] of entries(json)) {
    if (!/^\d+\.\d+$/.test(version)) {
      problems.error(`${file}: "${version}" is not a version like "4.2"`)
      continue
    }
    for (const id of idList(problems, `${file} "${version}"`, ids)) {
      const previous = versions.get(id)
      if (previous)
        problems.error(`${file}: achievement ${id} is listed under ${previous} and ${version}`)
      versions.set(id, version)
    }
  }
  return versions
}

export function loadOverrides(problems: Problems): Overrides {
  return {
    keys: loadKeys(problems),
    weekdays: loadWeekdays(problems),
    versions: loadVersions(problems),
    drops: load(problems, 'drops.json'),
  }
}
