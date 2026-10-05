/**
 * Where a game image loads from. The image host (static.nanoka.cc) serves
 * nearly every name; the ones it lacked at the last `pnpm --filter
 * @gdt/game-data images` check are `missing`, and of those the tracker
 * serves its own copy of the `hosted` ones (apps/tracker/public/gi/, copied
 * by that check from the local gi-cdn build; gitignored, so a deploy without
 * them 404s and the components fall back to initials). Anything else has no
 * image: GameIcon shows initials for ''.
 */

export interface ImageCoverage {
  /** Names the image host lacks. */
  missing: ReadonlySet<string>
  /** Missing names the tracker serves itself. */
  hosted: ReadonlySet<string>
}

/**
 * URL of a game image by name: `<host><name>.webp`, or `<own><name>.webp`
 * for a name the host lacks that the tracker serves, or '' (no name, or no
 * image anywhere). Before the coverage is known (null) every name goes to
 * the host.
 */
export function imageUrlOf(
  name: string | undefined,
  coverage: ImageCoverage | null,
  host: string,
  own: string,
): string {
  if (!name) return ''
  if (!coverage?.missing.has(name)) return `${host}${name}.webp`
  return coverage.hosted.has(name) ? `${own}${name}.webp` : ''
}
