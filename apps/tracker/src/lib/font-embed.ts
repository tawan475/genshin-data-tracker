/**
 * Google Fonts' CSS read as font files, for the share cards drawn on a
 * canvas (lib/card-canvas), which register Outfit once more with tabular
 * figures on. Pure, no DOM.
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

/** One font file of the kept subsets, with every weight it serves. */
export interface GoogleFontFile {
  family: string
  style: string
  url: string
  range: string
  /** "300 800" for a variable file, "400" for one weight. */
  weight: string
}

/**
 * The kept subsets' files, one per URL, their weights as a range (Google
 * serves Outfit as one variable file for every weight).
 */
export function fontFiles(faces: readonly GoogleFontFace[]): GoogleFontFile[] {
  const files = new Map<string, GoogleFontFace & { weights: number[] }>()
  for (const face of faces) {
    if (!KEEP_SUBSETS.has(face.subset)) continue
    const file = files.get(face.url)
    if (file) file.weights.push(face.weight)
    else files.set(face.url, { ...face, weights: [face.weight] })
  }
  return [...files.values()].map((f) => {
    const low = Math.min(...f.weights)
    const high = Math.max(...f.weights)
    return {
      family: f.family,
      style: f.style,
      url: f.url,
      range: f.range,
      weight: low === high ? String(low) : `${low} ${high}`,
    }
  })
}
