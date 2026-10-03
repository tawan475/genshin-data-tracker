import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './auth'
import { USER_SETTINGS_DEFAULTS, type UserSettings } from '../types/settings'
import {
  applyDocumentTheme,
  readStoredTheme,
} from '../bootstrap-theme'
import {
  clearAllLocalSettings,
  readUserSettings,
  writeUserSettings,
} from '../utils/local-settings'

function readInitialUserSettings(): UserSettings {
  return {
    theme: readStoredTheme(),
    use24Hour: USER_SETTINGS_DEFAULTS.use24Hour,
    ...readUserSettings(),
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const authStore = useAuthStore()
  const loggedIn = !!authStore.token

  const initial = loggedIn ? readInitialUserSettings() : USER_SETTINGS_DEFAULTS
  const use24Hour = ref(initial.use24Hour)
  const theme = ref<UserSettings['theme']>(initial.theme)
  const isHydrated = ref(true)
  const isApplyingFromServer = ref(false)

  const resetToDefaults = () => {
    theme.value = USER_SETTINGS_DEFAULTS.theme
    use24Hour.value = USER_SETTINGS_DEFAULTS.use24Hour
    applyDocumentTheme(USER_SETTINGS_DEFAULTS.theme)
  }

  const hydrateFromLocal = () => {
    const local = readInitialUserSettings()
    theme.value = local.theme
    use24Hour.value = local.use24Hour
    applyDocumentTheme(local.theme)
  }

  if (!loggedIn) {
    clearAllLocalSettings()
    resetToDefaults()
  }

  const pushUserSettingsToServer = async (settings: UserSettings) => {
    if (!authStore.token) return
    try {
      await authStore.fetchWithAuth(`${authStore.API_URL}/users/me/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
    } catch (err) {
      console.error('Failed to sync user settings to server', err)
    }
  }

  function toggle24Hour() {
    use24Hour.value = !use24Hour.value
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  watch(use24Hour, (val) => {
    if (!isHydrated.value || isApplyingFromServer.value || !authStore.token) return
    const settings: UserSettings = { theme: theme.value, use24Hour: val }
    writeUserSettings(settings)
    void pushUserSettingsToServer(settings)
  })

  watch(theme, (val) => {
    applyDocumentTheme(val)
    if (!isHydrated.value || isApplyingFromServer.value || !authStore.token) return
    const settings: UserSettings = { theme: val, use24Hour: use24Hour.value }
    writeUserSettings(settings)
    void pushUserSettingsToServer(settings)
  })

  watch(
    () => authStore.token,
    (token, previous) => {
      if (!token) {
        clearAllLocalSettings()
        resetToDefaults()
        return
      }

      if (!previous) {
        isApplyingFromServer.value = true
        hydrateFromLocal()
        isApplyingFromServer.value = false
        return
      }

      hydrateFromLocal()
    },
  )

  return {
    use24Hour,
    toggle24Hour,
    theme,
    toggleTheme,
    isHydrated,
  }
})
