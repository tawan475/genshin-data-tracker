/**
 * Google Fonts' CSS turned into self-contained @font-face rules, for the
 * share card's PNG export (lib/share-image): an SVG drawn as an image can't
 * load the page's fonts, so they go in as data URLs. Pure, no DOM.
 */

/** One @font-face of Google's answer, with the subset its comment names ("latin", "latin-ext"). */
export interface GoogleFontFace {
  subset: string
  family: string
  style: string
  weight: number
  url: string
  range: string
}

export const KEEP_SUBSETS = new Set(['latin', 'latin-ext'])

/** Parses Google Fonts' CSS (`/* latin *\/ @font-face { … }` blocks). */
export function parseGoogleFontCss(css: string): GoogleFontFace[] {
  const faces: GoogleFontFace[] = []
  const block = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g
  for (const [, subset, body] of css.matchAll(block)) {
    const get = (prop: string) =>
      new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(body!)?.[1]?.trim() ?? ''
    const url = /url\(([^)]+)\)/.exec(get('src'))?.[1]?.replace(/['"]/g, '')
    if (!url) continue
    faces.push({
      subset: subset!,
      family: get('font-family'),
      style: get('font-style') || 'normal',
      weight: Number(get('font-weight')) || 400,
      url,
      range: get('unicode-range'),
    })
  }
  return faces
}

/**
 * One @font-face per font file of the kept subsets, its weights as a range
 * (Google serves Outfit as one variable file for every weight).
 */
export function fontFaceRules(
  faces: readonly GoogleFontFace[],
  dataUrls: ReadonlyMap<string, string>,
) {
  const files = new Map<string, GoogleFontFace & { weights: number[] }>()
  for (const face of faces) {
    if (!KEEP_SUBSETS.has(face.subset)) continue
    const file = files.get(face.url)
    if (file) file.weights.push(face.weight)
    else files.set(face.url, { ...face, weights: [face.weight] })
  }
  return [...files.values()]
    .filter((f) => dataUrls.has(f.url))
    .map((f) => {
      const low = Math.min(...f.weights)
      const high = Math.max(...f.weights)
      return (
        `@font-face{font-family:${f.family};font-style:${f.style};` +
        `font-weight:${low === high ? low : `${low} ${high}`};` +
        `src:url(${dataUrls.get(f.url)}) format('woff2');` +
        (f.range ? `unicode-range:${f.range};` : '') +
        '}'
      )
    })
    .join('\n')
}
