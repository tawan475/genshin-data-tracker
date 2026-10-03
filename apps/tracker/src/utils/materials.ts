import { keyToName } from '@/lib/format'

/** Display name for a GOOD material key ("MysticEnhancementOre" -> "Mystic Enhancement Ore"). */
export function materialName(key: string): string {
  return keyToName(key)
}

/** Lowercase, symbols dropped (GOOD keys have none: "Hero's Wit" is "HerosWit"). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
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
