<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatNumber } from '@/lib/format'
import {
  compareMonths,
  FODDER_EXP,
  formatSignedExact,
  monthLabel,
  monthlyAnalysis,
  monthOf,
  monthRows,
  MONTHLY_KEYS,
  shiftMonth,
  type DayClose,
  type MonthlyKey,
  type MonthRef,
} from '@/data/overview'
import ChangeValue from './ChangeValue.vue'

/**
 * Day-by-day movement of primogems, mora and fodder for one month, computed
 * in the browser from snapshot summaries (the last capture of each day).
 */
const props = defineProps<{ days: DayClose[] }>()

const COLUMNS: Record<MonthlyKey, { label: string; up: string; down: string }> = {
  primogem: { label: 'Primogems', up: 'gained', down: 'spent' },
  mora: { label: 'Mora', up: 'gained', down: 'spent' },
  fodder4: { label: '4★ Artifact', up: 'added', down: 'used' },
  fodder3: { label: '3★ Artifact', up: 'added', down: 'used' },
}

const firstMonth = computed(() => {
  const first = props.days[0]
  return first ? monthOf(first.at) : null
})
const lastMonth = computed(() => {
  const last = props.days[props.days.length - 1]
  return last ? monthOf(last.at) : null
})

// Opens on the month of the newest capture; stays where the user put it
// unless new data moves the bounds past it.
const month = ref<MonthRef | null>(null)
watch(
  [firstMonth, lastMonth],
  ([first, last]) => {
    if (!first || !last) {
      month.value = null
      return
    }
    const current = month.value
    if (!current || compareMonths(current, first) < 0 || compareMonths(current, last) > 0) {
      month.value = last
    }
  },
  { immediate: true },
)

const canPrev = computed(
  () => !!month.value && !!firstMonth.value && compareMonths(month.value, firstMonth.value) > 0,
)
const canNext = computed(
  () => !!month.value && !!lastMonth.value && compareMonths(month.value, lastMonth.value) < 0,
)
const prevLabel = computed(() =>
  month.value ? `Previous month, ${monthLabel(shiftMonth(month.value, -1))}` : 'Previous month',
)
const nextLabel = computed(() =>
  month.value ? `Next month, ${monthLabel(shiftMonth(month.value, 1))}` : 'Next month',
)

function go(by: number) {
  if (month.value) month.value = shiftMonth(month.value, by)
}

const analysis = computed(() => (month.value ? monthlyAnalysis(props.days, month.value) : null))

const columns = MONTHLY_KEYS.map((key) => ({ key, label: COLUMNS[key].label }))

// Display strings are prepared here so the template only reads them.
const rows = computed(() =>
  monthRows(analysis.value?.days ?? []).map((row) => {
    if (row.kind === 'gap') {
      return {
        key: row.key,
        label: `${row.from} – ${row.to}`,
        note: '',
        title: `No captures for ${row.count} days`,
        cells: null,
      }
    }
    const { day } = row
    const figures = day.figures
    return {
      key: day.key,
      label: day.label,
      note: day.since ? `vs ${day.since}` : '',
      title: figures
        ? `${day.captures} ${day.captures === 1 ? 'capture' : 'captures'}${
            day.since ? `, compared with ${day.since}` : ''
          }`
        : 'No captures',
      cells: figures
        ? MONTHLY_KEYS.map((key) => ({
            key,
            change: figures[key].change,
            total: formatNumber(figures[key].total),
          }))
        : null,
    }
  }),
)

const totals = computed(() => {
  const a = analysis.value
  if (!a) return []
  return MONTHLY_KEYS.map((key) => {
    const t = a.totals[key]
    const c = COLUMNS[key]
    const detail = [`${c.up} ${formatNumber(t.gained)}`, `${c.down} ${formatNumber(t.spent)}`]
    if (t.closing !== null) detail.push(`closing ${formatNumber(t.closing)}`)
    if ((key === 'fodder4' || key === 'fodder3') && t.net !== null) {
      detail.push(`${formatSignedExact(t.net * FODDER_EXP[key])} artifact EXP at level 0`)
    }
    return { key, label: c.label, net: t.net, detail: detail.join(' · ') }
  })
})
</script>

<template>
  <UiPanel title="Monthly analysis">
    <template v-if="analysis" #actions>
      <div class="flex items-center gap-1">
        <UiIconButton
          :label="prevLabel"
          :disabled="!canPrev"
          class="disabled:opacity-40"
          @click="go(-1)"
        >
          <ChevronLeft class="size-5" aria-hidden="true" />
        </UiIconButton>
        <span class="min-w-32 text-center font-medium" aria-live="polite">{{
          analysis.label
        }}</span>
        <UiIconButton
          :label="nextLabel"
          :disabled="!canNext"
          class="disabled:opacity-40"
          @click="go(1)"
        >
          <ChevronRight class="size-5" aria-hidden="true" />
        </UiIconButton>
      </div>
    </template>

    <template v-if="analysis">
      <p v-if="analysis.capturedDays === 0" class="py-6 text-center text-text-secondary">
        No captures
      </p>

      <template v-else>
        <dl class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div
            v-for="total in totals"
            :key="total.key"
            class="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border-subtle bg-surface-sunken p-3"
          >
            <dt class="text-sm text-text-secondary">{{ total.label }}</dt>
            <dd class="text-lg font-medium">
              <ChangeValue :value="total.net" exact :hint="`this month · ${total.detail}`" />
            </dd>
          </div>
        </dl>

        <div class="-mx-5 mt-5 overflow-x-auto border-t border-border-subtle">
          <table class="w-full border-collapse text-left">
            <caption class="sr-only">
              Daily change in
              {{
                analysis.label
              }}: each day's last capture against the previous captured day, with the value below
            </caption>
            <thead>
              <tr class="border-b border-border-default">
                <th
                  scope="col"
                  class="sticky left-0 bg-surface-raised px-5 py-3 text-sm font-medium text-text-secondary"
                  title="Last capture of the day vs the previous captured day, local time"
                >
                  Day
                </th>
                <th
                  v-for="column in columns"
                  :key="column.key"
                  scope="col"
                  class="px-4 py-3 text-right text-sm font-medium whitespace-nowrap text-text-secondary"
                >
                  {{ column.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.key"
                class="border-b border-border-subtle last:border-0"
              >
                <th
                  scope="row"
                  class="sticky left-0 bg-surface-raised px-5 py-2 text-left font-normal whitespace-nowrap"
                  :title="row.title"
                >
                  <span :class="row.cells ? 'text-text-primary' : 'text-text-muted'">{{
                    row.label
                  }}</span>
                  <span v-if="row.note" class="block text-sm text-text-muted">{{ row.note }}</span>
                </th>
                <template v-if="row.cells">
                  <td
                    v-for="cell in row.cells"
                    :key="cell.key"
                    class="px-4 py-2 text-right whitespace-nowrap"
                  >
                    <ChangeValue :value="cell.change" exact />
                    <span class="tabular block font-mono text-sm text-text-muted">{{
                      cell.total
                    }}</span>
                  </td>
                </template>
                <template v-else>
                  <td
                    v-for="column in columns"
                    :key="column.key"
                    class="px-4 py-2 text-right text-text-muted"
                  >
                    <span aria-hidden="true">—</span>
                    <span class="sr-only">No capture</span>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </UiPanel>
</template>
