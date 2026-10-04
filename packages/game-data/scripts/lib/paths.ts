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
