import {
  MATERIALS_GRAPH_DEFAULTS,
  type MaterialsGraphSettings,
  type TimelineGroupBy,
} from '@gdt/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/api'
import { useFeedback } from '@/stores/feedback'

/** The original "N periods" choices. */
export const LIMIT_OPTIONS = [90, 180, 365] as const

/**
 * The materials page once stored a range in days here (30, 90, 365 or
 * 10,000 for "all"); show any stored value as the nearest period choice.
 */
export function toPeriods(limit: number): number {
  if (limit <= 90) return 90
  if (limit <= 180) return 180
  return 365
}

const SAVE_DELAY_MS = 800

const defaults = (): MaterialsGraphSettings => ({
  ...MATERIALS_GRAPH_DEFAULTS,
  selectedKeys: [],
})

/**
 * The account's `materialsGraph` settings, as the original page used them:
 * no materials selected by default, group by day, 365 periods. Loaded from
 * the server, changed locally at once and saved in the background after a
 * short pause; pending changes are flushed when the account changes or the
 * page closes.
 */
export function useMaterialHistorySettings(accountId: () => number) {
  const feedback = useFeedback()
  const settings = ref<MaterialsGraphSettings>(defaults())
  /** True once the saved settings are in (or could not be loaded). */
  const ready = ref(false)

  let pending: Partial<MaterialsGraphSettings> = {}
  let pendingFor: number | null = null
  let touchedFor: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load(id: number) {
    ready.value = false
    try {
      const { settings: saved } = await api.accountSettings(id)
      // Ignore a late answer for another account, or one the user already overrode.
      if (id !== accountId() || touchedFor === id) return
      settings.value = { ...defaults(), ...saved.materialsGraph }
    } catch {
      // Defaults stay on screen; saving still works.
    } finally {
      if (id === accountId()) ready.value = true
    }
  }

  async function flush() {
    clearTimeout(timer)
    if (pendingFor === null) return
    const id = pendingFor
    const body = pending
    pending = {}
    pendingFor = null
    try {
      await api.updateAccountSettings(id, { materialsGraph: body })
    } catch (error) {
      feedback.error('Could not save the chart settings', error)
    }
  }

  function patch(partial: Partial<MaterialsGraphSettings>) {
    const id = accountId()
    if (pendingFor !== null && pendingFor !== id) void flush()
    settings.value = { ...settings.value, ...partial }
    pending = { ...pending, ...partial }
    pendingFor = id
    touchedFor = id
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  watch(
    accountId,
    (id) => {
      void flush()
      touchedFor = null
      settings.value = defaults()
      void load(id)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => void flush())

  return {
    ready,
    selectedKeys: computed(() => settings.value.selectedKeys),
    groupBy: computed<TimelineGroupBy>(() => settings.value.groupBy),
    limit: computed(() => toPeriods(settings.value.limit)),
    patch,
  }
}
