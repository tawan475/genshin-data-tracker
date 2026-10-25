/**
 * The roster share card (RosterShareCard): every character as the game's
 * bag cell, on the share card's palette. Its width follows the roster
 * (`rosterColumns`) so a small roster isn't a strip and a big one stays
 * near 16:10; its height is as laid out.
 */

import { ELEMENTS, type CharacterView } from '@/data/characters'
import type { Element } from '@/data/game-meta'

/** One cell in CSS pixels (the game's 80×98 cell). */
export const ROSTER_TILE = 116
export const ROSTER_GAP = 12
export const ROSTER_PAD = 48
export const ROSTER_MIN_COLUMNS = 9
export const ROSTER_MAX_COLUMNS = 14
/** The hidden frame's viewport: wide enough for the most columns, tall enough for ~250 characters. */
export const ROSTER_FRAME_WIDTH = 1920
export const ROSTER_FRAME_HEIGHT = 3200
export const ROSTER_SCALE = 1.5

/**
 * Columns for `count` characters: about √(2n), which keeps the card near
 * 16:10 with the header, between ROSTER_MIN_COLUMNS (the header's width)
 * and ROSTER_MAX_COLUMNS.
 */
export function rosterColumns(count: number): number {
  return Math.min(
    ROSTER_MAX_COLUMNS,
    Math.max(ROSTER_MIN_COLUMNS, Math.round(Math.sqrt(2 * count))),
  )
}

/** The card's width in CSS pixels for that many columns. */
export function rosterWidth(columns: number): number {
  return columns * ROSTER_TILE + (columns - 1) * ROSTER_GAP + 2 * ROSTER_PAD
}

export interface RosterSummary {
  elements: { element: Element; count: number }[]
  /** Counts by rarity, highest first; rarities with none are left out. */
  rarities: { rarity: number; count: number }[]
  c6: number
  level90: number
}

/** What the card's header counts: elements in the game's order, rarities, C6, level 90+. */
export function rosterSummary(characters: readonly CharacterView[]): RosterSummary {
  const elements = new Map<Element, number>()
  const rarities = new Map<number, number>()
  let c6 = 0
  let level90 = 0
  for (const c of characters) {
    if (c.element) elements.set(c.element, (elements.get(c.element) ?? 0) + 1)
    if (c.rarity) rarities.set(c.rarity, (rarities.get(c.rarity) ?? 0) + 1)
    if (c.constellation >= 6) c6++
    if (c.level >= 90) level90++
  }
  return {
    elements: ELEMENTS.filter((e) => elements.has(e)).map((element) => ({
      element,
      count: elements.get(element)!,
    })),
    rarities: [...rarities]
      .sort((a, b) => b[0] - a[0])
      .map(([rarity, count]) => ({ rarity, count })),
    c6,
    level90,
  }
}
