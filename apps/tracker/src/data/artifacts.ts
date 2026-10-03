/**
 * The artifacts page's data: rows derived once per inventory, then filtered
 * and sorted with plain functions. Nothing here touches Vue or the network
 * (apart from the two storage helpers at the end).
 */

import { calculateCV, calculateRV, type GoodArtifact } from '@gdt/shared'
import { keyToName } from '@/lib/format'
import { readJson, writeJson } from '@/lib/storage'
import { inferArtifactRolls, maxLevel, type InferredRoll } from '@/utils/artifact-rolls'
import { formatSetName, formatSlotName, formatStatName } from '@/utils/artifact-stats'

export const SLOT_KEYS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const
export type SlotKey = (typeof SLOT_KEYS)[number]

export interface ArtifactRow {
  /** Position in the snapshot: stable for one inventory, used as the list key. */
  id: number
  artifact: GoodArtifact
  setName: string
  /** Index into SLOT_KEYS (5 for anything unexpected), for sorting. */
  slotIndex: number
  cv: number
  rv: number
  /** Inferred rolls per substat, same order as `artifact.substats`. */
  rolls: InferredRoll[][]
  /** Total rolls: the exported count when known, else the inferred sum. */
  rollCount: number
  equipped: boolean
  /** Unlocked, unequipped 3★ or 4★: what the game lets you feed to others. */
  fodder: boolean
  maxed: boolean
  /** Lower-case text the search box matches against. */
  haystack: string
}

const rowCache = new WeakMap<readonly GoodArtifact[], ArtifactRow[]>()

export function isFodder(artifact: GoodArtifact): boolean {
  return (
    !artifact.lock && artifact.location === '' && (artifact.rarity === 3 || artifact.rarity === 4)
  )
}

/** Derives everything the page filters, sorts and shows. Cached per artifact array. */
export function buildArtifactRows(artifacts: readonly GoodArtifact[]): ArtifactRow[] {
  const hit = rowCache.get(artifacts)
  if (hit) return hit
  const rows = artifacts.map((artifact, id): ArtifactRow => {
    const rolls = inferArtifactRolls(artifact)
    const setName = formatSetName(artifact.setKey)
    const slotIndex = SLOT_KEYS.indexOf(artifact.slotKey as SlotKey)
    const inferred = rolls.reduce((sum, r) => sum + r.length, 0)
    return {
      id,
      artifact,
      setName,
      slotIndex: slotIndex === -1 ? SLOT_KEYS.length : slotIndex,
      cv: calculateCV(artifact.substats),
      rv: calculateRV(artifact.substats),
      rolls,
      rollCount: artifact.totalRolls && artifact.totalRolls > 0 ? artifact.totalRolls : inferred,
      equipped: artifact.location !== '',
      fodder: isFodder(artifact),
      maxed: artifact.level >= maxLevel(artifact.rarity),
      haystack: [
        setName,
        artifact.setKey,
        artifact.location ? keyToName(artifact.location) : '',
        formatSlotName(artifact.slotKey),
        formatStatName(artifact.mainStatKey),
      ]
        .join(' ')
        .toLowerCase(),
    }
  })
  rowCache.set(artifacts, rows)
  return rows
}

// ------------------------------------------------------------------ filters

export type LockFilter = 'any' | 'locked' | 'unlocked'
export type EquipFilter = 'any' | 'equipped' | 'inventory'
export type AstralFilter = 'any' | 'marked' | 'unmarked'
export type ArtifactSort = 'cv' | 'rv' | 'level' | 'rarity' | 'set'

export interface ArtifactFilters {
  search: string
  sets: string[]
  slots: SlotKey[]
  /** '' for any main stat. */
  mainStat: string
  rarities: number[]
  levelMin: number
  levelMax: number
  lock: LockFilter
  equipped: EquipFilter
  astral: AstralFilter
  sort: ArtifactSort
  descending: boolean
}

export const LEVEL_MIN = 0
export const LEVEL_MAX = 20

export function defaultFilters(): ArtifactFilters {
  return {
    search: '',
    sets: [],
    slots: [],
    mainStat: '',
    rarities: [],
    levelMin: LEVEL_MIN,
    levelMax: LEVEL_MAX,
    lock: 'any',
    equipped: 'any',
    astral: 'any',
    sort: 'cv',
    descending: true,
  }
}

/** Every filter back to "any", keeping the sort. */
export function clearedFilters(current: ArtifactFilters): ArtifactFilters {
  return { ...defaultFilters(), sort: current.sort, descending: current.descending }
}

/**
 * The "Fodder" preset: unlocked, unequipped 3★–4★ (the same rule as the
 * snapshot summary's fodder count). It combines with the other filters, so
 * "fodder of this set" works.
 */
export function isFodderPreset(f: ArtifactFilters): boolean {
  return (
    f.lock === 'unlocked' &&
    f.equipped === 'inventory' &&
    f.rarities.length === 2 &&
    f.rarities.includes(3) &&
    f.rarities.includes(4)
  )
}

/** Turns the preset on, or off again (back to any lock, location and rarity). */
export function toggleFodderPreset(f: ArtifactFilters): ArtifactFilters {
  return isFodderPreset(f)
    ? { ...f, lock: 'any', equipped: 'any', rarities: [] }
    : { ...f, lock: 'unlocked', equipped: 'inventory', rarities: [4, 3] }
}

export type Facet =
  | 'search'
  | 'sets'
  | 'slots'
  | 'mainStat'
  | 'rarities'
  | 'level'
  | 'lock'
  | 'equipped'
  | 'astral'

/** How many filters narrow the list (a set or slot list counts once). */
export function activeFilterCount(f: ArtifactFilters): number {
  let count = 0
  if (f.search.trim()) count++
  if (f.sets.length) count++
  if (f.slots.length) count++
  if (f.mainStat) count++
  if (f.rarities.length) count++
  if (f.levelMin > LEVEL_MIN || f.levelMax < LEVEL_MAX) count++
  if (f.lock !== 'any') count++
  if (f.equipped !== 'any') count++
  if (f.astral !== 'any') count++
  return count
}

/**
 * Compiles the filters into one predicate. `except` leaves a facet out, which
 * is how each filter's option counts reflect all the other filters.
 */
export function compileFilter(f: ArtifactFilters, except?: Facet): (row: ArtifactRow) => boolean {
  const terms = except === 'search' ? [] : f.search.toLowerCase().split(/\s+/).filter(Boolean)
  const sets = except === 'sets' || f.sets.length === 0 ? null : new Set(f.sets)
  const slots = except === 'slots' || f.slots.length === 0 ? null : new Set<string>(f.slots)
  const mainStat = except === 'mainStat' ? '' : f.mainStat
  const rarities = except === 'rarities' || f.rarities.length === 0 ? null : new Set(f.rarities)
  const levelMin = except === 'level' ? LEVEL_MIN : f.levelMin
  const levelMax = except === 'level' ? LEVEL_MAX : f.levelMax
  const lock = except === 'lock' ? 'any' : f.lock
  const equipped = except === 'equipped' ? 'any' : f.equipped
  const astral = except === 'astral' ? 'any' : f.astral

  return (row) => {
    const a = row.artifact
    if (sets && !sets.has(a.setKey)) return false
    if (slots && !slots.has(a.slotKey)) return false
    if (mainStat && a.mainStatKey !== mainStat) return false
    if (rarities && !rarities.has(a.rarity)) return false
    if (a.level < levelMin || a.level > levelMax) return false
    if (lock !== 'any' && a.lock !== (lock === 'locked')) return false
    if (equipped !== 'any' && row.equipped !== (equipped === 'equipped')) return false
    if (astral !== 'any' && !!a.astralMark !== (astral === 'marked')) return false
    for (const term of terms) if (!row.haystack.includes(term)) return false
    return true
  }
}

/** A set in the set picker. */
export interface SetOption {
  key: string
  name: string
  /** Matches with every other filter applied. */
  count: number
}

/** Option counts for one facet, over the rows every other filter lets through. */
export function facetCounts<K>(
  rows: readonly ArtifactRow[],
  f: ArtifactFilters,
  facet: Facet,
  key: (row: ArtifactRow) => K,
): Map<K, number> {
  const matches = compileFilter(f, facet)
  const counts = new Map<K, number>()
  for (const row of rows) {
    if (!matches(row)) continue
    const k = key(row)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

// --------------------------------------------------------------------- sort

export const SORT_OPTIONS: { value: ArtifactSort; label: string }[] = [
  { value: 'cv', label: 'CV' },
  { value: 'rv', label: 'RV' },
  { value: 'level', label: 'Level' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'set', label: 'Set' },
]

/** Natural direction: numbers high to low, names A to Z. */
export function defaultDescending(sort: ArtifactSort): boolean {
  return sort !== 'set'
}

type Compare = (a: ArtifactRow, b: ArtifactRow) => number

const byCv: Compare = (a, b) => b.cv - a.cv
const byRv: Compare = (a, b) => b.rv - a.rv
const byLevel: Compare = (a, b) => b.artifact.level - a.artifact.level
const byRarity: Compare = (a, b) => b.artifact.rarity - a.artifact.rarity
const bySet: Compare = (a, b) => a.setName.localeCompare(b.setName) || a.slotIndex - b.slotIndex

const ORDER: Record<ArtifactSort, Compare[]> = {
  cv: [byCv, byRv, byLevel],
  rv: [byRv, byCv, byLevel],
  level: [byLevel, byRarity, byCv],
  rarity: [byRarity, byLevel, byCv],
  set: [bySet, byCv],
}

/**
 * A sorted copy. Filtering a sorted list keeps it sorted, so this runs only
 * when the sort changes, not on every filter change.
 */
export function sortRows(
  rows: readonly ArtifactRow[],
  sort: ArtifactSort,
  descending: boolean,
): ArtifactRow[] {
  const steps = ORDER[sort]
  // Each comparator is written for its natural direction.
  const flip = descending === defaultDescending(sort) ? 1 : -1
  return [...rows].sort((a, b) => {
    for (const step of steps) {
      const result = step(a, b)
      if (result !== 0) return result * flip
    }
    return a.id - b.id
  })
}

// ------------------------------------------------------------------ storage

const ARTIFACT_SORTS: readonly ArtifactSort[] = ['cv', 'rv', 'level', 'rarity', 'set']

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function level(value: unknown, fallback: number): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LEVEL_MIN &&
    value <= LEVEL_MAX
    ? value
    : fallback
}

/** Whatever was stored, as valid filters (old or hand-edited values fall back). */
export function sanitizeFilters(value: unknown): ArtifactFilters {
  const base = defaultFilters()
  if (!value || typeof value !== 'object') return base
  const v = value as Record<string, unknown>
  const levelMin = level(v.levelMin, base.levelMin)
  const levelMax = level(v.levelMax, base.levelMax)
  const sort = oneOf(v.sort, ARTIFACT_SORTS, base.sort)
  return {
    search: typeof v.search === 'string' ? v.search.slice(0, 100) : '',
    sets: stringList(v.sets),
    slots: stringList(v.slots).filter((s): s is SlotKey => SLOT_KEYS.includes(s as SlotKey)),
    mainStat: typeof v.mainStat === 'string' ? v.mainStat : '',
    rarities: Array.isArray(v.rarities)
      ? v.rarities.filter((r): r is number => typeof r === 'number' && r >= 1 && r <= 5)
      : [],
    levelMin: Math.min(levelMin, levelMax),
    levelMax: Math.max(levelMin, levelMax),
    lock: oneOf(v.lock, ['any', 'locked', 'unlocked'] as const, 'any'),
    equipped: oneOf(v.equipped, ['any', 'equipped', 'inventory'] as const, 'any'),
    astral: oneOf(v.astral, ['any', 'marked', 'unmarked'] as const, 'any'),
    sort,
    descending: typeof v.descending === 'boolean' ? v.descending : defaultDescending(sort),
  }
}

const storageKey = (accountId: number) => `artifacts:${accountId}`

export function loadFilters(accountId: number): ArtifactFilters {
  return sanitizeFilters(readJson<unknown>(storageKey(accountId), null))
}

export function saveFilters(accountId: number, filters: ArtifactFilters): void {
  writeJson(storageKey(accountId), filters)
}
