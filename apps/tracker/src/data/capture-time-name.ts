/**
 * The capture time an export's name carries, in this browser's local time:
 * `genshin_export_2026-06-20_13-19-18.json`, `genshin_export_2026-08-15_10-25.json`
 * (forks name it with or without seconds), also `T` or a space between date
 * and time. Null when the name holds no plausible date and time.
 */
export function captureTimeFromName(name: string): number | null {
  const match = /(\d{4})-(\d{2})-(\d{2})[_T ](\d{2})[-:.](\d{2})(?:[-:.](\d{2}))?(?!\d)/.exec(name)
  if (!match) return null
  const [y, mo, d, h, mi, s] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)))
  if (y! < 2020 || mo! < 1 || mo! > 12 || d! < 1 || d! > 31 || h! > 23 || mi! > 59 || s! > 59) {
    return null
  }
  const date = new Date(y!, mo! - 1, d!, h!, mi!, s!)
  // Rejects dates that rolled over (31 June → 1 July).
  if (date.getMonth() !== mo! - 1 || date.getDate() !== d!) return null
  return date.getTime()
}
