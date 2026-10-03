import {
  PASSWORD_ITERATIONS,
  USER_SETTINGS_DEFAULTS,
  derivePasswordKey,
  randomSalt,
  type MeResponse,
  type UserSettings,
} from '@gdt/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, onSignedOut } from '@/api'
import { setClockPreference } from '@/lib/format'
import { applyTheme } from '@/lib/theme'

type Status = 'unknown' | 'signed-in' | 'signed-out'

/**
 * Who is signed in. The password never leaves the browser: it is stretched
 * with PBKDF2 under the account's salt and only the derived key is sent.
 */
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

  /** Resolves the session once; later calls reuse the same answer. */
  function ensureLoaded(): Promise<void> {
    loading ??= api
      .me()
      .then(adopt)
      .catch(() => adopt(null))
    return loading
  }

  async function login(login: string, password: string) {
    const { salt, iterations } = await api.prelogin(login)
    const key = await derivePasswordKey(password, salt, iterations)
    adopt(await api.login(login, key))
    loading = Promise.resolve()
  }

  async function register(username: string, email: string, password: string) {
    const salt = randomSalt()
    const key = await derivePasswordKey(password, salt, PASSWORD_ITERATIONS)
    adopt(await api.register({ username, email, salt, iterations: PASSWORD_ITERATIONS, key }))
    loading = Promise.resolve()
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      adopt(null)
    }
  }

  async function changePassword(current: string, next: string) {
    if (!me.value) throw new Error('Not signed in')
    const { salt: currentSalt, iterations } = await api.prelogin(me.value.username)
    const currentKey = await derivePasswordKey(current, currentSalt, iterations)
    const salt = randomSalt()
    const key = await derivePasswordKey(next, salt, PASSWORD_ITERATIONS)
    await api.changePassword({ currentKey, salt, iterations: PASSWORD_ITERATIONS, key })
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
    changePassword,
    updateSettings,
  }
})
