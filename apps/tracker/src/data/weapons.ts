/**
 * The Weapons page's model. An account holds 1,000+ weapons, most of them
 * identical fodder, so unequipped copies with the same key, level,
 * ascension, refinement and lock state collapse into one row with a count.
 * Equipped weapons always get a row of their own. Pure functions, run once
 * per inventory.
 */

import type { Good } from '@gdt/shared'
import { keyToName } from '@/lib/format'
import type { WeaponType } from './characters-meta'
import { WEAPON_META } from './weapons-meta'

export interface WeaponRow {
  /** Stable row id: the grouping key, or the owner for an equipped weapon. */
  id: string
  key: string
  name: string
  rarity: number | null
  type: WeaponType | null
  level: number
  ascension: number
  refinement: number
  /** Character key, or '' when unequipped. */
  location: string
  ownerName: string
  lock: boolean
  count: number
  haystack: string
}

export interface Armory {
  rows: WeaponRow[]
  total: number
  /** Rows after grouping identical copies. */
  distinct: number
  equipped: number
}

export const WEAPON_TYPES: readonly WeaponType[] = [
  'sword',
  'claymore',
  'polearm',
  'bow',
  'catalyst',
]

export const WEAPON_TYPE_LABELS: Record<WeaponType, string> = {
  sword: 'Sword',
  claymore: 'Claymore',
  polearm: 'Polearm',
  bow: 'Bow',
  catalyst: 'Catalyst',
}

const SMALL_WORDS = /(?<= )(Of|The|And|An|In|To|For|From|On|At|By|With)(?= )/g

/**
 * Weapon and artifact set names from their GOOD keys, with the small words
 * of a title back in lower case: "FragmentOfHarmonicWhimsy" -> "Fragment of
 * Harmonic Whimsy". (Apostrophes and hyphens are gone from GOOD keys.)
 */
export function itemName(key: string): string {
  return keyToName(key).replace(SMALL_WORDS, (word) => word.toLowerCase())
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, '')

export function buildArmory(good: Good): Armory {
  const rows = new Map<string, WeaponRow>()
  let equipped = 0
  good.weapons.forEach((w, index) => {
    if (w.location) equipped++
    const id = w.location
      ? `equipped:${w.location}:${index}`
      : `${w.key}:${w.level}:${w.ascension}:${w.refinement}:${w.lock ? 1 : 0}`
    const existing = rows.get(id)
    if (existing) {
      existing.count++
      return
    }
    const meta = WEAPON_META[w.key]
    const name = itemName(w.key)
    const ownerName = w.location ? keyToName(w.location) : ''
    rows.set(id, {
      id,
      key: w.key,
      name,
      rarity: meta?.[0] ?? null,
      type: meta?.[1] ?? null,
      level: w.level,
      ascension: w.ascension,
      refinement: w.refinement,
      location: w.location,
      ownerName,
      lock: w.lock,
      count: 1,
      haystack: normalize(`${name} ${w.key} ${ownerName}`),
    })
  })
  return { rows: [...rows.values()], total: good.weapons.length, distinct: rows.size, equipped }
}

// ------------------------------------------------------------ filter & sort

export type WeaponSort = 'level' | 'refinement' | 'rarity' | 'count' | 'name'
export type SortDirection = 'asc' | 'desc'

export const WEAPON_SORTS: { value: WeaponSort; label: string; natural: SortDirection }[] = [
  { value: 'level', label: 'Level', natural: 'desc' },
  { value: 'rarity', label: 'Rarity', natural: 'desc' },
  { value: 'refinement', label: 'Refinement', natural: 'desc' },
  { value: 'count', label: 'Copies', natural: 'desc' },
  { value: 'name', label: 'Name', natural: 'asc' },
]

export interface WeaponFilters {
  query: string
  status: 'all' | 'equipped' | 'unequipped'
  lock: 'all' | 'locked' | 'unlocked'
  rarity: 'all' | 5 | 4 | 3 | 'low'
  type: WeaponType | 'all'
  level80: boolean
}

export const NO_WEAPON_FILTERS: WeaponFilters = {
  query: '',
  status: 'all',
  lock: 'all',
  rarity: 'all',
  type: 'all',
  level80: false,
}

export function hasWeaponFilters(f: WeaponFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.status !== 'all' ||
    f.lock !== 'all' ||
    f.rarity !== 'all' ||
    f.type !== 'all' ||
    f.level80
  )
}

function rarityMatches(rarity: number | null, wanted: WeaponFilters['rarity']): boolean {
  if (wanted === 'all') return true
  if (wanted === 'low') return rarity !== null && rarity <= 2
  return rarity === wanted
}

export function filterWeapons(rows: readonly WeaponRow[], f: WeaponFilters): WeaponRow[] {
  const words = normalize(f.query).split(' ').filter(Boolean)
  return rows.filter(
    (r) =>
      (f.status === 'all' || (f.status === 'equipped') === (r.location !== '')) &&
      (f.lock === 'all' || (f.lock === 'locked') === r.lock) &&
      (f.type === 'all' || r.type === f.type) &&
      (!f.level80 || r.level >= 80) &&
      rarityMatches(r.rarity, f.rarity) &&
      words.every((w) => r.haystack.includes(w)),
  )
}

const compareBy: Record<WeaponSort, (a: WeaponRow, b: WeaponRow) => number> = {
  level: (a, b) => a.level - b.level || a.ascension - b.ascension,
  refinement: (a, b) => a.refinement - b.refinement,
  rarity: (a, b) => (a.rarity ?? 0) - (b.rarity ?? 0),
  count: (a, b) => a.count - b.count,
  name: (a, b) => a.name.localeCompare(b.name),
}

/** Ties fall back to rarity, level (high first), then name. */
export function sortWeapons(
  rows: readonly WeaponRow[],
  sort: WeaponSort,
  direction: SortDirection,
): WeaponRow[] {
  const sign = direction === 'asc' ? 1 : -1
  const primary = compareBy[sort]
  return [...rows].sort(
    (a, b) =>
      sign * primary(a, b) ||
      compareBy.rarity(b, a) ||
      compareBy.level(b, a) ||
      compareBy.name(a, b) ||
      a.ownerName.localeCompare(b.ownerName),
  )
}
