import { formatWishTime, type UigfGachaType, type WishItem } from '@gdt/shared'
import type { Outcome } from '@/data/wish-history'
import { characterIcon, weaponIcon } from '@/lib/assets'

/** Banner tabs, in the order the game's Wish screen lists them. */
export const WISH_BANNERS: readonly { banner: UigfGachaType; label: string; title: string }[] = [
  { banner: 301, label: 'Character', title: 'Character Event Wish (both banners)' },
  { banner: 302, label: 'Weapon', title: 'Weapon Event Wish' },
  { banner: 500, label: 'Chronicled', title: 'Chronicled Wish' },
  { banner: 200, label: 'Standard', title: 'Wanderlust Invocation' },
  { banner: 100, label: "Beginners'", title: "Beginners' Wish" },
]

export function wishIcon(item: WishItem): string {
  if (!item.key) return ''
  return item.kind === 'weapon' ? weaponIcon(item.key) : characterIcon(item.key)
}

/** The game's clock, to the minute ("2026-10-12 21:04"). */
export const wishMinute = (time: number) => formatWishTime(time).slice(0, 16)

export const OUTCOME_LABEL: Record<Outcome, string> = {
  won: 'Won',
  lost: 'Lost',
  guaranteed: 'Guaranteed',
}

export const OUTCOME_TONE: Record<Outcome, 'success' | 'danger' | 'accent'> = {
  won: 'success',
  lost: 'danger',
  guaranteed: 'accent',
}

/** Tooltip of an outcome; the weapon banner's odds are 75/25. */
export function outcomeTitle(outcome: Outcome, banner: UigfGachaType): string {
  const odds = banner === 302 ? '75/25' : '50/50'
  if (outcome === 'won') return `Won the ${odds}`
  if (outcome === 'lost') return `Lost the ${odds}: the next one is featured`
  return `Featured, guaranteed after a lost ${odds}`
}

export const RARITY_TEXT: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-text-secondary',
}
