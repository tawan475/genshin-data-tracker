/**
 * Shared look for the artifacts page: slot icons (CV and RV colours live in
 * CritValue / RollValue, roll bars in ui/RollBars).
 */

import type { Component } from 'vue'
import { Crown, Feather, Flower2, Hourglass, Wine } from 'lucide-vue-next'
import type { SlotKey } from '@/data/artifacts'

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
