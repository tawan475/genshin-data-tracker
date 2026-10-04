import type { TravelerGender } from '@gdt/game-data/images'
import { ACCOUNT_SETTINGS_DEFAULTS } from '@gdt/shared'
import { shallowRef } from 'vue'
import { api } from '@/api'
import { setTravelerGender } from '@/lib/assets'

/**
 * The current account's Traveler twin (account setting `traveler`), which
 * only picks the portrait: GOOD names every Traveler `Traveler<Element>`.
 * AccountLayout loads it on account switch; Account settings changes it.
 */
export const travelerGender = shallowRef<TravelerGender>(ACCOUNT_SETTINGS_DEFAULTS.traveler)

const known = new Map<number, TravelerGender>()
let current: number | null = null

function apply(gender: TravelerGender) {
  travelerGender.value = gender
  setTravelerGender(gender)
}

export async function loadTraveler(accountId: number): Promise<void> {
  current = accountId
  const cached = known.get(accountId)
  if (cached) return apply(cached)
  apply(ACCOUNT_SETTINGS_DEFAULTS.traveler)
  try {
    const { settings } = await api.accountSettings(accountId)
    known.set(accountId, settings.traveler)
    if (current === accountId) apply(settings.traveler)
  } catch {
    // The default portrait stays; nothing else depends on it.
  }
}

/** Shows the new twin at once; rejects (and reverts) when saving fails. */
export async function saveTraveler(accountId: number, gender: TravelerGender): Promise<void> {
  const before = known.get(accountId) ?? travelerGender.value
  known.set(accountId, gender)
  if (current === accountId) apply(gender)
  try {
    await api.updateAccountSettings(accountId, { traveler: gender })
  } catch (error) {
    known.set(accountId, before)
    if (current === accountId) apply(before)
    throw error
  }
}
