import {
  computed,
  onScopeDispose,
  shallowReactive,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
import { api } from '@/api'
import { updatesHeld } from '@/live/holds'
import { onPlannerChange } from '@/live/planner-changes'
import { useFeedback } from '@/stores/feedback'
import { withFavorite, type Favorites } from './characters'

/**
 * Favourite characters (account setting `favoriteCharacters`: GOOD keys, a
 * Traveler by its element key), pinned to the top of the Characters page.
 * One copy per account for the whole app, so the cards, the list and the
 * details agree.
 *
 * A toggle shows at once and is saved as the whole list; saves go one at a
 * time, each over what the server last answered, and a refused one says so
 * and drops out (the star goes back). Changes from another tab or device
 * arrive through the live socket (a settings write sends `planner`); they
 * wait while a dialog is open or the tab is hidden, like the Planner's.
 */

interface Toggle {
  key: string
  on: boolean
}

/** What the server last answered, per account. */
const confirmed = new Map<number, readonly string[]>()
/** Toggles not answered yet, oldest first. */
const pending = new Map<number, Toggle[]>()
/** What shows: `confirmed` with the pending toggles over it. */
const shown = shallowReactive(new Map<number, readonly string[]>())
const queues = new Map<number, Promise<void>>()
const reads = new Map<number, Promise<void>>()
/** Saves answered, per account: a read that started before one is older than it. */
const saves = new Map<number, number>()

function publish(id: number) {
  let list = confirmed.get(id) ?? []
  for (const t of pending.get(id) ?? []) list = withFavorite(list, t.key, t.on)
  shown.set(id, list)
}

/** Reads the account's favourites (one read at a time per account). */
function load(id: number): Promise<void> {
  let read = reads.get(id)
  if (!read) {
    const since = saves.get(id) ?? 0
    read = api
      .accountSettings(id)
      .then(
        ({ settings }) => {
          if ((saves.get(id) ?? 0) !== since) return
          confirmed.set(id, settings.favoriteCharacters ?? [])
          publish(id)
        },
        () => {
          // What showed stays (none on a first read); the page works without them.
        },
      )
      .finally(() => reads.delete(id))
    reads.set(id, read)
  }
  return read
}

export interface FavoriteCharacters {
  /** The account's favourites (empty until they have loaded). */
  favorites: ComputedRef<Favorites>
  isFavorite: (key: string) => boolean
  /** Favourites `key`, or not; resolves once saved (or refused, which says so). */
  toggle: (key: string) => Promise<void>
}

/** The favourite characters of `accountId`, kept fresh while the calling scope lives. */
export function useFavoriteCharacters(accountId: MaybeRefOrGetter<number>): FavoriteCharacters {
  const feedback = useFeedback()
  const id = () => toValue(accountId)

  // Shows what is known at once, then re-reads (changed elsewhere while away).
  watch(id, (value) => void load(value), { immediate: true })

  const favorites = computed<Favorites>(() => new Set(shown.get(id()) ?? []))

  function toggle(key: string): Promise<void> {
    const account = id()
    const change: Toggle = { key, on: !favorites.value.has(key) }
    const waiting = pending.get(account) ?? []
    pending.set(account, [...waiting, change])
    publish(account)
    const run = (queues.get(account) ?? Promise.resolve()).then(async () => {
      try {
        const { settings } = await api.updateAccountSettings(account, {
          favoriteCharacters: withFavorite(confirmed.get(account) ?? [], key, change.on),
        })
        confirmed.set(account, settings.favoriteCharacters ?? [])
        saves.set(account, (saves.get(account) ?? 0) + 1)
      } catch (cause) {
        feedback.error('Not saved', cause)
      } finally {
        pending.set(
          account,
          (pending.get(account) ?? []).filter((t) => t !== change),
        )
        publish(account)
      }
    })
    queues.set(account, run)
    return run
  }

  // ------------------------------------------------------------------ live

  let stale = false
  function catchUp() {
    if (!stale || updatesHeld.value || document.visibilityState !== 'visible') return
    stale = false
    void load(id())
  }
  const stopListening = onPlannerChange((changed) => {
    if (changed !== id()) return
    stale = true
    catchUp()
  })
  const stopWatching = watch(updatesHeld, catchUp)
  document.addEventListener('visibilitychange', catchUp)
  onScopeDispose(() => {
    stopListening()
    stopWatching()
    document.removeEventListener('visibilitychange', catchUp)
  })

  return {
    favorites,
    isFavorite: (key) => favorites.value.has(key),
    toggle,
  }
}
