import {
  USER_SETTINGS_DEFAULTS,
  hasPermission,
  type MeResponse,
  type PermissionNode,
  type OAuthLinkLoginResponse,
  type UserSettings,
} from '@gdt/shared'
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

  /**
   * Whether the user's staff roles grant `node` (the app hides what they
   * can't use; the Worker checks every request again).
   */
  function can(node: PermissionNode): boolean {
    return hasPermission(me.value?.permissions ?? [], node)
  }

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

  /** `turnstile`: the human check's token, while the server has it on (all four). */
  async function login(login: string, password: string, turnstile?: string) {
    adopt(await api.login(login, password, turnstile))
    loading = Promise.resolve()
  }

  async function register(
    username: string,
    email: string | null,
    password: string,
    turnstile?: string,
  ) {
    adopt(await api.register({ username, email, password, turnstile }))
    loading = Promise.resolve()
  }

  /** A new account for the provider account waiting on /oauth; signs in. */
  async function oauthRegister(username: string, useEmail: boolean, turnstile?: string) {
    adopt(await api.oauthRegister({ username, useEmail, turnstile }))
    loading = Promise.resolve()
  }

  /** Signs in with a password and links the waiting provider account (unless `problem`). */
  async function oauthLinkLogin(
    login: string,
    password: string,
    turnstile?: string,
  ): Promise<OAuthLinkLoginResponse> {
    const result = await api.oauthLinkLogin(login, password, turnstile)
    adopt(result.me)
    loading = Promise.resolve()
    return result
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

  /** Username and/or email; omitted fields stay as they are. */
  async function updateProfile(body: { username?: string; email?: string | null }) {
    adopt(await api.updateProfile(body))
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api.changePassword({ currentPassword, newPassword })
  }

  /** A first password (the account was made with Discord or Google). */
  async function setPassword(password: string) {
    adopt(await api.setPassword(password))
  }

  /** Sets a new password from a reset link; the server signs this browser in. */
  async function resetPassword(token: string, password: string) {
    adopt(await api.resetPassword(token, password))
    loading = Promise.resolve()
  }

  /** A confirmation link was used (maybe in this browser's session): show it confirmed. */
  function emailConfirmed(email: string) {
    if (me.value?.email === email) me.value = { ...me.value, emailVerified: true }
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

  /** A new all-accounts Irminsul key (the old one stops working); returns it once. */
  async function newImportKey(): Promise<string> {
    const { importKey } = await api.newUserImportKey()
    if (me.value) me.value = { ...me.value, hasImportKey: true }
    return importKey
  }

  async function revokeImportKey() {
    await api.revokeUserImportKey()
    if (me.value) me.value = { ...me.value, hasImportKey: false }
  }

  /** Deletes this user and everything they own (signed out everywhere after). */
  async function deleteMe(username: string) {
    await api.deleteMe(username)
    adopt(null)
  }

  return {
    me,
    status,
    settings,
    ensureLoaded,
    login,
    register,
    oauthRegister,
    oauthLinkLogin,
    logout,
    logoutAll,
    updateProfile,
    changePassword,
    setPassword,
    resetPassword,
    emailConfirmed,
    updateSettings,
    newImportKey,
    revokeImportKey,
    deleteMe,
    can,
  }
})
