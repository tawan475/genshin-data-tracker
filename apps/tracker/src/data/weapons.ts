/**
 * The Weapons page's model. An account holds 1,000+ weapons, most of them
 * identical low-rarity copies, so copies are handled at two levels:
 *
 * - rows: unequipped copies with the same key, level, ascension, refinement
 *   and lock state collapse into one row with a count; an equipped weapon
 *   always gets its own row (the List view);
 * - groups: every row of one weapon key together, with its owners and what
 *   the spare copies could refine (the Cards view).
 *
 * Filters apply to rows, then rows are grouped, so a group shows the copies
 * that match. Pure functions, run once per inventory or filter change.
 */

import type { Good } from '@gdt/shared'
import { keyToName } from '@/lib/format'
import { weaponMeta, type WeaponType } from './game-meta'

export type { WeaponType }

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

/** What spare (unequipped) copies could do for the equipped ones. */
export interface RefineTarget {
  owner: string
  ownerName: string
  from: number
  to: number
}

export interface RefineInfo {
  /** Unequipped copies of this weapon. */
  spare: number
  targets: RefineTarget[]
}

export interface WeaponGroup {
  key: string
  name: string
  rarity: number | null
  type: WeaponType | null
  /** Matching rows, best first (equipped, then level, then refinement). */
  rows: WeaponRow[]
  /** Matching copies. */
  count: number
  owners: { key: string; name: string }[]
  /** The best matching copy. */
  best: WeaponRow
  /** From the whole inventory, not just the matches. */
  refine: RefineInfo | null
}

export interface Armory {
  rows: WeaponRow[]
  /** Refine headroom per weapon key (only keys that have some). */
  refine: Map<string, RefineInfo>
  total: number
  /** Distinct weapon keys. */
  kinds: number
  equipped: number
  /** Copies per rarity. */
  byRarity: Map<number, number>
  /** Unequipped 5★ copies. */
  spare5: number
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

export const MAX_REFINEMENT = 5

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

/**
 * Spare copies feed equipped ones: a copy of refinement N adds N ranks. The
 * most refined equipped copy is finished first. 1–2★ weapons do not refine.
 */
function refineInfo(rows: readonly WeaponRow[]): RefineInfo | null {
  const rarity = rows[0]?.rarity ?? null
  if (rarity !== null && rarity < 3) return null
  let pool = 0
  let spare = 0
  const equipped: WeaponRow[] = []
  for (const row of rows) {
    if (row.location) equipped.push(row)
    else {
      spare += row.count
      pool += row.refinement * row.count
    }
  }
  const targets: RefineTarget[] = []
  equipped
    .filter((r) => r.refinement < MAX_REFINEMENT)
    .sort((a, b) => b.refinement - a.refinement || b.level - a.level)
    .forEach((r) => {
      const gain = Math.min(MAX_REFINEMENT - r.refinement, pool)
      if (gain <= 0) return
      pool -= gain
      targets.push({
        owner: r.location,
        ownerName: r.ownerName,
        from: r.refinement,
        to: r.refinement + gain,
      })
    })
  return targets.length ? { spare, targets } : null
}

export function buildArmory(good: Good): Armory {
  const rows = new Map<string, WeaponRow>()
  let equipped = 0
  const byRarity = new Map<number, number>()
  let spare5 = 0
  good.weapons.forEach((w, index) => {
    const meta = weaponMeta(w.key)
    const rarity = meta?.[0] ?? null
    if (rarity !== null) byRarity.set(rarity, (byRarity.get(rarity) ?? 0) + 1)
    if (w.location) equipped++
    else if (rarity === 5) spare5++
    const id = w.location
      ? `equipped:${w.location}:${index}`
      : `${w.key}:${w.level}:${w.ascension}:${w.refinement}:${w.lock ? 1 : 0}`
    const existing = rows.get(id)
    if (existing) {
      existing.count++
      return
    }
    const name = itemName(w.key)
    const type = meta?.[1] ?? null
    const ownerName = w.location ? keyToName(w.location) : ''
    rows.set(id, {
      id,
      key: w.key,
      name,
      rarity,
      type,
      level: w.level,
      ascension: w.ascension,
      refinement: w.refinement,
      location: w.location,
      ownerName,
      lock: w.lock,
      count: 1,
      haystack: normalize(`${name} ${w.key} ${ownerName} ${type ? WEAPON_TYPE_LABELS[type] : ''}`),
    })
  })

  const list = [...rows.values()]
  const byKey = new Map<string, WeaponRow[]>()
  for (const row of list) {
    const same = byKey.get(row.key)
    if (same) same.push(row)
    else byKey.set(row.key, [row])
  }
  const refine = new Map<string, RefineInfo>()
  for (const [key, same] of byKey) {
    const info = refineInfo(same)
    if (info) refine.set(key, info)
  }

  return {
    rows: list,
    refine,
    total: good.weapons.length,
    kinds: byKey.size,
    equipped,
    byRarity,
    spare5,
  }
}

/** Equipped first, then the highest level, then the highest refinement. */
function compareCopies(a: WeaponRow, b: WeaponRow): number {
  return (
    Number(b.location !== '') - Number(a.location !== '') ||
    b.level - a.level ||
    b.refinement - a.refinement ||
    Number(b.lock) - Number(a.lock) ||
    a.ownerName.localeCompare(b.ownerName)
  )
}

/** Groups (already filtered) rows by weapon key. */
export function groupWeapons(
  rows: readonly WeaponRow[],
  refine: ReadonlyMap<string, RefineInfo>,
): WeaponGroup[] {
  const byKey = new Map<string, WeaponRow[]>()
  for (const row of rows) {
    const same = byKey.get(row.key)
    if (same) same.push(row)
    else byKey.set(row.key, [row])
  }
  return [...byKey].map(([key, same]) => {
    same.sort(compareCopies)
    const first = same[0]!
    return {
      key,
      name: first.name,
      rarity: first.rarity,
      type: first.type,
      rows: same,
      count: same.reduce((sum, r) => sum + r.count, 0),
      owners: same.filter((r) => r.location).map((r) => ({ key: r.location, name: r.ownerName })),
      best: [...same].sort(
        (a, b) => b.level - a.level || b.refinement - a.refinement || compareCopies(a, b),
      )[0]!,
      refine: refine.get(key) ?? null,
    }
  })
}

// ------------------------------------------------------------ filter & sort

export type WeaponSort = 'rarity' | 'level' | 'refinement' | 'count' | 'name'
export type SortDirection = 'asc' | 'desc'

export const WEAPON_SORTS: { value: WeaponSort; label: string; natural: SortDirection }[] = [
  { value: 'rarity', label: 'Rarity', natural: 'desc' },
  { value: 'level', label: 'Level', natural: 'desc' },
  { value: 'refinement', label: 'Refinement', natural: 'desc' },
  { value: 'count', label: 'Copies', natural: 'desc' },
  { value: 'name', label: 'Name', natural: 'asc' },
]

export type RarityFilter = 'all' | 5 | 4 | 3 | 'low'
export type LevelFilter = 'all' | 'max' | 'levelled' | 'base'

export interface WeaponFilters {
  query: string
  status: 'all' | 'equipped' | 'unequipped'
  lock: 'all' | 'locked' | 'unlocked'
  rarity: RarityFilter
  type: WeaponType | 'all'
  level: LevelFilter
  refinable: boolean
}

export const NO_WEAPON_FILTERS: WeaponFilters = {
  query: '',
  status: 'all',
  lock: 'all',
  rarity: 'all',
  type: 'all',
  level: 'all',
  refinable: false,
}

export const LEVEL_OPTIONS: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: 'Level' },
  { value: 'max', label: 'Lv 90' },
  { value: 'levelled', label: 'Levelled' },
  { value: 'base', label: 'Lv 1' },
]

export function hasWeaponFilters(f: WeaponFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.status !== 'all' ||
    f.lock !== 'all' ||
    f.rarity !== 'all' ||
    f.type !== 'all' ||
    f.level !== 'all' ||
    f.refinable
  )
}

/** The rarity a row falls under in the rarity filter. */
export function rarityBucket(rarity: number | null): RarityFilter | null {
  if (rarity === null) return null
  return rarity <= 2 ? 'low' : (rarity as 5 | 4 | 3)
}

function levelMatches(level: number, wanted: LevelFilter): boolean {
  if (wanted === 'max') return level >= 90
  if (wanted === 'levelled') return level > 1
  if (wanted === 'base') return level <= 1
  return true
}

/** Facets whose chips show "matches if you pick this" counts. */
export type WeaponFacet = 'type' | 'rarity'

export function filterWeapons(
  rows: readonly WeaponRow[],
  f: WeaponFilters,
  refine: ReadonlyMap<string, RefineInfo>,
  except?: WeaponFacet,
): WeaponRow[] {
  const words = normalize(f.query).split(' ').filter(Boolean)
  return rows.filter(
    (r) =>
      (f.status === 'all' || (f.status === 'equipped') === (r.location !== '')) &&
      (f.lock === 'all' || (f.lock === 'locked') === r.lock) &&
      (except === 'type' || f.type === 'all' || r.type === f.type) &&
      (except === 'rarity' || f.rarity === 'all' || rarityBucket(r.rarity) === f.rarity) &&
      levelMatches(r.level, f.level) &&
      (!f.refinable || refine.has(r.key)) &&
      words.every((w) => r.haystack.includes(w)),
  )
}

/** Copies per facet value, with every other filter applied. */
export function weaponFacetCounts<K>(
  rows: readonly WeaponRow[],
  f: WeaponFilters,
  refine: ReadonlyMap<string, RefineInfo>,
  facet: WeaponFacet,
  value: (r: WeaponRow) => K,
): Map<K, number> {
  const counts = new Map<K, number>()
  for (const r of filterWeapons(rows, f, refine, facet)) {
    const k = value(r)
    counts.set(k, (counts.get(k) ?? 0) + r.count)
  }
  return counts
}

const compareRows: Record<WeaponSort, (a: WeaponRow, b: WeaponRow) => number> = {
  rarity: (a, b) => (a.rarity ?? 0) - (b.rarity ?? 0),
  level: (a, b) => a.level - b.level || a.ascension - b.ascension,
  refinement: (a, b) => a.refinement - b.refinement,
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
  const primary = compareRows[sort]
  return [...rows].sort(
    (a, b) =>
      sign * primary(a, b) ||
      compareRows.rarity(b, a) ||
      compareRows.level(b, a) ||
      compareRows.name(a, b) ||
      a.ownerName.localeCompare(b.ownerName),
  )
}

const compareGroups: Record<WeaponSort, (a: WeaponGroup, b: WeaponGroup) => number> = {
  rarity: (a, b) => (a.rarity ?? 0) - (b.rarity ?? 0),
  level: (a, b) => compareRows.level(a.best, b.best),
  refinement: (a, b) => a.best.refinement - b.best.refinement,
  count: (a, b) => a.count - b.count,
  name: (a, b) => a.name.localeCompare(b.name),
}

/** Ties: rarity, then equipped copies, then best level (high first), then name. */
export function sortGroups(
  groups: readonly WeaponGroup[],
  sort: WeaponSort,
  direction: SortDirection,
): WeaponGroup[] {
  const sign = direction === 'asc' ? 1 : -1
  const primary = compareGroups[sort]
  return [...groups].sort(
    (a, b) =>
      sign * primary(a, b) ||
      compareGroups.rarity(b, a) ||
      b.owners.length - a.owners.length ||
      compareGroups.level(b, a) ||
      compareGroups.name(a, b),
  )
}
