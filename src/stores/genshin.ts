import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGenshinStore = defineStore('genshin', () => {
  const selectedAccountId = ref<number | null>(null)
  const selectedAccountName = ref<string | null>(null)

  const refetchTrigger = ref(0)

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

  return {
    selectedAccountId,
    selectedAccountName,
    refetchTrigger,
    selectAccount,
    clearSelection,
    triggerRefetch
  }
})
