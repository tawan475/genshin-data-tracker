/**
 * The Characters page's model: one pass over a GOOD inventory joins every
 * character with the weapon and artifacts it wears, adds rarity / element /
 * weapon type from the static tables, and derives what the cards show (set
 * bonuses, crit value, what is left to build). Pure functions; the view only
 * filters and sorts the result.
 */

import {
  calculateCV,
  calculateRV,
  type Good,
  type GoodArtifact,
  type GoodWeapon,
} from '@gdt/shared'
import { keyToName } from '@/lib/format'
import { maxLevel } from '@/utils/artifact-rolls'
import {
  ARTIFACT_MAIN_STATS,
  ARTIFACT_SET_THRESHOLDS,
  CHARACTER_META,
  type Element,
  type WeaponType,
} from './characters-meta'
import { WEAPON_META } from './weapons-meta'
import { WEAPON_TYPE_LABELS, itemName } from './weapons'

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

/** The level every build aims for (95 and 100 are extras). */
export const TARGET_LEVEL = 90

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
  rv: number
  maxed: boolean
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

/** Something left to do on a build. */
export type GapKind = 'level' | 'weapon' | 'artifacts' | 'set'

export interface Gap {
  kind: GapKind
  /** Short, for a tooltip: "Lv 80", "Weapon Lv 70", "3/5 artifacts". */
  text: string
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
  /** Talents at 10 (each took a Crown of Insight). */
  crowns: number
  weapon: EquippedWeapon | null
  /** One entry per slot, in SLOT_ORDER; null for an empty slot. */
  artifacts: (EquippedArtifact | null)[]
  artifactCount: number
  /** Every set worn, most pieces first. */
  sets: SetCount[]
  /** Sets that grant at least one bonus. */
  activeSets: SetCount[]
  /** Set bonuses granted: 2 for a 4-piece or 2 + 2. */
  bonusCount: number
  hasFourPiece: boolean
  /** Crit value summed over the equipped artifacts' substats. */
  cv: number
  /** Crit rate and crit damage from artifacts (main stats included). */
  critRate: number
  critDmg: number
  gaps: Gap[]
  /** Friendship level 1-10, from irminsul's `gi_characters`; null when unknown. */
  friendship: number | null
  /** When the character joined the account (epoch ms), from `gi_characters`; null when unknown. */
  obtainedAt: number | null
  /** Normalised name, element, weapon and set names, for search. */
  haystack: string
}

export interface Roster {
  characters: CharacterView[]
  total: number
  c6: number
  /** Characters at level 90 or above. */
  level90: number
  /** Talents at 10, over the whole roster. */
  crowns: number
  /** Characters with nothing left to build. */
  ready: number
  /** Whether the snapshot knows any friendship level / obtained date (irminsul's extras). */
  hasFriendship: boolean
  hasObtained: boolean
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

function findGaps(
  level: number,
  weapon: EquippedWeapon | null,
  equipped: readonly EquippedArtifact[],
  bonusCount: number,
): Gap[] {
  const gaps: Gap[] = []
  if (level < TARGET_LEVEL) gaps.push({ kind: 'level', text: `Lv ${level}` })
  if (!weapon) gaps.push({ kind: 'weapon', text: 'No weapon' })
  else if (weapon.level < TARGET_LEVEL) {
    gaps.push({ kind: 'weapon', text: `Weapon Lv ${weapon.level}` })
  }
  const unlevelled = equipped.filter((p) => !p.maxed).length
  if (equipped.length < SLOT_ORDER.length) {
    gaps.push({ kind: 'artifacts', text: `${equipped.length}/5 artifacts` })
  } else if (unlevelled > 0) {
    gaps.push({
      kind: 'artifacts',
      text: `${unlevelled} artifact${unlevelled > 1 ? 's' : ''} below max`,
    })
  }
  if (equipped.length > 0 && bonusCount < 2) gaps.push({ kind: 'set', text: 'No full set bonus' })
  return gaps
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
      rv: calculateRV(artifact.substats),
      maxed: artifact.level >= maxLevel(artifact.rarity),
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
    const bonusCount = activeSets.reduce((sum, s) => sum + s.active.length, 0)
    const name = keyToName(c.key)
    const element = meta?.[1] ?? null
    const weaponType = meta?.[2] ?? weapon?.type ?? null
    let critRate = 0
    let critDmg = 0
    for (const piece of equipped) {
      if (piece.mainStatKey === 'critRate_') critRate += piece.mainStatValue ?? 0
      if (piece.mainStatKey === 'critDMG_') critDmg += piece.mainStatValue ?? 0
      for (const sub of piece.substats) {
        if (sub.key === 'critRate_') critRate += sub.value
        if (sub.key === 'critDMG_') critDmg += sub.value
      }
    }
    const talent = { ...c.talent }
    const extra = good.gi_characters?.[c.key]
    return {
      key: c.key,
      name,
      rarity: meta?.[0] ?? null,
      element,
      weaponType,
      level: c.level,
      ascension: c.ascension,
      constellation: c.constellation,
      talent,
      talentTotal: talent.auto + talent.skill + talent.burst,
      crowns: [talent.auto, talent.skill, talent.burst].filter((t) => t >= 10).length,
      weapon,
      artifacts: pieces,
      artifactCount: equipped.length,
      sets,
      activeSets,
      bonusCount,
      hasFourPiece: sets.some((s) => s.count >= 4),
      cv: Number(equipped.reduce((sum, p) => sum + p.cv, 0).toFixed(1)),
      critRate: Number(critRate.toFixed(1)),
      critDmg: Number(critDmg.toFixed(1)),
      gaps: findGaps(c.level, weapon, equipped, bonusCount),
      friendship: extra?.friendship ?? null,
      obtainedAt: extra?.obtainedAt !== undefined ? extra.obtainedAt * 1000 : null,
      haystack: normalizeSearch(
        [
          name,
          c.key,
          element ? ELEMENT_LABELS[element] : '',
          weaponType ? WEAPON_TYPE_LABELS[weaponType] : '',
          weapon?.name ?? '',
          ...activeSets.map((s) => s.name),
        ].join(' '),
      ),
    }
  })

  return {
    characters,
    total: characters.length,
    c6: characters.filter((c) => c.constellation >= 6).length,
    level90: characters.filter((c) => c.level >= TARGET_LEVEL).length,
    crowns: characters.reduce((sum, c) => sum + c.crowns, 0),
    ready: characters.filter((c) => c.gaps.length === 0).length,
    hasFriendship: characters.some((c) => c.friendship !== null),
    hasObtained: characters.some((c) => c.obtainedAt !== null),
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
  | 'friendship'
  | 'obtained'
export type SortDirection = 'asc' | 'desc'

export interface SortOption {
  value: CharacterSort
  label: string
  natural: SortDirection
}

export const CHARACTER_SORTS: SortOption[] = [
  { value: 'level', label: 'Level', natural: 'desc' },
  { value: 'constellation', label: 'Constellation', natural: 'desc' },
  { value: 'talents', label: 'Talents', natural: 'desc' },
  { value: 'cv', label: 'CV', natural: 'desc' },
  { value: 'rarity', label: 'Rarity', natural: 'desc' },
  { value: 'element', label: 'Element', natural: 'asc' },
  { value: 'name', label: 'Name', natural: 'asc' },
  { value: 'friendship', label: 'Friendship', natural: 'desc' },
  { value: 'obtained', label: 'Obtained', natural: 'desc' },
]

/** The sorts this roster can use: friendship and obtained only when a snapshot knows them. */
export function characterSorts(
  roster: Pick<Roster, 'hasFriendship' | 'hasObtained'>,
): SortOption[] {
  return CHARACTER_SORTS.filter(
    (s) =>
      (s.value !== 'friendship' || roster.hasFriendship) &&
      (s.value !== 'obtained' || roster.hasObtained),
  )
}

export type BuildFilter = 'all' | 'ready' | 'needs' | GapKind
export type TalentFilter = 'all' | 'nine' | 'crowned' | 'below'

export const BUILD_OPTIONS: { value: BuildFilter; label: string }[] = [
  { value: 'all', label: 'Build' },
  { value: 'ready', label: 'Ready' },
  { value: 'needs', label: 'Needs work' },
  { value: 'level', label: 'Lv < 90' },
  { value: 'weapon', label: 'Weapon < 90' },
  { value: 'artifacts', label: 'Artifacts < max' },
  { value: 'set', label: 'No set bonus' },
]

export const TALENT_OPTIONS: { value: TalentFilter; label: string }[] = [
  { value: 'all', label: 'Talents' },
  { value: 'nine', label: 'All 9+' },
  { value: 'crowned', label: 'Crowned' },
  { value: 'below', label: 'Any < 9' },
]

export interface CharacterFilters {
  query: string
  element: Element | 'all'
  rarity: 'all' | 5 | 4
  weaponType: WeaponType | 'all'
  build: BuildFilter
  talents: TalentFilter
}

export const NO_CHARACTER_FILTERS: CharacterFilters = {
  query: '',
  element: 'all',
  rarity: 'all',
  weaponType: 'all',
  build: 'all',
  talents: 'all',
}

export function hasCharacterFilters(f: CharacterFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.element !== 'all' ||
    f.rarity !== 'all' ||
    f.weaponType !== 'all' ||
    f.build !== 'all' ||
    f.talents !== 'all'
  )
}

function buildMatches(c: CharacterView, build: BuildFilter): boolean {
  if (build === 'all') return true
  if (build === 'ready') return c.gaps.length === 0
  if (build === 'needs') return c.gaps.length > 0
  return c.gaps.some((g) => g.kind === build)
}

function talentsMatch(c: CharacterView, talents: TalentFilter): boolean {
  const { auto, skill, burst } = c.talent
  const lowest = Math.min(auto, skill, burst)
  if (talents === 'nine') return lowest >= 9
  if (talents === 'crowned') return c.crowns > 0
  if (talents === 'below') return lowest < 9
  return true
}

/** Facets whose chips show "matches if you pick this" counts. */
export type CharacterFacet = 'element' | 'rarity'

export function filterCharacters(
  list: readonly CharacterView[],
  f: CharacterFilters,
  except?: CharacterFacet,
): CharacterView[] {
  const words = normalizeSearch(f.query).split(' ').filter(Boolean)
  return list.filter(
    (c) =>
      (except === 'element' || f.element === 'all' || c.element === f.element) &&
      (except === 'rarity' || f.rarity === 'all' || c.rarity === f.rarity) &&
      (f.weaponType === 'all' || c.weaponType === f.weaponType) &&
      buildMatches(c, f.build) &&
      talentsMatch(c, f.talents) &&
      words.every((w) => c.haystack.includes(w)),
  )
}

/** Per-value counts of one facet, with every other filter applied. */
export function facetCounts<K>(
  list: readonly CharacterView[],
  f: CharacterFilters,
  facet: CharacterFacet,
  value: (c: CharacterView) => K,
): Map<K, number> {
  const counts = new Map<K, number>()
  for (const c of filterCharacters(list, f, facet)) {
    const k = value(c)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
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
  friendship: (a, b) => (a.friendship ?? 0) - (b.friendship ?? 0),
  obtained: (a, b) => (a.obtainedAt ?? 0) - (b.obtainedAt ?? 0),
}

/** Sorts on a value a character may lack; those characters go last either way. */
const unknownFor: Partial<Record<CharacterSort, (c: CharacterView) => boolean>> = {
  friendship: (c) => c.friendship === null,
  obtained: (c) => c.obtainedAt === null,
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
  const unknown = unknownFor[sort]
  return [...list].sort(
    (a, b) =>
      (unknown ? Number(unknown(a)) - Number(unknown(b)) : 0) ||
      sign * primary(a, b) ||
      compareBy.level(b, a) ||
      compareBy.rarity(b, a) ||
      compareBy.name(a, b),
  )
}
