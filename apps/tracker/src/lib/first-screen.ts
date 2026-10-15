/** How many tiles of a bag count as its first screen (a wide screen's first rows). */
export const FIRST_SCREEN_TILES = 30

/** The ids of the first `FIRST_SCREEN_TILES` items across a bag's sections, in order. */
export function firstScreen<T, K>(sections: readonly (readonly T[])[], id: (item: T) => K): Set<K> {
  const out = new Set<K>()
  for (const items of sections) {
    for (const item of items) {
      if (out.size >= FIRST_SCREEN_TILES) return out
      out.add(id(item))
    }
  }
  return out
}
