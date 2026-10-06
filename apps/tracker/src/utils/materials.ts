import {
  loadMaterialIndex,
  loadMaterialNames,
  type MaterialIndex,
  type MaterialNames,
} from '@gdt/game-data'
import { shallowRef } from 'vue'
import { keyToName } from '@/lib/format'

/**
 * A material's name: the game's ("Hero's Wit", `Basic Tent: "A Nap Beneath
 * the Snow"`), else its key's words ("HerosWit" -> "Heros Wit") for a key
 * the names don't know (newer than the game data) or before they load. Pure.
 */
export function resolveMaterialName(
  key: string,
  names: Pick<MaterialNames, 'name'> | null | undefined,
): string {
  return names?.name(key) || keyToName(key)
}

const isRarity = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5

/**
 * A material's rarity, 1-5: the material index's, which has every kind of
 * item (food, gadgets, quest items, blueprints, local specialties), else
 * `fallback` (the planner data's, which is 0 for local specialties) when it
 * is a rarity, else null (a neutral backdrop). Pure.
 */
export function resolveMaterialRarity(
  key: string,
  index: Pick<MaterialIndex, 'rarity'> | null | undefined,
  fallback?: number | null,
): number | null {
  const rarity = index?.rarity(key)
  if (isRarity(rarity)) return rarity
  return isRarity(fallback) ? fallback : null
}

// The game data's names and index, reactive: whatever rendered with the
// fallbacks re-renders once they arrive.
const names = shallowRef<MaterialNames | null>(null)
const index = shallowRef<MaterialIndex | null>(null)
let namesLoading: Promise<void> | null = null
let indexLoading: Promise<void> | null = null
let namesFailed = false
let indexFailed = false

/**
 * Starts loading the game's material names (their own lazy chunk, ~63 KB
 * gzip, once) and resolves when they are in. Never rejects: on a failure
 * the names stay key-derived, and the next call tries again.
 */
export function preloadMaterialNames(): Promise<void> {
  if (namesFailed) namesLoading = null
  namesFailed = false
  namesLoading ??= loadMaterialNames().then(
    (loaded) => void (names.value = loaded),
    () => void (namesFailed = true),
  )
  return namesLoading
}

/** As preloadMaterialNames, for the material index (rarities; the icons load the same chunk). */
export function preloadMaterialRarities(): Promise<void> {
  if (indexFailed) indexLoading = null
  indexFailed = false
  indexLoading ??= loadMaterialIndex().then(
    (loaded) => void (index.value = loaded),
    () => void (indexFailed = true),
  )
  return indexLoading
}

/**
 * Display name for a GOOD material key: the game's once the names are in
 * (the first call starts loading them), the key's words until then.
 * Reactive, so a template or computed using it updates when they arrive.
 */
export function materialName(key: string): string {
  if (!namesLoading) void preloadMaterialNames()
  return resolveMaterialName(key, names.value)
}

/**
 * A material's rarity for its backdrop (see resolveMaterialRarity): the
 * index's once it is in (the first call starts loading it), `fallback`
 * until then. Reactive, like materialName.
 */
export function materialRarity(key: string, fallback?: number | null): number | null {
  if (!indexLoading) void preloadMaterialRarities()
  return resolveMaterialRarity(key, index.value, fallback)
}

/**
 * Lowercase, accents folded and symbols dropped ("Hero's Wit" is "heros
 * wit", "Sautéed" is "sauteed"; GOOD keys have none: "HerosWit").
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
}

/**
 * A search over material names: every word of the query must appear in the
 * name (any order, any case, symbols ignored). Returns null for an empty query.
 */
export function materialMatcher(query: string): ((name: string) => boolean) | null {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  return (name) => {
    const haystack = normalize(name)
    return words.every((word) => haystack.includes(word))
  }
}

/** Sort rank for a search hit: names starting with the query come first. */
export function matchRank(name: string, query: string): number {
  const q = normalize(query).trim()
  const n = normalize(name)
  if (n.startsWith(q)) return 0
  if (n.includes(` ${q}`)) return 1
  return 2
}

/**
 * Account stats that older Irminsul builds exported as materials: player
 * properties such as world level or stamina, and unnamed `Property<id>`
 * entries. Current builds export only real items, but stored snapshots keep
 * them, so the materials page hides them unless asked.
 */
const PLAYER_PROPERTIES = new Set([
  'AdventureRank',
  'CanDive',
  'CurPersistStamina',
  'CurSpringVolume',
  'DiveCurStamina',
  'DiveMaxStamina',
  'IsFlyable',
  'IsSpringAutoUse',
  'IsTransferable',
  'LastChangeAvatarTime',
  'LegendaryDailyTaskNum',
  'MaxSpringVolume',
  'MaxStamina',
  'MpSettingType',
  'SpringAutoUsePercent',
  'WorldLevel',
  'WorldLevelAdjustCd',
  'WorldLevelLimit',
])

export function isPlayerProperty(key: string): boolean {
  return PLAYER_PROPERTIES.has(key) || /^Property\d+$/.test(key)
}
