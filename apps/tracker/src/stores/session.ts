import { USER_SETTINGS_DEFAULTS, type MeResponse, type UserSettings } from '@gdt/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, onSignedOut } from '@/api'
import { setClockPreference } from '@/lib/format'
import { applyTheme } from '@/lib/theme'

type Status = 'unknown' | 'signed-in' | 'signed-out'

function hasSessionHint(): boolean {
  try {
    return document.cookie.split('; ').some((c) => c.startsWith('gdt_s='))
  } catch {
    return true
  }
}

/** Who is signed in. Tokens live in HttpOnly cookies; this store never sees them. */
export const useSession = defineStore('session', () => {
  const me = ref<MeResponse | null>(null)
  const status = ref<Status>('unknown')
  let loading: Promise<void> | null = null

  const settings = computed<UserSettings>(() => me.value?.settings ?? USER_SETTINGS_DEFAULTS)

  function adopt(user: MeResponse | null) {
    me.value = user
    status.value = user ? 'signed-in' : 'signed-out'
    if (user) {
      applyTheme(user.settings.theme)
      setClockPreference(user.settings.use24Hour)
    }
  }

  onSignedOut(() => adopt(null))

  /**
   * Resolves the session once; later calls reuse the same answer. Without the
   * server's `gdt_s` hint cookie there is no session to find, so a signed-out
   * visitor costs no requests at all.
   */
  function ensureLoaded(): Promise<void> {
    loading ??= hasSessionHint()
      ? api
          .me()
          .then(adopt)
          .catch(() => adopt(null))
      : Promise.resolve(adopt(null))
    return loading
  }

  async function login(login: string, password: string) {
    adopt(await api.login(login, password))
    loading = Promise.resolve()
  }

  async function register(username: string, email: string | null, password: string) {
    adopt(await api.register({ username, email, password }))
    loading = Promise.resolve()
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      adopt(null)
    }
  }

  /** Signs out every device, this one included. */
  async function logoutAll() {
    await api.logoutAll()
    adopt(null)
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api.changePassword({ currentPassword, newPassword })
  }

  /** Applies the change at once and rolls it back if the server refuses it. */
  async function updateSettings(patch: Partial<UserSettings>) {
    const before = me.value
    if (before) adopt({ ...before, settings: { ...before.settings, ...patch } })
    try {
      adopt(await api.updateUserSettings(patch))
    } catch (error) {
      if (before && me.value) adopt({ ...me.value, settings: before.settings })
      throw error
    }
  }

  return {
    me,
    status,
    settings,
    ensureLoaded,
    login,
    register,
    logout,
    logoutAll,
    changePassword,
    updateSettings,
  }
})
