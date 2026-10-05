import type { MaterialsGraphSettings, TimelineGroupBy } from '@gdt/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/api'
import { useFeedback } from '@/stores/feedback'

/** One colour token per series (--chart-1…6), so at most six on a chart. */
export const MAX_SERIES = 6
/** Shown when nothing has been saved for the account. */
export const DEFAULT_KEYS = ['Mora', 'Primogem']

export const GROUP_OPTIONS: { value: TimelineGroupBy; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const SAVE_DELAY_MS = 800

/**
 * The account's chart settings: loaded from the server, changed locally at
 * once (optimistic), saved in the background after a short pause. Pending
 * changes are flushed when the account changes or the page closes.
 *
 * The chart range is not here: like every history chart's, it is remembered
 * on the device (useChartRange). The server's `limit` (days) is left as
 * stored, for older clients; it cannot express hour ranges.
 */
export function useMaterialsGraph(accountId: () => number) {
  const feedback = useFeedback()
  const selectedKeys = ref<string[]>([...DEFAULT_KEYS])
  const group = ref<TimelineGroupBy>('day')
  /** True once the saved settings are in (or could not be loaded). */
  const ready = ref(false)

  let pending: Partial<MaterialsGraphSettings> = {}
  let pendingFor: number | null = null
  let touchedFor: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load(id: number) {
    ready.value = false
    try {
      const { settings } = await api.accountSettings(id)
      // Ignore a late answer for another account, or one the user already overrode.
      if (id !== accountId() || touchedFor === id) return
      const saved = settings.materialsGraph
      // The server fills in the default (Mora, Primogem); an empty list was cleared on purpose.
      selectedKeys.value = saved.selectedKeys.slice(0, MAX_SERIES)
      group.value = saved.groupBy
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

  function save(patch: Partial<MaterialsGraphSettings>) {
    const id = accountId()
    if (pendingFor !== null && pendingFor !== id) void flush()
    pending = { ...pending, ...patch }
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
      selectedKeys.value = [...DEFAULT_KEYS]
      group.value = 'day'
      void load(id)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => void flush())

  function setKeys(keys: string[]) {
    selectedKeys.value = keys
    save({ selectedKeys: keys })
  }

  return {
    selectedKeys: computed(() => selectedKeys.value),
    ready,
    groupBy: computed({
      get: () => group.value,
      set: (value: TimelineGroupBy) => {
        group.value = value
        save({ groupBy: value })
      },
    }),
    isSelected: (key: string) => selectedKeys.value.includes(key),
    canAdd: computed(() => selectedKeys.value.length < MAX_SERIES),
    toggle(key: string) {
      if (selectedKeys.value.includes(key)) setKeys(selectedKeys.value.filter((k) => k !== key))
      else if (selectedKeys.value.length < MAX_SERIES) setKeys([...selectedKeys.value, key])
    },
    remove(key: string) {
      setKeys(selectedKeys.value.filter((k) => k !== key))
    },
    reset() {
      setKeys([...DEFAULT_KEYS])
    },
  }
}

export type MaterialsGraph = ReturnType<typeof useMaterialsGraph>
