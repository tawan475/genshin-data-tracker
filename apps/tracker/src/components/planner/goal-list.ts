/**
 * The Goals tab's toolbar: search, status, element / rarity / weapon type
 * filters (chips count "matches if you pick this", like the Characters page)
 * and the sort orders. Pure functions over the board's entries.
 */

import type { WeaponType } from '@gdt/game-data'
import type { Element } from '@/data/game-meta'
import { normalizeSearch } from '@/data/characters'
import type { GoalEntry, ItemGoalView } from './model'

/** `active` hides paused goals, `off` shows only them, `ready` those in stock. */
export type GoalStatus = 'all' | 'ready' | 'active' | 'off'

export interface GoalFilters {
  query: string
  status: GoalStatus
  element: Element | 'all'
  rarity: number | 'all'
  weaponType: WeaponType | 'all'
}

export const NO_GOAL_FILTERS: GoalFilters = {
  query: '',
  status: 'all',
  element: 'all',
  rarity: 'all',
  weaponType: 'all',
}

export type GoalFacet = 'status' | 'element' | 'rarity'

export type GoalSort = 'name' | 'missing' | 'favorites' | 'priority'

export const GOAL_SORTS: { value: GoalSort; label: string; title: string }[] = [
  { value: 'name', label: 'Name', title: 'A to Z' },
  { value: 'missing', label: 'Missing', title: 'Fewest items missing first' },
  { value: 'favorites', label: 'Favorites', title: 'Favorites first' },
  {
    value: 'priority',
    label: 'Priority',
    title: 'Materials go to the top goals first: drag to reorder',
  },
]

function statusMatches(status: GoalStatus, active: boolean, ready: boolean): boolean {
  if (status === 'ready') return active && ready
  if (status === 'active') return active
  if (status === 'off') return !active
  return true
}

/** The entries matching every filter (but `except`, for that facet's counts). */
export function filterGoals(
  entries: readonly GoalEntry[],
  f: GoalFilters,
  ready: ReadonlySet<string>,
  except?: GoalFacet,
): GoalEntry[] {
  const words = normalizeSearch(f.query).split(' ').filter(Boolean)
  return entries.filter((e) => {
    if (except !== 'status' && !statusMatches(f.status, e.active, ready.has(e.id))) return false
    if (except !== 'element' && f.element !== 'all' && e.element !== f.element) return false
    if (except !== 'rarity' && f.rarity !== 'all' && e.rarity !== f.rarity) return false
    if (f.weaponType !== 'all' && e.weaponType !== f.weaponType) return false
    if (words.length === 0) return true
    const names = normalizeSearch([e.name, ...e.weapons.map((w) => w.name), e.note].join(' '))
    return words.every((w) => names.includes(w))
  })
}

/** Per-value counts of one facet, with every other filter applied. */
export function goalFacetCounts<K>(
  entries: readonly GoalEntry[],
  f: GoalFilters,
  ready: ReadonlySet<string>,
  facet: GoalFacet,
  value: (e: GoalEntry) => K | readonly K[],
): Map<K, number> {
  const counts = new Map<K, number>()
  for (const e of filterGoals(entries, f, ready, facet)) {
    const v = value(e)
    for (const k of Array.isArray(v) ? (v as readonly K[]) : [v as K]) {
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  return counts
}

/** Status values an entry counts toward (`all` always). */
export function entryStatuses(e: GoalEntry, ready: ReadonlySet<string>): GoalStatus[] {
  const list: GoalStatus[] = ['all', e.active ? 'active' : 'off']
  if (e.active && ready.has(e.id)) list.push('ready')
  return list
}

/** Extra item needs pass the search and status filters; element, rarity or weapon filters hide them. */
export function filterItems(
  items: readonly ItemGoalView[],
  f: GoalFilters,
  inStock: (item: ItemGoalView) => boolean,
): ItemGoalView[] {
  if (f.element !== 'all' || f.rarity !== 'all' || f.weaponType !== 'all') return []
  const words = normalizeSearch(f.query).split(' ').filter(Boolean)
  return items.filter((i) => {
    if (!statusMatches(f.status, i.target.active, inStock(i))) return false
    const text = normalizeSearch(`${i.name} ${i.target.note ?? ''}`)
    return words.every((w) => text.includes(w))
  })
}

/**
 * Sorted copy. `missing`: fewest missing materials first (each goal alone),
 * `favorites` and `priority` (lower first, unset last) fall back to name.
 */
export function sortGoals(
  entries: readonly GoalEntry[],
  sort: GoalSort,
  missing: ReadonlyMap<string, number>,
): GoalEntry[] {
  const byName = (a: GoalEntry, b: GoalEntry) =>
    Number(a.character === null) - Number(b.character === null) || a.name.localeCompare(b.name)
  const compare: Record<GoalSort, (a: GoalEntry, b: GoalEntry) => number> = {
    name: () => 0,
    missing: (a, b) =>
      (missing.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (missing.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    favorites: (a, b) => Number(b.favorite) - Number(a.favorite),
    priority: (a, b) =>
      (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER),
  }
  return [...entries].sort((a, b) => compare[sort](a, b) || byName(a, b))
}
