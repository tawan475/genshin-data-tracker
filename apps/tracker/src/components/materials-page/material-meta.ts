/**
 * What kind of material a key is, and where it sits in the game's order.
 *
 * Both come from the item id inside the material's icon name
 * (`UI_ItemIcon_104303` → 104303) in the Genshin Optimizer icon table. The
 * game numbers items in blocks, and only blocks that hold a single kind are
 * named here (checked against a real 1,469-material inventory); anything
 * else, or a key without an icon, is "other". Sorting by the id keeps tiers
 * together (Sliver, Fragment, Chunk, Gemstone), as the in-game bag does.
 */

import type { Component } from 'vue'
import {
  BookOpen,
  Coins,
  Crown,
  Fish,
  Gem,
  Leaf,
  Package,
  Skull,
  Sparkles,
  Sword,
  UtensilsCrossed,
  Wrench,
} from 'lucide-vue-next'

export type MaterialKind =
  | 'talent'
  | 'gem'
  | 'boss'
  | 'weapon'
  | 'drop'
  | 'exp'
  | 'gathered'
  | 'food'
  | 'fish'
  | 'gadget'
  | 'other'

export interface KindInfo {
  id: MaterialKind
  label: string
  /** Tooltip: what the label covers. */
  detail: string
  icon: Component
}

/** Filter order: character and weapon build materials first, as in game. */
export const KINDS: KindInfo[] = [
  { id: 'talent', label: 'Talent', detail: 'Talent books, Crown of Insight', icon: BookOpen },
  { id: 'gem', label: 'Gems', detail: 'Ascension gems, Dust of Azoth', icon: Gem },
  { id: 'boss', label: 'Boss', detail: 'Normal and weekly boss drops', icon: Crown },
  { id: 'weapon', label: 'Weapon', detail: 'Weapon ascension materials', icon: Sword },
  { id: 'drop', label: 'Drops', detail: 'Common enemy drops', icon: Skull },
  { id: 'exp', label: 'EXP', detail: 'EXP books, ores, artifact EXP', icon: Sparkles },
  {
    id: 'gathered',
    label: 'Gathered',
    detail: 'Ingredients, local specialties, ores, wood',
    icon: Leaf,
  },
  { id: 'food', label: 'Food', detail: 'Dishes', icon: UtensilsCrossed },
  { id: 'fish', label: 'Fish', detail: 'Fish', icon: Fish },
  { id: 'gadget', label: 'Gadgets', detail: 'Gadgets', icon: Wrench },
  { id: 'other', label: 'Other', detail: 'Everything else', icon: Package },
]

export const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k]))

/** Rank of each kind in KINDS: "game order" lists build materials first. */
export const KIND_RANK = new Map(KINDS.map((k, i) => [k.id, i]))

/** How the detail view labels a wallet item (not a filter: the strip shows them). */
export const WALLET_KIND = {
  label: 'Wallet',
  detail: 'Currencies and wish items',
  icon: Coins as Component,
}

/**
 * Currency and wish items: the wallet strip above the bag, in this order.
 * Only the ones an account's snapshots hold are shown.
 */
export const WALLET_KEYS = [
  'Mora',
  'Primogem',
  'GenesisCrystal',
  'IntertwinedFate',
  'AcquaintFate',
  'MasterlessStarglitter',
  'MasterlessStardust',
  'OriginalResin',
  'FragileResin',
  'CondensedResin',
  'RealmCurrency',
]
export const WALLET = new Set(WALLET_KEYS)

/** Shorter labels for the strip; others use the material name. */
export const WALLET_LABELS: Record<string, string> = {
  GenesisCrystal: 'Genesis',
  IntertwinedFate: 'Intertwined',
  AcquaintFate: 'Acquaint',
  MasterlessStarglitter: 'Starglitter',
  MasterlessStardust: 'Stardust',
  OriginalResin: 'Resin',
  FragileResin: 'Fragile',
  CondensedResin: 'Condensed',
  RealmCurrency: 'Realm',
}

function kindOfId(id: number): MaterialKind {
  if (id >= 104001 && id <= 104099) return 'exp' // EXP books, enhancement ores
  if (id >= 104101 && id <= 104299) return 'gem'
  if (id >= 104301 && id <= 104399) return 'talent' // 104300 is Masterless Stella Fortuna
  if (id >= 105000 && id <= 105999) return 'exp' // Sanctifying Unction, Essence, Elixir
  if (id >= 112000 && id <= 112999) return 'drop'
  if (id >= 113000 && id <= 113999) return 'boss'
  if (id >= 114000 && id <= 114999) return 'weapon'
  if (id >= 100001 && id <= 100099) return 'gathered' // ingredients, Mondstadt/Liyue specialties
  if (id >= 101001 && id <= 101499) return 'gathered' // ores, billets, specialties, wood, dyes
  if (id >= 110000 && id <= 110999) return 'gathered' // processed ingredients
  if (id >= 108000 && id <= 108999) return 'food'
  if (id >= 131000 && id <= 131999) return 'fish'
  if (id >= 220000 && id <= 220999) return 'gadget'
  return 'other'
}

export interface MaterialMeta {
  kind: MaterialKind
  /** Sort key in game order; keys without an item id go last. */
  order: number
}

const LAST = Number.MAX_SAFE_INTEGER
const OTHER: MaterialMeta = { kind: 'other', order: LAST }

let table: Map<string, MaterialMeta> | null = null
let loading: Promise<void> | null = null

/** Loads the icon table (the same lazy chunk lib/assets uses). */
export function loadMaterialMeta(): Promise<void> {
  loading ??= import('@/utils/data/MaterialIcons_gen.json').then(
    (module) => {
      const icons = module.default as Record<string, string>
      const map = new Map<string, MaterialMeta>()
      for (const [key, icon] of Object.entries(icons)) {
        const id = /^UI_ItemIcon_(\d+)$/.exec(icon)
        if (id) {
          const n = Number(id[1])
          map.set(key, { kind: kindOfId(n), order: n < 100_000 ? n + 1_000_000 : n })
          continue
        }
        // Dishes from recipes use a recipe icon; keep them after the other dishes.
        if (icon.startsWith('UI_ItemIcon_Recipe_')) map.set(key, { kind: 'food', order: 108_999.5 })
      }
      table = map
    },
    (error) => {
      loading = null
      throw error
    },
  )
  return loading
}

export function materialMeta(key: string): MaterialMeta {
  return table?.get(key) ?? OTHER
}
