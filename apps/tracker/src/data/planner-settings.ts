import {
  ACCOUNT_SETTINGS_DEFAULTS,
  type AccountSettings,
  type AccountSettingsPatch,
  type PlannerSettings,
} from '@gdt/shared'
import { shallowRef, watch, type Ref } from 'vue'
import { api } from '@/api'
import { useFeedback } from '@/stores/feedback'

/** The account settings the planner reads: AR, World Level and its options. */
export type PlannerOptions = Pick<AccountSettings, 'ar' | 'wl'> & { planner: PlannerSettings }

export interface PlannerOptionsPatch {
  ar?: number | null
  wl?: number | null
  planner?: Partial<PlannerSettings>
}

const DEFAULTS: PlannerOptions = {
  ar: ACCOUNT_SETTINGS_DEFAULTS.ar,
  wl: ACCOUNT_SETTINGS_DEFAULTS.wl,
  planner: { ...ACCOUNT_SETTINGS_DEFAULTS.planner },
}

/** Last known per account, so coming back to the page shows them at once. */
const known = new Map<number, PlannerOptions>()

const pick = (s: AccountSettings): PlannerOptions => ({
  ar: s.ar,
  wl: s.wl,
  planner: { ...s.planner },
})

const merge = (base: PlannerOptions, patch: PlannerOptionsPatch): PlannerOptions => ({
  ar: patch.ar === undefined ? base.ar : patch.ar,
  wl: patch.wl === undefined ? base.wl : patch.wl,
  planner: { ...base.planner, ...patch.planner },
})

/**
 * The account's planner settings (account settings `ar`, `wl`, `planner`).
 * `save` shows a change at once and sends it; changes go one at a time, and a
 * refused one says so and reloads what the server has.
 */
export function usePlannerSettings(accountId: Ref<number>) {
  const feedback = useFeedback()
  const settings = shallowRef<PlannerOptions>(known.get(accountId.value) ?? DEFAULTS)
  let queue: Promise<unknown> = Promise.resolve()

  async function load(id: number) {
    try {
      const response = await api.accountSettings(id)
      known.set(id, pick(response.settings))
      if (accountId.value === id) settings.value = known.get(id)!
    } catch {
      // Defaults stay; nothing on the page depends on these yet.
    }
  }

  watch(
    accountId,
    (id) => {
      settings.value = known.get(id) ?? DEFAULTS
      void load(id)
    },
    { immediate: true },
  )

  function save(patch: PlannerOptionsPatch): Promise<void> {
    const id = accountId.value
    const next = merge(known.get(id) ?? settings.value, patch)
    known.set(id, next)
    if (accountId.value === id) settings.value = next
    const body: AccountSettingsPatch = { ...patch }
    const run = queue.then(async () => {
      try {
        const response = await api.updateAccountSettings(id, body)
        // Only when nothing newer is waiting: a later change is already on screen.
        if (queue === run) {
          known.set(id, pick(response.settings))
          if (accountId.value === id) settings.value = known.get(id)!
        }
      } catch (cause) {
        feedback.error('Not saved', cause)
        await load(id)
      }
    })
    queue = run
    return run
  }

  return { settings, save }
}
