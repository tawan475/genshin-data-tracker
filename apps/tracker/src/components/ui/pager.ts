/** 1 … 4 5 6 … 15, as numbers with null for a gap. */
export function pagerItems(count: number, current: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let n = 1; n <= count; n++) {
    if (n === 1 || n === count || Math.abs(n - current) <= 1) out.push(n)
    else if (out[out.length - 1] !== null) out.push(null)
  }
  return out
}

/** The page typed in "Go to page": a whole number from 1 to `count`, else null. */
export function pageFromInput(text: string, count: number): number | null {
  const trimmed = text.trim().replace(/[,\s]/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const page = Number(trimmed)
  return page >= 1 && page <= count ? page : null
}
