/**
 * Where a game image loads from. The image host (static.nanoka.cc) serves
 * nearly every name; the ones it lacked at the last `pnpm --filter
 * @gdt/game-data images` check are `missing`, and of those the `hosted` ones
 * load from gi-cdn.475.dev (built from the game client by the private
 * `gi-cdn` repo, which publishes exactly that list). Anything else has no
 * image: GameIcon shows initials for ''.
 */

export interface ImageCoverage {
  /** Names the image host lacks. */
  missing: ReadonlySet<string>
  /** Missing names gi-cdn serves. */
  hosted: ReadonlySet<string>
}

/**
 * URL of a game image by name: `<host><name>.webp`, or `<giCdn><name>.webp`
 * for a name the host lacks that gi-cdn serves, or '' (no name, or no image
 * anywhere). Before the coverage is known (null) every name goes to the
 * host.
 */
export function imageUrlOf(
  name: string | undefined,
  coverage: ImageCoverage | null,
  host: string,
  giCdn: string,
): string {
  if (!name) return ''
  if (!coverage?.missing.has(name)) return `${host}${name}.webp`
  return coverage.hosted.has(name) ? `${giCdn}${name}.webp` : ''
}
