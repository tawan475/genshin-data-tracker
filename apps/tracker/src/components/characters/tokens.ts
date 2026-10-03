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
