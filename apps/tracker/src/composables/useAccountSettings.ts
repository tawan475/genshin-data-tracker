import { ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useGenshinStore } from '../stores/genshin'
import {
  ACCOUNT_SETTINGS_DEFAULTS,
  type AccountSettings,
  MATERIALS_GRAPH_DEFAULTS,
  type MaterialsGraphSettings,
} from '../types/settings'
import {
  readAccountSettings,
  writeAccountSettings,
} from '../utils/local-settings'

function withDefaults(partial: AccountSettings | null): AccountSettings {
  return {
    materialsGraph: {
      ...MATERIALS_GRAPH_DEFAULTS,
      ...(partial?.materialsGraph ?? {}),
    },
  }
}

export function useAccountSettings() {
  const authStore = useAuthStore()
  const genshinStore = useGenshinStore()

  const accountSettings = ref<AccountSettings>({
    materialsGraph: { ...MATERIALS_GRAPH_DEFAULTS },
  })
  const isLoading = ref(false)
  const isSaving = ref(false)

  const pushAccountSettingsToServer = async (
    accountId: number,
    partial: { materialsGraph?: Partial<MaterialsGraphSettings> },
  ) => {
    if (!authStore.token) return
    isSaving.value = true
    try {
      await authStore.fetchWithAuth(
        `${authStore.API_URL}/genshin-accounts/${accountId}/settings`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partial),
        },
      )
    } catch (err) {
      console.error('Failed to sync account settings to server', err)
    } finally {
      isSaving.value = false
    }
  }

  const adoptAccountSettingsFromServer = async (accountId: number) => {
    if (!authStore.token) return

    isLoading.value = true
    try {
      const res = await authStore.fetchWithAuth(
        `${authStore.API_URL}/genshin-accounts/${accountId}/settings`,
      )
      if (!res.ok) return

      const parsed = await res.json()
      const data = parsed.data ?? parsed
      const server = withDefaults(data as AccountSettings)
      accountSettings.value = server
      writeAccountSettings(accountId, server)
    } catch (err) {
      console.error('Failed to load account settings from server', err)
    } finally {
      isLoading.value = false
    }
  }

  const patchAccountSettings = (partial: {
    materialsGraph?: Partial<MaterialsGraphSettings>
  }) => {
    const accountId = genshinStore.selectedAccountId
    if (!accountId || !authStore.token) return

    accountSettings.value = writeAccountSettings(accountId, partial)
    void pushAccountSettingsToServer(accountId, partial)
  }

  watch(
    () => [genshinStore.selectedAccountId, authStore.token] as const,
    ([accountId, token]) => {
      if (!token || !accountId) {
        accountSettings.value = {
          materialsGraph: { ...ACCOUNT_SETTINGS_DEFAULTS.materialsGraph },
        }
        return
      }

      const local = readAccountSettings(accountId)
      if (local) {
        accountSettings.value = local
        return
      }

      void adoptAccountSettingsFromServer(accountId)
    },
    { immediate: true },
  )

  return {
    accountSettings,
    isLoading,
    isSaving,
    patchAccountSettings,
  }
}
