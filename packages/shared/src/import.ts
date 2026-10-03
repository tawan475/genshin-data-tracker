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
