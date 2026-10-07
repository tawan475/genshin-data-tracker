/**
 * A browser's user agent as a person would name the device: "Chrome on
 * Windows", "Safari on iPhone". Only the common browsers and systems are
 * known; the rest read "Browser on Linux" or "Unknown device". A guess for a
 * list of sessions, never for a decision (any client can send any string).
 */

const BROWSERS: [RegExp, string][] = [
  // Before Chrome and Safari: these carry their tokens too.
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bVivaldi\//, 'Vivaldi'],
  [/\bYaBrowser\//, 'Yandex'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:CriOS|Chrome|Chromium|HeadlessChrome)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  // Before Mac OS X and Linux: these name them too.
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

function find(table: [RegExp, string][], userAgent: string): string | null {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

/** "Chrome on Windows"; "Firefox" without a known system; "Unknown device" without either. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  const browser = find(BROWSERS, ua)
  const system = find(SYSTEMS, ua)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? (system ? `Browser on ${system}` : 'Unknown device')
}
