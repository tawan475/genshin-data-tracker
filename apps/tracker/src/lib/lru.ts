/**
 * A small least-recently-used map: reading or writing an entry makes it the
 * newest, and the oldest ones go once there are more than `maxEntries` or
 * their total `weigh` passes `maxWeight` (the newest entry always stays,
 * even when it alone is heavier). Pure; used for the image preloads and the
 * share card's inlined images.
 */
export class Lru<K, V> {
  private readonly entries = new Map<K, { value: V; weight: number }>()
  private total = 0

  constructor(
    private readonly maxEntries: number,
    private readonly maxWeight = Infinity,
    private readonly weigh: (value: V) => number = () => 0,
  ) {}

  get size(): number {
    return this.entries.size
  }

  /** The total weight held. */
  get weight(): number {
    return this.total
  }

  has(key: K): boolean {
    return this.entries.has(key)
  }

  /** The value, made the newest; undefined when absent. */
  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  /** Stores `value` as the newest and drops the oldest past the limits. */
  set(key: K, value: V): void {
    this.delete(key)
    const weight = this.weigh(value)
    this.entries.set(key, { value, weight })
    this.total += weight
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.total <= this.maxWeight) break
      if (oldest === key) break
      this.entries.delete(oldest)
      this.total -= entry.weight
    }
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.entries.delete(key)
    this.total -= entry.weight
    return true
  }

  /** Keys, oldest first. */
  keys(): K[] {
    return [...this.entries.keys()]
  }
}
