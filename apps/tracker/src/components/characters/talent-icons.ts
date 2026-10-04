/**
 * Talent and constellation glyphs (same host and game data as `@/lib/assets`).
 * They are white shapes on transparency, so callers draw them as a CSS mask
 * in the current text colour (see TalentGlyph).
 */

import { characterImages } from '@gdt/game-data/images'
import { imageUrl } from '@/lib/assets'

/** Normal attack, skill and burst icons ('' for all without skill art, e.g. the element-less Traveler). */
export function talentIcons(key: string): { auto: string; skill: string; burst: string } {
  const info = characterImages(key)
  return {
    auto: imageUrl(info?.attack),
    skill: imageUrl(info?.skill),
    burst: imageUrl(info?.burst),
  }
}

/** C1–C6 icons ('' where unknown, e.g. the element-less Traveler; Manekin has none). */
export function constellationIcons(key: string): string[] {
  const names = characterImages(key)?.constellations ?? []
  return ([0, 1, 2, 3, 4, 5] as const).map((i) => imageUrl(names[i]))
}
