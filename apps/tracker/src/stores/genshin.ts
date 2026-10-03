import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGenshinStore = defineStore('genshin', () => {
  const selectedAccountId = ref<number | null>(null)
  const selectedAccountName = ref<string | null>(null)

  const refetchTrigger = ref(0)

  const accountsRefetchTrigger = ref(0)

  const selectAccount = (id: number, name: string) => {
    selectedAccountId.value = id
    selectedAccountName.value = name
  }

  const clearSelection = () => {
    selectedAccountId.value = null
    selectedAccountName.value = null
  }

  const triggerRefetch = () => {
    refetchTrigger.value++
  }

  const triggerAccountsRefetch = () => {
    accountsRefetchTrigger.value++
  }

  return {
    selectedAccountId,
    selectedAccountName,
    refetchTrigger,
    accountsRefetchTrigger,
    selectAccount,
    clearSelection,
    triggerRefetch,
    triggerAccountsRefetch
  }
})
