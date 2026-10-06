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

const DISPLAY: Partial<Record<TabKey, { label?: string; note?: string; icon: Component }>> = {
  weapon: { icon: Sword, note: 'Enhancement ores (the game keeps them with the weapons)' },
  artifact: {
    icon: Flower2,
    note: 'Sanctifying Unction and Essence (the game keeps them with the artifacts)',
  },
  development: { label: 'Development', icon: BookOpen },
  food: { icon: UtensilsCrossed },
  material: { icon: Leaf },
  gadget: { icon: Wrench },
  quest: { icon: ScrollText },
  precious: { label: 'Precious', icon: Gem },
  furnishing: { icon: Armchair },
  other: {
    icon: Package,
    note: 'Not in the in-game Inventory: currencies, seeds, card game items, items newer than the game data',
  },
}

export function tabDisplay(key: TabKey): TabDisplay {
  const name = key === 'other' ? 'Other' : (bagTabs().find((t) => t.key === key)?.name ?? key)
  const display = DISPLAY[key]
  return {
    key,
    name,
    label: display?.label ?? name,
    title: display?.note ? `${name}: ${display.note}` : name,
    icon: display?.icon ?? Package,
  }
}
