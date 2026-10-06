/**
 * Shared look for the artifacts page: slot icons and roll-bar fills (CV and
 * RV colours live in CritValue / RollValue). Colours are design tokens only,
 * so both themes follow main.css.
 */

import type { Component } from 'vue'
import { Crown, Feather, Flower2, Hourglass, Wine } from 'lucide-vue-next'
import type { SlotKey } from '@/data/artifacts'
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

/** How much of the bar a roll fills; exaggerated past the real 70–100 % so tiers read at a glance. */
export const ROLL_FILL: Readonly<Record<RollQuality, string>> = {
  1: '45%',
  2: '65%',
  3: '82%',
  4: '100%',
}
