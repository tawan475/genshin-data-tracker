import type { AccountSettings, AccountSettingsPatch, BootstrapResponse } from '@gdt/shared'
import { api } from '@/api'
import { onPlannerChange } from '@/live/planner-changes'
import { createSettingsCache } from './settings-cache'

/**
 * Account settings, read once and shared: the Traveler twin, favourites,
 * planner options and chart settings all live in one settings object, and
 * each page used to read it on its own (up to three requests per page). The
 * bootstrap brings the opened account's settings along (`seedAccountSettings`).
 *
 * A read is reused for a minute; a settings change elsewhere (the live
 * socket's `planner` event, which every settings write sends) drops it, and
 * a save here keeps the server's answer.
 */
const cache = createSettingsCache<AccountSettings, AccountSettingsPatch>(
  async (id) => (await api.accountSettings(id)).settings,
  async (id, patch) => (await api.updateAccountSettings(id, patch)).settings,
)

/** The account's settings; `fresh` reads them again. */
export const loadAccountSettings = cache.load
/** Settings the server just answered with. */
export const seedAccountSettings = cache.seed

/**
 * The settings of the account the app opens on come with the bootstrap:
 * pages that ask before it answers wait for it rather than read them apart
 * (a read of their own when it doesn't carry them).
 */
export function settingsFromBootstrap(id: number, boot: Promise<BootstrapResponse>): void {
  const read = async () => (await api.accountSettings(id)).settings
  cache.seed(
    id,
    boot.then(
      (b) => (b.account?.id === id ? b.account.settings : read()),
      () => read(),
    ),
  )
}
/** Saves a change; later reads start from the server's answer. */
export const saveAccountSettings = cache.save
/** Signed out: nothing is kept. */
export const forgetAccountSettings = cache.clear

// Changed in another tab or on another device: the next read asks again.
onPlannerChange(cache.drop)
