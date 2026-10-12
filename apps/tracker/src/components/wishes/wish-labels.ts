import { characterImages, weaponImages } from '@gdt/game-data/images'
import { formatWishTime, toGoodKey, type UigfGachaType, type WishItem } from '@gdt/shared'
import type { Outcome, PullRow } from '@/data/wish-history'
import { imageUrl } from '@/lib/assets'

export interface WishBannerInfo {
  banner: UigfGachaType
  /** The detail page's path segment. */
  slug: string
  label: string
  title: string
  /** Whether its 5★ has a 50/50 (75/25 on the weapon banner). */
  rated: boolean
}

/** Banners in the game's Wish screen order. */
export const WISH_BANNERS: readonly WishBannerInfo[] = [
  { banner: 301, slug: 'character', label: 'Character', title: 'Character Event', rated: true },
  { banner: 302, slug: 'weapon', label: 'Weapon', title: 'Weapon Event', rated: true },
  { banner: 200, slug: 'standard', label: 'Standard', title: 'Standard', rated: false },
  { banner: 500, slug: 'chronicled', label: 'Chronicled', title: 'Chronicled Wish', rated: false },
  { banner: 100, slug: 'beginners', label: "Beginners'", title: "Beginners' Wish", rated: false },
]

export function bannerBySlug(slug: unknown): WishBannerInfo | undefined {
  return WISH_BANNERS.find((b) => b.slug === slug)
}

export function bannerInfo(banner: UigfGachaType): WishBannerInfo {
  return WISH_BANNERS.find((b) => b.banner === banner)!
}

/**
 * The game's icon name of a pulled item, from the game data's images by
 * GOOD key: the item's own, or for an item kept as it came (a name the
 * wish table doesn't know yet) its name's toGoodKey, as a character or a
 * weapon. undefined when the game data has no picture for it.
 */
export function wishIconName(item: WishItem): string | undefined {
  const key = item.key ?? toGoodKey(item.name)
  if (!key) return undefined
  const character = () => characterImages(key)?.icon
  const weapon = () => weaponImages(key)?.[0]
  return item.kind === 'weapon'
    ? weapon()
    : item.kind === 'character'
      ? character()
      : (character() ?? weapon())
}

export function wishIcon(item: WishItem): string {
  return imageUrl(wishIconName(item))
}

/** The game's clock, to the minute ("2026-10-12 21:04"). */
export const wishMinute = (time: number) => formatWishTime(time).slice(0, 16)

export const OUTCOME_LABEL: Record<Outcome, string> = {
  won: 'Won',
  lost: 'Lost',
  guaranteed: 'Guaranteed',
}

export const oddsOf = (banner: UigfGachaType) => (banner === 302 ? '75/25' : '50/50')

/** Tooltip of an outcome; the weapon banner's 5★ odds are 75/25. */
export function outcomeTitle(outcome: Outcome, banner: UigfGachaType, rank = 5): string {
  const odds = rank === 5 ? oddsOf(banner) : '50/50'
  if (outcome === 'won') return `Won the ${odds}`
  if (outcome === 'lost') return `Lost the ${odds}: the next one is featured`
  return `Featured, guaranteed after a lost ${odds}`
}

/** The banner a pull was made on, by name ('' outside the banner data). */
export function runName(row: PullRow): string {
  const on = row.on
  if (!on) return ''
  if (row.pull.gachaType === 400 && on.name400) return on.name400
  return on.name
}

export const RARITY_TEXT: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-text-secondary',
}

/**
 * A pity's colour as paimon.moe draws it: green when early, through amber,
 * to red at hard pity (`hard`: 90 / 80 for a 5★, 10 for a 4★). Mixed from
 * the theme's tokens, so it reads in both themes.
 */
export function pityColor(pity: number, hard: number): string {
  const t = Math.min(1, Math.max(0, (pity - 1) / Math.max(1, hard - 1)))
  return t < 0.5
    ? `color-mix(in oklab, var(--warning-text) ${Math.round(t * 200)}%, var(--success-text))`
    : `color-mix(in oklab, var(--danger-text) ${Math.round((t - 0.5) * 200)}%, var(--warning-text))`
}

export const formatPercent = (share: number) =>
  `${(share * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`

export const formatPity = (pity: number) =>
  pity.toLocaleString('en-US', { maximumFractionDigits: 2 })
