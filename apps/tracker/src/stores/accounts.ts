import type { AccountResponse } from '@gdt/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, type AccountInput } from '@/api'
import { readStorage, writeStorage } from '@/lib/storage'
import { postToTabs } from '@/live/channel'
import { isHeld, pendingIds } from '@/live/holds'
import { mergeAccounts } from '@/live/policy'
import { useSession } from './session'

/**
 * The user's Genshin accounts. Each carries `dataVersion`, which moves on
 * every import or delete; data caches (see @/data) key on it, so a newer row
 * here is what makes the pages re-load their data.
 *
 * Fresh rows (from the live updates, another tab, or a re-read here) go
 * through `merge`: an unchanged row keeps its identity, so nothing re-loads,
 * and while a dialog is open (see @/live/holds) newer versions wait in
 * `pending` and apply when it closes.
 */
export const useAccounts = defineStore('accounts', () => {
  const list = ref<AccountResponse[]>([])
  const loaded = ref(false)
  let loading: Promise<void> | null = null
  let pending = new Map<number, AccountResponse>()
  /** The ETag of the newest whole list this tab has (shown or waiting). */
  let etag: string | null = null

  const byId = computed(() => new Map(list.value.map((a) => [a.id, a])))

  function setPending(next: Map<number, AccountResponse>) {
    pending = next
    pendingIds.value = new Set(next.keys())
  }

  /**
   * Folds fresh rows in; `complete` when they are the whole list (accounts
   * missing from it are gone). Returns the rows that brought a new newest
   * capture. `force` applies past open dialogs (their "Refresh").
   */
  function merge(
    fresh: readonly AccountResponse[],
    options: { complete?: boolean; etag?: string | null; force?: boolean } = {},
  ): AccountResponse[] {
    const result = mergeAccounts({
      shown: list.value,
      pending,
      fresh,
      complete: options.complete ?? false,
      held: (id) => isHeld(id, options.force),
    })
    if (result.changed) list.value = result.shown
    setPending(result.pending)
    if (options.etag !== undefined) etag = options.etag
    return result.captures
  }

  /** Applies what waits and may go now; returns the new captures among it. */
  function applyPending(force = false): AccountResponse[] {
    return pending.size === 0 ? [] : merge([], { force })
  }

  /** The ETag to revalidate the list with (Pinia would freeze a plain getter's value). */
  function currentEtag(): string | null {
    return etag
  }

  /** The newest version this tab knows of an account, shown or waiting. */
  function knownVersion(id: number): number | null {
    const versions = [byId.value.get(id)?.dataVersion, pending.get(id)?.dataVersion].filter(
      (v): v is number => v !== undefined,
    )
    return versions.length ? Math.max(...versions) : null
  }

  async function refresh() {
    const fresh = await api.accountsSince(null)
    if (fresh) merge(fresh.list, { complete: true, etag: fresh.etag })
    loaded.value = true
  }

  function ensureLoaded(): Promise<void> {
    loading ??= refresh().catch((error) => {
      loading = null
      throw error
    })
    return loading
  }

  /** Re-reads one account (after an import or delete moved its data version). */
  async function reload(id: number): Promise<AccountResponse> {
    const fresh = await api.account(id)
    merge([fresh])
    const userId = useSession().me?.id
    if (userId !== undefined) postToTabs({ type: 'rows', userId, rows: [fresh] })
    return fresh
  }

  async function create(input: AccountInput) {
    const created = await api.createAccount(input)
    merge([created.account])
    rememberLast(created.account.id)
    return created
  }

  async function update(id: number, input: AccountInput) {
    const updated = await api.updateAccount(id, input)
    merge([updated])
    return updated
  }

  async function remove(id: number) {
    await api.deleteAccount(id)
    list.value = list.value.filter((a) => a.id !== id)
    if (pending.has(id)) {
      const next = new Map(pending)
      next.delete(id)
      setPending(next)
    }
    if (lastAccountId() === id) rememberLast(null)
  }

  function displayName(account: Pick<AccountResponse, 'name' | 'uid' | 'id'>): string {
    return account.name || (account.uid ? `UID ${account.uid}` : `Account ${account.id}`)
  }

  function clear() {
    list.value = []
    loaded.value = false
    loading = null
    setPending(new Map())
    etag = null
  }

  return {
    list,
    loaded,
    byId,
    currentEtag,
    merge,
    applyPending,
    knownVersion,
    refresh,
    ensureLoaded,
    reload,
    create,
    update,
    remove,
    displayName,
    clear,
  }
})

function storedLast(): number | null {
  const value = Number(readStorage('last-account'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

// Reactive, so anything showing "the current account" updates the moment it changes.
const lastId = ref<number | null>(storedLast())

/** The account the user last opened on this device, to land on next time. */
export function lastAccountId(): number | null {
  return lastId.value
}

export function rememberLast(id: number | null): void {
  lastId.value = id
  writeStorage('last-account', id === null ? null : String(id))
}
