/**
 * localStorage that never throws: private mode, blocked storage and quota
 * errors all degrade to "nothing stored". Keys are namespaced `gdt:`.
 * Only per-device conveniences live here; anything that must persist goes
 * to the server.
 */

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(`gdt:${key}`)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`gdt:${key}`)
    else localStorage.setItem(`gdt:${key}`, value)
  } catch {
    // Storage unavailable; the value just won't persist.
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readStorage(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  writeStorage(key, JSON.stringify(value))
}
