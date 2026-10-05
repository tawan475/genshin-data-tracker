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

const compactTicks = new Map<number, Intl.NumberFormat>()

/**
 * An axis tick, compact with as many decimals (up to three) as the `step`
 * between ticks needs: over an hour Mora moves in 50K steps, which one
 * decimal would print as "9.1M, 9.1M, 9.2M".
 */
export function formatCompactTick(value: number, step: number): string {
  const abs = Math.abs(value)
  if (abs < 10_000 || !(step > 0)) return formatCompact(value)
  const unit = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : 1e3
  const scaled = step / unit
  let digits = 1
  while (digits < 3 && Math.abs(Math.round(scaled * 10 ** digits) - scaled * 10 ** digits) > 1e-6) {
    digits++
  }
  let format = compactTicks.get(digits)
  if (!format) {
    format = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: digits })
    compactTicks.set(digits, format)
  }
  return format.format(value)
}

/** As formatCompactTick, signed ("+150K", "−1.25M"). */
export function formatSignedTick(value: number, step: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatCompactTick(Math.abs(value), step)}`
}

/** The step between a Chart.js axis's ticks (0 with fewer than two). */
export function tickStep(ticks: readonly { value: number }[]): number {
  return ticks.length > 1 ? Math.abs(ticks[1]!.value - ticks[0]!.value) : 0
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

/** "Oct 4": a date without its year. */
export function formatMonthDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Whether two times fall on the same local day. */
export function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** Keeps a date or time on one line when the text around it wraps ("4:41 PM", not "4:41" / "PM"). */
export function nowrap(text: string): string {
  return text.replaceAll(' ', '\u00a0')
}

/**
 * Some time between two moments, as short as stays clear: "between Oct 1
 * and Oct 4, 2026" (the year once when both share it), "between Dec 28,
 * 2025 and Jan 4, 2026", or within one day "Oct 4, 2026, between 9:10 AM
 * and 4:05 PM". Each date and time stays on one line.
 */
export function formatBetween(from: number, to: number): string {
  if (sameDay(from, to)) {
    return `${nowrap(formatDate(to))}, between ${nowrap(formatTime(from))} and ${nowrap(formatTime(to))}`
  }
  const sameYear = new Date(from).getFullYear() === new Date(to).getFullYear()
  const start = sameYear ? formatMonthDay(from) : formatDate(from)
  return `between ${nowrap(start)} and ${nowrap(formatDate(to))}`
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
