/**
 * Shared look for the artifacts page: slot icons, CV colours and roll-bar
 * fills. Colours are design tokens only, so both themes follow main.css.
 */

import type { Component } from 'vue'
import { Crown, Feather, Flower2, Hourglass, Wine } from 'lucide-vue-next'
import { CV_GOOD, CV_GREAT, cvBand, type SlotKey } from '@/data/artifacts'
import type { RollQuality } from '@/utils/artifact-rolls'

export const SLOT_ICONS: Readonly<Record<SlotKey, Component>> = {
  flower: Flower2,
  plume: Feather,
  sands: Hourglass,
  goblet: Wine,
  circlet: Crown,
}

export function slotIcon(slotKey: string): Component | undefined {
  return SLOT_ICONS[slotKey as SlotKey]
}

const CV_TEXT = ['text-text-muted', 'text-text-primary', 'text-rarity-4', 'text-rarity-5'] as const

/** CV number colour: gold from CV_GREAT, purple from CV_GOOD, muted at 0. */
export function cvClass(cv: number): string {
  return CV_TEXT[cvBand(cv)]
}

export const CV_BANDS_TITLE = `Crit value (CRIT Rate × 2 + CRIT DMG) · ${CV_GOOD}+ good · ${CV_GREAT}+ great`

/** How much of the bar a roll fills; exaggerated past the real 70–100 % so tiers read at a glance. */
export const ROLL_FILL: Readonly<Record<RollQuality, string>> = {
  1: '45%',
  2: '65%',
  3: '82%',
  4: '100%',
}
