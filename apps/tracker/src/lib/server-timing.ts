/** A Server-Timing entry's duration (`name;dur=12`), or null. */
export function serverTiming(header: string | null, name: string): number | null {
  for (const entry of (header ?? '').split(',')) {
    const [metric, ...params] = entry.trim().split(';')
    if (metric !== name) continue
    for (const param of params) {
      const [key, value] = param.trim().split('=')
      if (key === 'dur' && value !== undefined && Number.isFinite(Number(value))) {
        return Number(value)
      }
    }
  }
  return null
}
