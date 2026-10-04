/**
 * Formatting. "Say the real number": counts and sizes are exact or carry a
 * unit, never vague.
 */

const integer = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export function formatNumber(value: number): string {
  return integer.format(value)
}

/** 72,164,464 -> "72.2M"; small numbers stay exact. */
export function formatCompact(value: number): string {
  return Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value)
}

export function formatSigned(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatCompact(Math.abs(value))}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

let use24Hour = false

/** Set from the user's settings. */
export function setClockPreference(twentyFourHour: boolean): void {
  use24Hour = twentyFourHour
}

export function clock24(): boolean {
  return use24Hour
}

/** The original tracker's date-time: the browser's full locale format, with seconds. */
export function formatFullDateTime(ms: number | string | Date): string {
  return new Date(ms).toLocaleString(undefined, { hour12: !use24Hour })
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24Hour,
  })
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24Hour,
  })
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "3 hours ago", "yesterday", "in 2 days". */
export function formatRelative(ms: number, now = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  if (abs < 45 * 60) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 22 * 3600) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 26 * 86400) return relative.format(Math.round(seconds / 86400), 'day')
  if (abs < 320 * 86400) return relative.format(Math.round(seconds / (30 * 86400)), 'month')
  return relative.format(Math.round(seconds / (365 * 86400)), 'year')
}

/** "KamisatoAyaka" -> "Kamisato Ayaka" (GOOD keys are PascalCase). */
export function keyToName(key: string): string {
  return key
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
}
