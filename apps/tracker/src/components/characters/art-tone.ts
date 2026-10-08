/**
 * How dark a character's namecard is behind the share card's text on the
 * art: the header (name, level, friendship, stars; top-left) and the owner
 * lines (bottom-left). A light card writes that text dark with a white glow,
 * which turns muddy on a dark namecard (Skirk, Neuvillette, Mavuika): there
 * it takes the dark card's white text instead (ShareCard).
 *
 * Measured on the namecard itself (840×400; nanoka and gi-cdn send CORS, so a
 * canvas can read it: measure-art.ts), as the mean relative luminance of the
 * region, 0–1. This module is the pure part (tested without a DOM).
 */

export interface ArtTone {
  /** The header's region is dark. */
  top: boolean
  /** The owner lines' region is dark. */
  bottom: boolean
}

/** Below this the region counts as dark (Skirk 0.22, Illuga 0.25; Hu Tao 0.37 reads fine). */
export const DARK_ART = 0.3

/** The regions, as fractions of the namecard: left 40%, the top 30% / the bottom 25%. */
export const TOP_REGION = [0, 0, 0.4, 0.3] as const
export const BOTTOM_REGION = [0, 0.75, 0.4, 1] as const

export const LIGHT_ART: ArtTone = { top: false, bottom: false }

/** Mean luminance (Rec. 709 weights on the sRGB values, 0–1) of a region of RGBA pixels. */
export function regionLuminance(
  data: ArrayLike<number>,
  width: number,
  height: number,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): number {
  const left = Math.floor(width * x0)
  const right = Math.max(left + 1, Math.floor(width * x1))
  const top = Math.floor(height * y0)
  const bottom = Math.max(top + 1, Math.floor(height * y1))
  let sum = 0
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4
      sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
      count++
    }
  }
  return count ? sum / count / 255 : 1
}
