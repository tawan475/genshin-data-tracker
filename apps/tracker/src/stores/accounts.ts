import type { AccountResponse } from '@gdt/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, type AccountInput } from '@/api'
import { readStorage, writeStorage } from '@/lib/storage'

/**
 * The user's Genshin accounts. Each carries `dataVersion`, which moves on
 * every import or delete; data caches (see @/data) key on it, so refreshing
 * this list is what invalidates them.
 */
export const useAccounts = defineStore('accounts', () => {
  const list = ref<AccountResponse[]>([])
  const loaded = ref(false)
  let loading: Promise<void> | null = null

  const byId = computed(() => new Map(list.value.map((a) => [a.id, a])))

  async function refresh() {
    list.value = await api.accounts()
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
    const index = list.value.findIndex((a) => a.id === id)
    if (index === -1) list.value.push(fresh)
    else list.value.splice(index, 1, fresh)
    return fresh
  }

  async function create(input: AccountInput) {
    const created = await api.createAccount(input)
    list.value.push(created.account)
    rememberLast(created.account.id)
    return created
  }

  async function update(id: number, input: AccountInput) {
    const updated = await api.updateAccount(id, input)
    list.value.splice(
      list.value.findIndex((a) => a.id === id),
      1,
      updated,
    )
    return updated
  }

  async function remove(id: number) {
    await api.deleteAccount(id)
    list.value = list.value.filter((a) => a.id !== id)
    if (lastAccountId() === id) writeStorage('last-account', null)
  }

  function displayName(account: Pick<AccountResponse, 'name' | 'uid' | 'id'>): string {
    return account.name || (account.uid ? `UID ${account.uid}` : `Account ${account.id}`)
  }

  function clear() {
    list.value = []
    loaded.value = false
    loading = null
  }

  return {
    list,
    loaded,
    byId,
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

/** The account the user last opened on this device, to land on next time. */
export function lastAccountId(): number | null {
  const value = Number(readStorage('last-account'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export function rememberLast(id: number): void {
  writeStorage('last-account', String(id))
}
