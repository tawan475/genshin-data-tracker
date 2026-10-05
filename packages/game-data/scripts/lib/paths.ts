import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const path = (relative: string) => fileURLToPath(new URL(relative, root))

/** packages/game-data/ */
export const PACKAGE_DIR = path('./')
/** Compiled, committed data the app loads. */
export const DATA_DIR = path('data/')
/** Hand-kept inputs (see overrides/README.md). */
export const OVERRIDES_DIR = path('overrides/')
/** Downloads (gitignored): the dump files per commit, the image check's results. */
export const CACHE_DIR = path('.cache/')
/**
 * The tracker's own copies of images the image host lacks, served at
 * `/gi/<name>.webp`: copied from a local gi-cdn build by `pnpm --filter
 * @gdt/game-data images --gi-cdn-dir <dir>`. Gitignored (game art, public
 * repo), so it exists only in a checkout that ran that.
 */
export const HOSTED_DIR = path('../../apps/tracker/public/gi/')
