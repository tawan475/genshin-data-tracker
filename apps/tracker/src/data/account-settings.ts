import type { AccountSettings, AccountSettingsPatch } from '@gdt/shared'
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
/** Settings the server just answered with (the bootstrap). */
export const seedAccountSettings = cache.seed
/** Saves a change; later reads start from the server's answer. */
export const saveAccountSettings = cache.save
/** Signed out: nothing is kept. */
export const forgetAccountSettings = cache.clear

// Changed in another tab or on another device: the next read asks again.
onPlannerChange(cache.drop)
