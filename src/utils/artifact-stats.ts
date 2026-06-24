const STAT_NAME_MAP: Record<string, string> = {
  hp: 'HP',
  hp_: 'HP%',
  atk: 'ATK',
  atk_: 'ATK%',
  def: 'DEF',
  def_: 'DEF%',
  eleMas: 'EM',
  enerRech_: 'ER%',
  critRate_: 'CRIT Rate',
  critDMG_: 'CRIT DMG',
  heal_: 'Healing Bonus',
  hydro_dmg_: 'Hydro DMG',
  pyro_dmg_: 'Pyro DMG',
  cryo_dmg_: 'Cryo DMG',
  electro_dmg_: 'Electro DMG',
  anemo_dmg_: 'Anemo DMG',
  geo_dmg_: 'Geo DMG',
  dendro_dmg_: 'Dendro DMG',
  physical_dmg_: 'Physical DMG',
}

export interface ArtifactSubstat {
  key: string
  value: number
}

export interface ArtifactCardData {
  id?: number
  setKey: string
  slotKey: string
  level: number
  rarity?: number
  mainStatKey: string
  substats: ArtifactSubstat[]
  cv: number
  rv: number
  lock?: boolean
  location?: string
  genshinAccount?: { accountName?: string | null }
}

export function formatStatName(key: string): string {
  return STAT_NAME_MAP[key] ?? key
}

export function formatStatValue(key: string, val: number): string {
  if (key.endsWith('_')) return `${val.toFixed(1)}%`
  return Math.round(val).toString()
}

export function getSubstatColorClass(key: string): string {
  if (key.includes('critRate') || key.includes('critDMG')) {
    return 'text-red-500 dark:text-red-400'
  }
  if (key.includes('atk')) return 'text-orange-500 dark:text-orange-400'
  if (key.includes('enerRech')) return 'text-purple-500 dark:text-purple-400'
  if (key.includes('eleMas')) return 'text-emerald-500 dark:text-emerald-400'
  return 'text-slate-600 dark:text-slate-400'
}

/** "GladiatorsFinale" → "Gladiators Finale" */
export function formatSetName(setKey: string): string {
  return setKey.replace(/([A-Z])/g, ' $1').trim()
}

export function formatRarityStars(rarity?: number): string {
  if (!rarity || rarity < 1) return ''
  return '⭐'.repeat(Math.min(rarity, 5))
}

export function formatSlotName(slotKey: string): string {
  const map: Record<string, string> = {
    flower: 'Flower',
    plume: 'Plume',
    sands: 'Sands',
    goblet: 'Goblet',
    circlet: 'Circlet',
  }
  return map[slotKey] ?? slotKey
}

export function rarityBorderClass(rarity?: number): string {
  switch (rarity) {
    case 5:
      return 'border-amber-400/60 dark:border-amber-500/50'
    case 4:
      return 'border-purple-400/60 dark:border-purple-500/50'
    case 3:
      return 'border-blue-400/60 dark:border-blue-500/50'
    case 2:
      return 'border-emerald-400/60 dark:border-emerald-500/50'
    default:
      return 'border-slate-200 dark:border-slate-700'
  }
}

export function rarityGlowClass(rarity?: number): string {
  switch (rarity) {
    case 5:
      return 'from-amber-500/15 to-orange-500/5'
    case 4:
      return 'from-purple-500/15 to-indigo-500/5'
    default:
      return 'from-indigo-500/10 to-purple-500/5'
  }
}
