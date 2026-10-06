/**
 * Keeping objects that didn't change, so Vue doesn't re-render what shows
 * them: the Planner rebuilds every goal card's view on any change (a toggle,
 * a priority, a write coming back), and a card whose props are the same
 * objects as before is skipped. With 100 cards that is most of the work.
 */

/** Same value: identity first, then arrays, Maps, Sets and plain objects by content. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return Number.isNaN(a) && Number.isNaN(b)
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false
    return true
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || !sameValue(v, b.get(k))) return false
    return true
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  if (Array.isArray(b) || b instanceof Map || b instanceof Set) return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false
    }
  }
  return true
}

/** `next` with each item equal to the one `previous` had under its id replaced by that one. */
export function keepUnchanged<T extends { id: string }>(
  previous: readonly T[] | null | undefined,
  next: T[],
): T[] {
  if (!previous?.length) return next
  const before = new Map(previous.map((x) => [x.id, x]))
  return next.map((x) => {
    const old = before.get(x.id)
    return old && sameValue(old, x) ? old : x
  })
}

/** `next` with each value equal to `previous`'s under the same key replaced by that one. */
export function keepUnchangedValues<K, V>(
  previous: ReadonlyMap<K, V> | null | undefined,
  next: Map<K, V>,
): Map<K, V> {
  if (!previous?.size) return next
  for (const [k, v] of next) {
    const old = previous.get(k)
    if (old !== undefined && old !== v && sameValue(old, v)) next.set(k, old)
  }
  return next
}
