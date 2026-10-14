import {
  loadMaterialIndex,
  loadMaterialNames,
  type MaterialIndex,
  type MaterialNames,
} from '@gdt/game-data'
import { shallowRef } from 'vue'
import { keyToName } from '@/lib/format'
import { normalizeSearch } from '@/lib/search'
import { onLocaleLoad } from '@/i18n'
import { locale, type Locale } from '@/i18n/locale'

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

// The game data's names (per language) and index, reactive: whatever
// rendered with the fallbacks re-renders once they arrive.
const names = shallowRef<ReadonlyMap<Locale, MaterialNames>>(new Map())
const index = shallowRef<MaterialIndex | null>(null)
const namesLoading = new Map<Locale, Promise<void>>()
let indexLoading: Promise<void> | null = null
let indexFailed = false

/**
 * Starts loading the game's material names in `target` (the language on
 * screen by default; their own lazy chunk, ~63 KB gzip, once per language;
 * Chinese loads the English too, for the few names it lacks) and resolves
 * when they are in. Never rejects: on a failure the names stay key-derived,
 * and the next call tries again.
 */
export function preloadMaterialNames(target: Locale = locale.value): Promise<void> {
  const languages: Locale[] = target === 'en' ? ['en'] : [target, 'en']
  return Promise.all(
    languages.map((lang) => {
      let loading = namesLoading.get(lang)
      if (!loading) {
        loading = loadMaterialNames(lang).then(
          (loaded) => void (names.value = new Map(names.value).set(lang, loaded)),
          () => void namesLoading.delete(lang),
        )
        namesLoading.set(lang, loading)
      }
      return loading
    }),
  ).then(() => undefined)
}

// A switch loads the new language's names first, when a page already used some.
onLocaleLoad((target) => (namesLoading.size > 0 ? preloadMaterialNames(target) : Promise.resolve()))

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
  const target = locale.value
  if (!namesLoading.has(target)) void preloadMaterialNames(target)
  const loaded = names.value
  return loaded.get(target)?.name(key) || resolveMaterialName(key, loaded.get('en'))
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
const normalize = normalizeSearch

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
