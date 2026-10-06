/**
 * Names and number formats for artifact stats, slots and sets (GOOD keys).
 */

import { keyToName } from '@/lib/format'
import { ARTIFACT_SET_NAMES } from '@/data/artifacts-sets'

const STAT_NAMES: Readonly<Record<string, string>> = {
  hp: 'HP',
  hp_: 'HP%',
  atk: 'ATK',
  atk_: 'ATK%',
  def: 'DEF',
  def_: 'DEF%',
  eleMas: 'Elemental Mastery',
  enerRech_: 'Energy Recharge',
  critRate_: 'CRIT Rate',
  critDMG_: 'CRIT DMG',
  heal_: 'Healing Bonus',
  pyro_dmg_: 'Pyro DMG Bonus',
  hydro_dmg_: 'Hydro DMG Bonus',
  electro_dmg_: 'Electro DMG Bonus',
  cryo_dmg_: 'Cryo DMG Bonus',
  anemo_dmg_: 'Anemo DMG Bonus',
  geo_dmg_: 'Geo DMG Bonus',
  dendro_dmg_: 'Dendro DMG Bonus',
  physical_dmg_: 'Physical DMG Bonus',
}

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

const STAT_SHORT: Readonly<Record<string, string>> = {
  eleMas: 'EM',
  enerRech_: 'ER',
  heal_: 'Healing',
  pyro_dmg_: 'Pyro',
  hydro_dmg_: 'Hydro',
  electro_dmg_: 'Electro',
  cryo_dmg_: 'Cryo',
  anemo_dmg_: 'Anemo',
  geo_dmg_: 'Geo',
  dendro_dmg_: 'Dendro',
  physical_dmg_: 'Physical',
}

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

export const SLOT_NAMES: Readonly<Record<string, string>> = {
  flower: 'Flower of Life',
  plume: 'Plume of Death',
  sands: 'Sands of Eon',
  goblet: 'Goblet of Eonothem',
  circlet: 'Circlet of Logos',
}

/** "Flower", "Plume", … (short, for cards and pills). */
export function formatSlotName(slotKey: string): string {
  return slotKey ? slotKey.charAt(0).toUpperCase() + slotKey.slice(1) : slotKey
}

export function formatSlotFullName(slotKey: string): string {
  return SLOT_NAMES[slotKey] ?? formatSlotName(slotKey)
}

/** Crit value with one decimal: "32.6". */
export function formatCv(cv: number): string {
  return cv.toFixed(1)
}

const STAT_TINY: Readonly<Record<string, string>> = {
  critRate_: 'CR',
  critDMG_: 'CD',
  enerRech_: 'ER',
  eleMas: 'EM',
}

/** Tightest label, for table cells: "CR", "CD", "ER", "EM", "ATK%", "HP". */
export function formatStatTiny(key: string): string {
  return STAT_TINY[key] ?? formatStatShort(key)
}

const STAT_TILE: Readonly<Record<string, string>> = {
  electro_dmg_: 'Elec',
  dendro_dmg_: 'Dend',
  physical_dmg_: 'Phys',
  heal_: 'Heal',
}

/** Shortest label, for bag tiles: "CR", "ATK%", "Pyro", "Elec", "Phys", "Heal". */
export function formatStatTile(key: string): string {
  return STAT_TILE[key] ?? formatStatTiny(key)
}
