/**
 * The Goals tab's toolbar: search, status, element / rarity / weapon type
 * filters, the "Upgrade now" and "No weekly boss" toggles, the material
 * (material-filter.ts; chips and options count "matches if you pick this",
 * like the Characters page) and the sort orders. Pure functions over the
 * board's entries and what the page knows of each (`GoalFacts`).
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
  /** Only counted goals that can level now (upgrade.ts: a part, or its next step). */
  upgrade: boolean
  /** Only counted goals still to farm, but no weekly boss (upgrade.ts `farmsNoWeekly`). */
  noWeekly: boolean
  /** Only counted goals whose remaining cost uses this material option (its key; null: any). */
  material: string | null
}

export const NO_GOAL_FILTERS: GoalFilters = {
  query: '',
  status: 'all',
  element: 'all',
  rarity: 'all',
  weaponType: 'all',
  upgrade: false,
  noWeekly: false,
  material: null,
}

/** What the filters know of each goal, by entry id. */
export interface GoalFacts {
  /** Counted goals the bag covers on their own (In stock). */
  ready: ReadonlySet<string>
  /** Counted goals with a part that can level now (Upgrade now). */
  upgrade: ReadonlySet<string>
  /** Counted goals still to farm, none of it from a weekly boss (No weekly boss). */
  noWeekly: ReadonlySet<string>
  /** Per counted goal, the material options its remaining cost uses (material-filter.ts). */
  materials?: ReadonlyMap<string, ReadonlySet<string>>
}

export type GoalToggle = 'upgrade' | 'noWeekly'

export type GoalFacet = 'status' | 'element' | 'rarity' | 'material' | GoalToggle

const TOGGLES: readonly GoalToggle[] = ['upgrade', 'noWeekly']

/** The toggles as stored ("upgrade,noWeekly"; null when none is on). */
export function goalTogglesValue(f: Pick<GoalFilters, GoalToggle>): string | null {
  const on = TOGGLES.filter((t) => f[t])
  return on.length ? on.join(',') : null
}

/** The stored toggles back (unknown words ignored). */
export function parseGoalToggles(raw: string | null): Pick<GoalFilters, GoalToggle> {
  const words = new Set((raw ?? '').split(','))
  return { upgrade: words.has('upgrade'), noWeekly: words.has('noWeekly') }
}

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
  facts: GoalFacts,
  except?: GoalFacet,
): GoalEntry[] {
  const words = normalizeSearch(f.query).split(' ').filter(Boolean)
  return entries.filter((e) => {
    if (except !== 'status' && !statusMatches(f.status, e.active, facts.ready.has(e.id)))
      return false
    if (except !== 'upgrade' && f.upgrade && !facts.upgrade.has(e.id)) return false
    if (except !== 'noWeekly' && f.noWeekly && !facts.noWeekly.has(e.id)) return false
    if (except !== 'material' && f.material && !facts.materials?.get(e.id)?.has(f.material))
      return false
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
  facts: GoalFacts,
  facet: Exclude<GoalFacet, GoalToggle>,
  value: (e: GoalEntry) => K | readonly K[],
): Map<K, number> {
  const counts = new Map<K, number>()
  for (const e of filterGoals(entries, f, facts, facet)) {
    const v = value(e)
    for (const k of Array.isArray(v) ? (v as readonly K[]) : [v as K]) {
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  return counts
}

/** How many entries a toggle would leave, with every other filter applied (on or off). */
export function goalToggleCount(
  entries: readonly GoalEntry[],
  f: GoalFilters,
  facts: GoalFacts,
  toggle: GoalToggle,
): number {
  return filterGoals(entries, { ...f, [toggle]: true }, facts).length
}

/** Status values an entry counts toward (`all` always). */
export function entryStatuses(e: GoalEntry, ready: ReadonlySet<string>): GoalStatus[] {
  const list: GoalStatus[] = ['all', e.active ? 'active' : 'off']
  if (e.active && ready.has(e.id)) list.push('ready')
  return list
}

/**
 * Extra item needs pass the search and status filters; element, rarity or
 * weapon filters, the toggles (levels, weekly bosses) and the material hide
 * them (the material counts and sums the goal cards).
 */
export function filterItems(
  items: readonly ItemGoalView[],
  f: GoalFilters,
  inStock: (item: ItemGoalView) => boolean,
): ItemGoalView[] {
  if (f.element !== 'all' || f.rarity !== 'all' || f.weaponType !== 'all') return []
  if (f.upgrade || f.noWeekly || f.material) return []
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
