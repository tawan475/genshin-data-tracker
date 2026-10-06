/**
 * The seven element symbols as inline SVG (24×24, drawn in currentColor),
 * after the game's own: a flame, a drop, a swirl, a bolt, a leaf, a
 * snowflake and a gem. The game data has no element icon names yet, so
 * they are drawn here; ElementIcon colours them with the element token.
 */

import type { Element } from '@/data/game-meta'

export interface ElementGlyph {
  /** Filled shapes (even-odd, so inner shapes cut holes). */
  fill?: string
  /** Stroked lines, 2 units wide, round ends. */
  stroke?: string
  /** Stroke paths repeated at these rotations about the centre (the snowflake's arms). */
  rotate?: readonly number[]
}

export const ELEMENT_GLYPHS: Readonly<Record<Element, ElementGlyph>> = {
  pyro: {
    fill:
      'M12 2.2c.5 3 2.3 4.6 3.9 6.3 1.7 1.8 3.1 3.7 3.1 6.4C19 18.8 15.9 22 12 22s-7-3.2-7-7.1c0-2.3 1-4.1 2.4-5.5.2 1.6.9 2.8 2 3.5-.4-3.6.6-7.6 2.6-10.7Z' +
      'M12 12.6c-1 1.4-2.4 2.5-2.4 4.4 0 1.4 1.1 2.5 2.4 2.5s2.4-1.1 2.4-2.5c0-1.8-1.3-2.9-2.4-4.4Z',
  },
  hydro: {
    fill:
      'M12 2.5c-3.1 4.1-6.5 8-6.5 12a6.5 6.5 0 0 0 13 0c0-4-3.4-7.9-6.5-12Z' +
      'M8.7 14.2c-.2 2.4 1.3 4.4 3.6 4.9-1.3-1.1-2-2.6-1.9-4.3.1-1.4.7-2.6 1.6-3.7-1.9.6-3.2 1.7-3.3 3.1Z',
  },
  anemo: {
    stroke: 'M20 12a8 8 0 0 1-16 0a6 6 0 0 1 12 0a4 4 0 0 1-8 0',
  },
  electro: {
    fill: 'M13.6 2 5 13.4h5.6L9.4 22 19 9.8h-5.8L13.6 2Z',
  },
  dendro: {
    fill: 'M19.5 3.5C10.5 3.8 4.5 8.6 4.5 15c0 1.7.4 3.1 1.1 4.3 1.5-3.3 4.1-6 8-8.2-3.2 2.6-5.4 5.4-6.5 8.6 1.1.6 2.5.9 4 .9 6.3 0 8.9-7 8.4-17.1Z',
  },
  cryo: {
    stroke: 'M12 3v18M9.3 4.8 12 7.4l2.7-2.6M9.3 19.2 12 16.6l2.7 2.6',
    rotate: [0, 60, 120],
  },
  geo: {
    fill:
      'M12 2 21 12 12 22 3 12Z' + 'M12 6 17.4 12 12 18 6.6 12Z' + 'M12 9.2 14.6 12 12 14.8 9.4 12Z',
  },
}
