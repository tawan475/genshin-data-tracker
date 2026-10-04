import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const path = (relative: string) => fileURLToPath(new URL(relative, root))

/** packages/game-data/ */
export const PACKAGE_DIR = path('./')
/** Compiled, committed data the app loads. */
export const DATA_DIR = path('data/')
/** Hand-kept inputs (see overrides/README.md). */
export const OVERRIDES_DIR = path('overrides/')
/** Downloads (gitignored): the dump files per commit, source images. */
export const CACHE_DIR = path('.cache/')
/** Where the tracker serves self-hosted icons from (`/gi/<name>.webp`). */
export const TRACKER_ICON_DIR = path('../../apps/tracker/public/gi/')
/** The shared static dictionary's material keys (keys the tracker has stored). */
export const SHARED_MATERIAL_KEYS = path('../shared/src/dictionary/data/materials.json')
