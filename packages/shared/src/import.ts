/**
 * Import limits. The browser validates against these before uploading and the
 * worker enforces them, so they live here once.
 *
 * Bulk imports are orchestrated by the browser one file per request, so the
 * file count only bounds a single batch in the UI. The size cap is per file; a
 * real GOOD export is ~600 KB.
 */
export const MAX_IMPORT_FILES = 250
export const MAX_IMPORT_FILE_SIZE_MB = 10
export const MAX_IMPORT_FILE_SIZE_BYTES = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024

/**
 * The most of each kind of item one GOOD file may carry: about 1.5× what the
 * game itself holds, so no real export comes near them, while a file of
 * made-up items is refused before anything is stored (normalizeGood throws a
 * GoodLimitError; the Worker answers 422). One real account at 7.1 exported
 * 103 characters, 1,121 weapons, 1,743 artifacts, 1,547 material keys and
 * 1,840 achievements. When a game data bump brings the game's own count
 * within 1.2× of a cap, the tracker's `good-limits.test.ts` fails: raise the
 * cap then.
 */
export const GOOD_LIMITS = {
  /** 130 playable characters in the 7.1 game data (`@gdt/game-data` catalog.json) × 1.5. */
  characters: 200,
  /** The game's weapon inventory holds 2,000. */
  weapons: 3_000,
  /** The game's artifact inventory holds 2,700 (raised from 2,400 in 7.0). */
  artifacts: 4_050,
  /** 7,394 material ids in the 7.1 game data (`@gdt/game-data` materials.json) × 1.5. */
  materialKeys: 11_100,
  /**
   * 2,012 achievement ids in the 7.1 game data (`@gdt/game-data`
   * achievements.json) × 1.5. Also for `gi_achievement_times`.
   */
  achievements: 3_020,
  /** An artifact has at most 4 substats (and unactivated ones). */
  substats: 6,
  /**
   * Characters in a key no dictionary knows (stored spelled out), and in
   * `source`. The longest key in a real export so far is 63 characters (a
   * material); the dictionaries' longest character, weapon and set keys are
   * 17, 31 and 34. Four material keys the game has are longer (up to 90): a
   * key the material dictionary knows passes at any length.
   */
  keyLength: 64,
} as const

/**
 * Coerces one untrusted timestamp candidate into epoch milliseconds.
 *
 * Accepts what the uploaders actually produce: an epoch-milliseconds number
 * (the GOOD payload's own `timestamp`) or a string holding either epoch
 * milliseconds or a parseable date (the multipart `timestamp` field). Anything
 * else is `null` so the caller can fall through.
 */
function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return validMs(value.getTime())
  if (typeof value === 'number') return Number.isFinite(value) ? validMs(value) : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numeric = Number(trimmed)
    return validMs(Number.isNaN(numeric) ? Date.parse(trimmed) : numeric)
  }
  return null
}

function validMs(ms: number): number | null {
  return Number.isNaN(new Date(ms).getTime()) ? null : ms
}

/**
 * When an imported snapshot was taken, in epoch milliseconds.
 *
 * Precedence: the uploader's explicit `timestamp` field, then the GOOD
 * payload's own `timestamp` (irminsul writes the capture time into every
 * file), then `now`.
 */
export function resolveImportTimestamp(
  explicit: unknown,
  payload: unknown,
  now: number = Date.now(),
): number {
  return toEpochMs(explicit) ?? toEpochMs(payload) ?? now
}
