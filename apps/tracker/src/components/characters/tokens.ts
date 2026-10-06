import type { Element } from '@/data/characters'

/** Literal class names so Tailwind sees them; element colours are data colours. */
export const ELEMENT_TEXT: Record<Element, string> = {
  pyro: 'text-pyro',
  hydro: 'text-hydro',
  anemo: 'text-anemo',
  electro: 'text-electro',
  dendro: 'text-dendro',
  cryo: 'text-cryo',
  geo: 'text-geo',
}

export const ELEMENT_FILL: Record<Element, string> = {
  pyro: 'bg-pyro',
  hydro: 'bg-hydro',
  anemo: 'bg-anemo',
  electro: 'bg-electro',
  dendro: 'bg-dendro',
  cryo: 'bg-cryo',
  geo: 'bg-geo',
}

/** A faint wash of the element colour, for backdrops behind glyphs. */
export const ELEMENT_SOFT: Record<Element, string> = {
  pyro: 'bg-pyro/15',
  hydro: 'bg-hydro/15',
  anemo: 'bg-anemo/15',
  electro: 'bg-electro/15',
  dendro: 'bg-dendro/15',
  cryo: 'bg-cryo/15',
  geo: 'bg-geo/15',
}

export const RARITY_TEXT: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-rarity-3',
  2: 'text-rarity-2',
  1: 'text-rarity-1',
}

export const RARITY_SOFT: Record<number, string> = {
  5: 'bg-rarity-5/20',
  4: 'bg-rarity-4/20',
  3: 'bg-rarity-3/20',
  2: 'bg-rarity-2/20',
  1: 'bg-rarity-1/20',
}

/** A gradient's start in the element colour, behind a build (use with bg-linear-to-*). */
export const ELEMENT_GLOW: Record<Element, string> = {
  pyro: 'from-pyro/30',
  hydro: 'from-hydro/30',
  anemo: 'from-anemo/30',
  electro: 'from-electro/30',
  dendro: 'from-dendro/30',
  cryo: 'from-cryo/30',
  geo: 'from-geo/30',
}
