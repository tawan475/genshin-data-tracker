/**
 * Names and number formats for artifact stats, slots and sets (GOOD keys),
 * in the language on screen (the `game` messages).
 */

import { keyToName } from '@/lib/format'
import { ARTIFACT_SET_NAMES } from '@/data/artifacts-sets'
import { labelTable, labelsFor } from '@/i18n/labels'

const STAT_NAMES = labelTable<string>('stat')

/** Main stats in the game's order, for menus. */
export const MAIN_STAT_ORDER: readonly string[] = [
  'hp',
  'atk',
  'hp_',
  'atk_',
  'def_',
  'eleMas',
  'enerRech_',
  'critRate_',
  'critDMG_',
  'heal_',
  'pyro_dmg_',
  'hydro_dmg_',
  'electro_dmg_',
  'cryo_dmg_',
  'anemo_dmg_',
  'geo_dmg_',
  'dendro_dmg_',
  'physical_dmg_',
]

const STAT_SHORT = labelTable<string>('statShort')

export function formatStatName(key: string): string {
  return STAT_NAMES[key] ?? keyToName(key)
}

/** Compact label for cards: "EM", "ER", "Pyro", else the full name. */
export function formatStatShort(key: string): string {
  return STAT_SHORT[key] ?? formatStatName(key)
}

/** "7.8%" for percentages, "299" for flat stats, as the game shows them. */
export function formatStatValue(key: string, value: number): string {
  if (key.endsWith('_')) return `${value.toFixed(1)}%`
  return Math.round(value).toString()
}

/** A single roll keeps its second decimal: "3.89%", "19.45". */
export function formatRollValue(key: string, value: number): string {
  return key.endsWith('_') ? `${value.toFixed(2)}%` : value.toFixed(2)
}

/** "GladiatorsFinale" -> "Gladiator's Finale"; unknown sets are spaced out. */
export function formatSetName(setKey: string): string {
  return ARTIFACT_SET_NAMES[setKey] ?? keyToName(setKey)
}

export const SLOT_NAMES = labelTable<string>('slotFull')

/** "Flower", "Plume", … (short, for cards and pills). */
export function formatSlotName(slotKey: string): string {
  return (
    labelsFor('slot')[slotKey] ??
    (slotKey ? slotKey.charAt(0).toUpperCase() + slotKey.slice(1) : slotKey)
  )
}

export function formatSlotFullName(slotKey: string): string {
  return SLOT_NAMES[slotKey] ?? formatSlotName(slotKey)
}

/** Crit value with one decimal: "32.6". */
export function formatCv(cv: number): string {
  return cv.toFixed(1)
}

const STAT_TINY = labelTable<string>('statTiny')

/** Tightest label, for table cells: "CR", "CD", "ER", "EM", "ATK%", "HP". */
export function formatStatTiny(key: string): string {
  return STAT_TINY[key] ?? formatStatShort(key)
}

const STAT_TILE = labelTable<string>('statTile')

/** Shortest label, for bag tiles: "CR", "ATK%", "Pyro", "Elec", "Phys", "Heal". */
export function formatStatTile(key: string): string {
  return STAT_TILE[key] ?? formatStatTiny(key)
}
