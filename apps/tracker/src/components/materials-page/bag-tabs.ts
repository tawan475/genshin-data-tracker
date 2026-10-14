/**
 * How the Materials bag draws the in-game Inventory tabs: the game's title
 * (from the data), a short chip label, an icon and, where the game's
 * placement needs a word, a tooltip line.
 */

import type { Component } from 'vue'
import {
  Armchair,
  BookOpen,
  Flower2,
  Gem,
  Leaf,
  Package,
  ScrollText,
  Sword,
  UtensilsCrossed,
  Wrench,
} from 'lucide-vue-next'
import { t } from '@/i18n'
import { bagTabs, type TabKey } from './material-meta'

export interface TabDisplay {
  key: TabKey
  /** The game's title ("Character Development Items"). */
  name: string
  /** Chip label ("Development"). */
  label: string
  /** Tooltip: the title, and what the tab holds where that needs saying. */
  title: string
  icon: Component
}

/** Chip labels and notes are message keys (materials.tabs.*), read when drawn. */
const DISPLAY: Partial<Record<TabKey, { label?: string; note?: string; icon: Component }>> = {
  weapon: { icon: Sword, note: 'materials.tabs.notes.weapon' },
  artifact: { icon: Flower2, note: 'materials.tabs.notes.artifact' },
  development: { label: 'materials.tabs.development', icon: BookOpen },
  food: { icon: UtensilsCrossed },
  material: { icon: Leaf },
  gadget: { icon: Wrench },
  quest: { icon: ScrollText },
  precious: { label: 'materials.tabs.precious', icon: Gem },
  furnishing: { icon: Armchair },
  other: { icon: Package, note: 'materials.tabs.notes.other' },
}

export function tabDisplay(key: TabKey): TabDisplay {
  const name =
    key === 'other'
      ? t('materials.tabs.other')
      : (bagTabs().find((tab) => tab.key === key)?.name ?? key)
  const display = DISPLAY[key]
  return {
    key,
    name,
    label: display?.label ? t(display.label) : name,
    title: display?.note ? t('materials.tabs.note', { name, note: t(display.note) }) : name,
    icon: display?.icon ?? Package,
  }
}
