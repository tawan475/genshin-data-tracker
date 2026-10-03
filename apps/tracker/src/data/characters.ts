/**
 * The Characters page's model: one pass over a GOOD inventory joins every
 * character with the weapon and artifacts it wears, adds rarity / element /
 * weapon type from the static tables, and derives what the cards show (set
 * bonuses, total crit value). Pure functions; the view only filters and sorts
 * the result.
 */

import { calculateCV, type Good, type GoodArtifact, type GoodWeapon } from '@gdt/shared'
import { keyToName } from '@/lib/format'
import {
  ARTIFACT_MAIN_STATS,
  ARTIFACT_SET_THRESHOLDS,
  CHARACTER_META,
  type Element,
  type WeaponType,
} from './characters-meta'
import { WEAPON_META } from './weapons-meta'
import { itemName } from './weapons'

export { WEAPON_TYPES, WEAPON_TYPE_LABELS, itemName } from './weapons'

export type { Element, WeaponType }

export const SLOT_ORDER = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const
export type SlotKey = (typeof SLOT_ORDER)[number]

export const SLOT_LABELS: Record<SlotKey, string> = {
  flower: 'Flower',
  plume: 'Plume',
  sands: 'Sands',
  goblet: 'Goblet',
  circlet: 'Circlet',
}

/** In-game order. */
export const ELEMENTS: readonly Element[] = [
  'pyro',
  'hydro',
  'anemo',
  'electro',
  'dendro',
  'cryo',
  'geo',
]

export const ELEMENT_LABELS: Record<Element, string> = {
  pyro: 'Pyro',
  hydro: 'Hydro',
  anemo: 'Anemo',
  electro: 'Electro',
  dendro: 'Dendro',
  cryo: 'Cryo',
  geo: 'Geo',
}

export interface EquippedWeapon extends GoodWeapon {
  name: string
  rarity: number | null
  type: WeaponType | null
}

export interface EquippedArtifact extends GoodArtifact {
  slotKey: SlotKey
  /** Main stat at this level and rarity; null when the table has no value. */
  mainStatValue: number | null
  cv: number
}

export interface SetCount {
  setKey: string
  name: string
  count: number
  /** Piece counts at which the set grants a bonus (usually 2 and 4). */
  thresholds: readonly number[]
  /** The thresholds this character reaches. */
  active: number[]
}

export interface CharacterView {
  key: string
  name: string
  rarity: number | null
  element: Element | null
  weaponType: WeaponType | null
  level: number
  ascension: number
  constellation: number
  talent: { auto: number; skill: number; burst: number }
  talentTotal: number
  weapon: EquippedWeapon | null
  /** One entry per slot, in SLOT_ORDER; null for an empty slot. */
  artifacts: (EquippedArtifact | null)[]
  artifactCount: number
  /** Every set worn, most pieces first. */
  sets: SetCount[]
  /** Sets that grant at least one bonus. */
  activeSets: SetCount[]
  hasFourPiece: boolean
  /** Crit value summed over the equipped artifacts' substats. */
  cv: number
  /** Normalised name, weapon and set names, for search. */
  haystack: string
}

export interface Roster {
  characters: CharacterView[]
  total: number
  c6: number
  /** Characters at level 90 or above. */
  level90: number
}

const DEFAULT_THRESHOLDS = [2, 4] as const

export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '')
}

export function weaponInfo(key: string): { rarity: number | null; type: WeaponType | null } {
  const meta = WEAPON_META[key]
  return { rarity: meta?.[0] ?? null, type: meta?.[1] ?? null }
}

export function mainStatValue(artifact: Pick<GoodArtifact, 'rarity' | 'mainStatKey' | 'level'>) {
  return ARTIFACT_MAIN_STATS[artifact.rarity]?.[artifact.mainStatKey]?.[artifact.level] ?? null
}

function isSlot(slot: string): slot is SlotKey {
  return (SLOT_ORDER as readonly string[]).includes(slot)
}

function countSets(pieces: readonly EquippedArtifact[]): SetCount[] {
  const counts = new Map<string, number>()
  for (const piece of pieces) counts.set(piece.setKey, (counts.get(piece.setKey) ?? 0) + 1)
  return [...counts]
    .map(([setKey, count]) => {
      const thresholds = ARTIFACT_SET_THRESHOLDS[setKey] ?? DEFAULT_THRESHOLDS
      return {
        setKey,
        name: itemName(setKey),
        count,
        thresholds,
        active: thresholds.filter((t) => count >= t),
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Joins characters with what they wear. Run once per inventory. */
export function buildRoster(good: Good): Roster {
  const weapons = new Map<string, GoodWeapon>()
  for (const weapon of good.weapons) {
    if (weapon.location && !weapons.has(weapon.location)) weapons.set(weapon.location, weapon)
  }

  const artifacts = new Map<string, Map<SlotKey, EquippedArtifact>>()
  for (const artifact of good.artifacts) {
    if (!artifact.location || !isSlot(artifact.slotKey)) continue
    let slots = artifacts.get(artifact.location)
    if (!slots) artifacts.set(artifact.location, (slots = new Map()))
    if (slots.has(artifact.slotKey)) continue
    slots.set(artifact.slotKey, {
      ...artifact,
      slotKey: artifact.slotKey,
      mainStatValue: mainStatValue(artifact),
      cv: calculateCV(artifact.substats),
    })
  }

  const characters = good.characters.map((c): CharacterView => {
    const meta = CHARACTER_META[c.key]
    const worn = weapons.get(c.key)
    const weapon: EquippedWeapon | null = worn
      ? { ...worn, name: itemName(worn.key), ...weaponInfo(worn.key) }
      : null
    const slots = artifacts.get(c.key)
    const pieces = SLOT_ORDER.map((slot) => slots?.get(slot) ?? null)
    const equipped = pieces.filter((p): p is EquippedArtifact => p !== null)
    const sets = countSets(equipped)
    const activeSets = sets.filter((s) => s.active.length > 0)
    const name = keyToName(c.key)
    return {
      key: c.key,
      name,
      rarity: meta?.[0] ?? null,
      element: meta?.[1] ?? null,
      weaponType: meta?.[2] ?? weapon?.type ?? null,
      level: c.level,
      ascension: c.ascension,
      constellation: c.constellation,
      talent: { ...c.talent },
      talentTotal: c.talent.auto + c.talent.skill + c.talent.burst,
      weapon,
      artifacts: pieces,
      artifactCount: equipped.length,
      sets,
      activeSets,
      hasFourPiece: sets.some((s) => s.count >= 4),
      cv: Number(equipped.reduce((sum, p) => sum + p.cv, 0).toFixed(1)),
      haystack: normalizeSearch(
        [name, c.key, weapon?.name ?? '', ...activeSets.map((s) => s.name)].join(' '),
      ),
    }
  })

  return {
    characters,
    total: characters.length,
    c6: characters.filter((c) => c.constellation >= 6).length,
    level90: characters.filter((c) => c.level >= 90).length,
  }
}

const STAT_ORDER = [
  'hp',
  'hp_',
  'atk',
  'atk_',
  'def',
  'def_',
  'eleMas',
  'enerRech_',
  'critRate_',
  'critDMG_',
  'heal_',
]

/**
 * What the equipped artifacts add up to, main stats included where the table
 * knows them (inactive substats are not counted).
 */
export function artifactTotals(character: CharacterView): { key: string; value: number }[] {
  const totals = new Map<string, number>()
  const add = (key: string, value: number) => totals.set(key, (totals.get(key) ?? 0) + value)
  for (const piece of character.artifacts) {
    if (!piece) continue
    if (piece.mainStatValue !== null) add(piece.mainStatKey, piece.mainStatValue)
    for (const sub of piece.substats) add(sub.key, sub.value)
  }
  const rank = (key: string) => {
    const index = STAT_ORDER.indexOf(key)
    return index === -1 ? STAT_ORDER.length : index
  }
  return [...totals]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
}

// ------------------------------------------------------------ filter & sort

export type CharacterSort =
  | 'level'
  | 'constellation'
  | 'talents'
  | 'cv'
  | 'rarity'
  | 'element'
  | 'name'
export type SortDirection = 'asc' | 'desc'

export const CHARACTER_SORTS: { value: CharacterSort; label: string; natural: SortDirection }[] = [
  { value: 'level', label: 'Level', natural: 'desc' },
  { value: 'constellation', label: 'Constellation', natural: 'desc' },
  { value: 'talents', label: 'Talents', natural: 'desc' },
  { value: 'cv', label: 'CV', natural: 'desc' },
  { value: 'rarity', label: 'Rarity', natural: 'desc' },
  { value: 'element', label: 'Element', natural: 'asc' },
  { value: 'name', label: 'Name', natural: 'asc' },
]

export interface CharacterFilters {
  query: string
  element: Element | 'all'
  rarity: 'all' | 5 | 4
  weaponType: WeaponType | 'all'
  fourPiece: boolean
  talents9: boolean
}

export const NO_CHARACTER_FILTERS: CharacterFilters = {
  query: '',
  element: 'all',
  rarity: 'all',
  weaponType: 'all',
  fourPiece: false,
  talents9: false,
}

export function hasCharacterFilters(f: CharacterFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.element !== 'all' ||
    f.rarity !== 'all' ||
    f.weaponType !== 'all' ||
    f.fourPiece ||
    f.talents9
  )
}

export function filterCharacters(
  list: readonly CharacterView[],
  f: CharacterFilters,
): CharacterView[] {
  const words = normalizeSearch(f.query).split(' ').filter(Boolean)
  return list.filter(
    (c) =>
      (f.element === 'all' || c.element === f.element) &&
      (f.rarity === 'all' || c.rarity === f.rarity) &&
      (f.weaponType === 'all' || c.weaponType === f.weaponType) &&
      (!f.fourPiece || c.hasFourPiece) &&
      (!f.talents9 || (c.talent.auto >= 9 && c.talent.skill >= 9 && c.talent.burst >= 9)) &&
      words.every((w) => c.haystack.includes(w)),
  )
}

const elementRank = (e: Element | null) => (e ? ELEMENTS.indexOf(e) : ELEMENTS.length)

const compareBy: Record<CharacterSort, (a: CharacterView, b: CharacterView) => number> = {
  level: (a, b) => a.level - b.level || a.ascension - b.ascension,
  constellation: (a, b) => a.constellation - b.constellation,
  talents: (a, b) => a.talentTotal - b.talentTotal,
  cv: (a, b) => a.cv - b.cv,
  rarity: (a, b) => (a.rarity ?? 0) - (b.rarity ?? 0),
  // Ascending follows the game's element order.
  element: (a, b) => elementRank(a.element) - elementRank(b.element),
  name: (a, b) => a.name.localeCompare(b.name),
}

/**
 * Sorts by `sort` in `direction`; ties fall back to level (high first), then
 * rarity, then name, so the order is stable and meaningful either way.
 */
export function sortCharacters(
  list: readonly CharacterView[],
  sort: CharacterSort,
  direction: SortDirection,
): CharacterView[] {
  const sign = direction === 'asc' ? 1 : -1
  const primary = compareBy[sort]
  return [...list].sort(
    (a, b) =>
      sign * primary(a, b) ||
      compareBy.level(b, a) ||
      compareBy.rarity(b, a) ||
      compareBy.name(a, b),
  )
}
