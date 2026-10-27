/**
 * CSS shadow lists read as numbers, for the share cards drawn on a canvas
 * (lib/card-canvas), whose palettes keep them as CSS. Pure, no DOM.
 */

/** One CSS shadow: offset, blur radius and colour (px). */
export interface Shadow {
  x: number
  y: number
  blur: number
  color: string
}

/** Parses a CSS shadow list ("0 1px 2px rgba(…), inset …"); inset ones are skipped. */
export function parseShadows(css: string): Shadow[] {
  return css
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('inset'))
    .map((part) => {
      const color = /(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(part)?.[1] ?? 'transparent'
      const [x = 0, y = 0, blur = 0] = part
        .replace(color, '')
        .trim()
        .split(/\s+/)
        .map((n) => parseFloat(n))
      return { x, y, blur, color }
    })
}

/** The inset ring of a CSS shadow list (`inset 0 0 0 <w> <color>`), if any. */
export function parseInsetRing(css: string): { width: number; color: string } | null {
  const ring = css
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim())
    .find((part) => part.startsWith('inset'))
  if (!ring) return null
  const color = /(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(ring)?.[1] ?? 'transparent'
  const numbers = ring.replace('inset', '').replace(color, '').trim().split(/\s+/).map(parseFloat)
  return { width: numbers[3] ?? 0, color }
}
