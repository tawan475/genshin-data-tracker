/**
 * A per-account cache of one settings object (see account-settings.ts): a
 * read is reused for `reuseMs`, concurrent reads share one request, a failed
 * read is forgotten, and a save keeps the server's answer.
 */

interface Entry<T> {
  at: number
  promise: Promise<T>
}

export interface SettingsCache<T, P> {
  /** The settings; `fresh` reads them again. */
  load(id: number, options?: { fresh?: boolean }): Promise<T>
  /** Settings the server just answered with. */
  seed(id: number, value: T): void
  /** Saves a change; later reads start from the server's answer. */
  save(id: number, patch: P): Promise<T>
  /** The next read asks the server (changed elsewhere). */
  drop(id: number): void
  clear(): void
}

export function createSettingsCache<T, P>(
  read: (id: number) => Promise<T>,
  write: (id: number, patch: P) => Promise<T>,
  reuseMs = 60_000,
): SettingsCache<T, P> {
  const entries = new Map<number, Entry<T>>()
  const seed = (id: number, value: T) =>
    void entries.set(id, { at: Date.now(), promise: Promise.resolve(value) })
  return {
    load(id, options = {}) {
      const entry = entries.get(id)
      if (entry && Date.now() - entry.at < (options.fresh ? 0 : reuseMs)) return entry.promise
      const promise = read(id)
      const mine: Entry<T> = { at: Date.now(), promise }
      entries.set(id, mine)
      promise.catch(() => {
        if (entries.get(id) === mine) entries.delete(id)
      })
      return promise
    },
    seed,
    async save(id, patch) {
      entries.delete(id)
      const value = await write(id, patch)
      seed(id, value)
      return value
    },
    drop: (id) => void entries.delete(id),
    clear: () => entries.clear(),
  }
}
