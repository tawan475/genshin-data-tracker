/**
 * Corner pieces on an item tile (ItemTile), as the game's bag draws them,
 * sized in `cqw` so they scale with the tile like the game's cell (the tile
 * is its own container).
 */

/** A dark rounded chip: the refinement number, the lock. */
export const TILE_CHIP =
  'grid h-[17cqw] min-w-[17cqw] place-items-center rounded-[3.5cqw] bg-[#3b4255]/90 px-[2.5cqw] text-[11.5cqw] leading-none font-semibold text-white'

/** An icon inside a chip. */
export const TILE_CHIP_ICON = 'size-[11cqw]'

/** The lock's colour in the game's bag. */
export const TILE_LOCK = 'text-[#ff8f6b]'

/** The wearer's portrait, a circle over the tile's top-right corner. */
export const TILE_AVATAR =
  '-mt-[7cqw] -mr-[7cqw] size-[30cqw] rounded-full bg-[#d9d3c7] object-cover ring-[0.8cqw] ring-white/85'
