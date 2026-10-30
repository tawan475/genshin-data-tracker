/**
 * Leyline: the Teyvat record format. A GOOD file (`"format": "GOOD"` stays,
 * so Genshin Optimizer and any GOOD reader load it) with Teyvat.me Capture's
 * optional `gi_*` keys, marked by a top-level `"leyline": <version>`. Readers
 * ignore what they don't know, so the key changes nothing for them, and
 * normalizeGood neither needs nor stores it: a file reads the same with it or
 * without. The tracker's exports carry it (they write the `gi_*` keys back).
 * The developer page (/developers) documents the format.
 */

/** The Leyline version written in a file's top-level `leyline` key. */
export const LEYLINE_VERSION = 1

/** A GOOD file as Leyline: the same fields, with `leyline` right after `source`. */
export function asLeyline<T extends object>(good: T): T & { leyline: number } {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(good)) {
    if (key === 'leyline') continue
    out[key] = value
    if (key === 'source') out.leyline = LEYLINE_VERSION
  }
  if (!('leyline' in out)) out.leyline = LEYLINE_VERSION
  return out as T & { leyline: number }
}

/** "leyline-2026-06-20T14-05-43": an exported file's name for a capture time, minus `.json`. */
export function leylineFileStem(takenAt: number): string {
  return `leyline-${new Date(takenAt)
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '')}`
}
