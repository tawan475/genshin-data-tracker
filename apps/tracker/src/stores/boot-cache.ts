import type { BootstrapResponse } from '@gdt/shared'
import { readJson, writeJson, writeStorage } from '@/lib/storage'

/**
 * The last bootstrap this device saw (the user and the account list), shown at once on the next visit while the new
 * bootstrap is on its way, so a repeat visit renders from what this device
 * holds (with the account data in idb-cache) before any network answer.
 * Kept fresh as the session and the list change; signing out removes it.
 */

const KEY = 'boot-cache'
/** Bumped when the shape kept here changes: an older one is ignored. */
const FORMAT = 1

type BootCache = Pick<BootstrapResponse, 'me' | 'accounts'>

export function readBootCache(): BootCache | null {
  const value = readJson<(BootCache & { format?: number }) | null>(KEY, null)
  if (!value || value.format !== FORMAT || !value.me || !Array.isArray(value.accounts)) return null
  return value
}

/** Replaces parts of what is kept (nothing is kept until a whole bootstrap is). */
export function updateBootCache(patch: Partial<BootCache>, whole = false): void {
  const current = readBootCache()
  if (!current && !whole) return
  writeJson(KEY, { ...current, ...patch, format: FORMAT })
}

export function clearBootCache(): void {
  writeStorage(KEY, null)
}

/** The user the kept bootstrap belongs to. */
export function bootCacheUser(): number | null {
  return readBootCache()?.me.id ?? null
}
