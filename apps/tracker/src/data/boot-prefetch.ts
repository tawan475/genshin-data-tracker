import { readJson, writeJson } from '@/lib/storage'
import {
  loadAccountPlayer,
  loadBundle,
  loadLatestInventory,
  loadPreviousArtifactIds,
  loadSnapshots,
  type AccountRef,
} from './account-data'
import { COLLECTION_SECTIONS } from './collection-parts'
import { loadMaterialsHistory } from './materials'
import { preload } from './use-resource'

/**
 * Opening the app on an account page starts that page's data at once, in
 * parallel with the bootstrap request, instead of after it: the last data
 * version this device saw of the account (and its newest capture) names the
 * same cached loads the page will ask for. When the bootstrap says the
 * version moved meanwhile (a capture landed), the page asks for the new one
 * and these go unused.
 */

export interface AccountHint extends AccountRef {
  latest: { id: number; takenAt: number } | null
}

const key = (id: number) => `account-hint:${id}`

/** Remembers what the account looked like (AccountLayout, on every version). */
export function rememberAccountHint(account: AccountHint): void {
  const hint: AccountHint = {
    id: account.id,
    dataVersion: account.dataVersion,
    latest: account.latest ? { id: account.latest.id, takenAt: account.latest.takenAt } : null,
    ...(account.liveSync ? { liveSync: true } : {}),
  }
  writeJson(key(account.id), hint)
}

function readHint(id: number): AccountHint | null {
  const hint = readJson<AccountHint | null>(key(id), null)
  return hint && hint.id === id && Number.isSafeInteger(hint.dataVersion) ? hint : null
}

/** What each account page loads first, by its path segment after `/app/a/:id`. */
const PAGES: Record<string, (hint: AccountHint) => Promise<unknown>[]> = {
  '': (h) => [loadSnapshots(h)],
  snapshots: (h) => [loadSnapshots(h)],
  characters: (h) => [loadLatestInventory(h)],
  weapons: (h) => [loadLatestInventory(h)],
  artifacts: (h) => [loadLatestInventory(h), loadPreviousArtifactIds(h)],
  planner: (h) => [loadLatestInventory(h), loadAccountPlayer(h)],
  materials: (h) => [loadMaterialsHistory(h), loadLatestInventory(h)],
  achievements: (h) => [loadBundle(h, { sections: ['achievements', 'achievementTimes'] })],
  collections: (h) => [loadBundle(h, { sections: [...COLLECTION_SECTIONS] })],
  'collections/anecdotes': (h) => [loadBundle(h, { sections: ['anecdotes'] })],
}

/** Starts the data of the account page at `path`, when this device has seen the account. */
export function prefetchAccountPage(path: string): void {
  const match = /^\/app\/a\/(\d+)(?:\/([a-z]+(?:\/[a-z-]+)?))?\/?$/.exec(path)
  if (!match) return
  // Collections' tabs share one bundle, but for Anecdotes (also its old path).
  const segment = match[2] ?? ''
  const name =
    segment === 'anecdotes' || segment === 'collections/anecdotes'
      ? 'collections/anecdotes'
      : segment.startsWith('collections/')
        ? 'collections'
        : segment
  const page = PAGES[name]
  const hint = page && readHint(Number(match[1]))
  if (!page || !hint) return
  for (const promise of page(hint)) preload(promise)
}
