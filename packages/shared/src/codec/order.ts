import type { KeyRef } from '../dictionary'

/**
 * Total order over stored values: numbers ascending, then strings. Sections
 * are sorted with it so the same inventory always encodes to the same bytes —
 * irminsul builds its arrays from hash maps, so upload order is not stable,
 * and a stable encoding is what lets identical sections deduplicate.
 */
export function compareValues(a: KeyRef, b: KeyRef): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareTuples(a: readonly KeyRef[], b: readonly KeyRef[]): number {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const order = compareValues(a[i]!, b[i]!)
    if (order !== 0) return order
  }
  return a.length - b.length
}

/** Drops trailing entries equal to their default, so typical rows stay short. */
export function trimDefaults(values: KeyRef[], defaults: readonly KeyRef[]): KeyRef[] {
  let end = values.length
  while (end > 1 && values[end - 1] === defaults[end - 1]) end--
  return values.slice(0, end)
}

/** Sorted ascending integers -> first value then successive differences. */
export function deltaEncode(sorted: readonly number[]): number[] {
  return sorted.map((value, i) => (i === 0 ? value : value - sorted[i - 1]!))
}

export function deltaDecode(deltas: readonly number[]): number[] {
  const out: number[] = []
  let value = 0
  for (const delta of deltas) {
    value += delta
    out.push(value)
  }
  return out
}
