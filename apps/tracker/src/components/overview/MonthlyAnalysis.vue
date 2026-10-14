<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'
import {
  ARTIFACT_LEVEL0_EXP,
  compareMonths,
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
 * Day-by-day movement of primogems, mora and 4★/3★ artifacts for one month,
 * computed in the browser from snapshot summaries (the last capture of each
 * day).
 */
const props = defineProps<{ days: DayClose[] }>()

/** How each column's gains and losses read ("gained 1,600" / "used 12"). */
const VERBS: Record<MonthlyKey, { up: 'gained' | 'added'; down: 'spent' | 'used' }> = {
  primogem: { up: 'gained', down: 'spent' },
  mora: { up: 'gained', down: 'spent' },
  artifact4: { up: 'added', down: 'used' },
  artifact3: { up: 'added', down: 'used' },
}
const columnLabel = (key: MonthlyKey) => t(`overview.figure.${key}`)

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
  month.value
    ? t('overview.monthly.previousTo', { month: monthLabel(shiftMonth(month.value, -1)) })
    : t('overview.monthly.previous'),
)
const nextLabel = computed(() =>
  month.value
    ? t('overview.monthly.nextTo', { month: monthLabel(shiftMonth(month.value, 1)) })
    : t('overview.monthly.next'),
)

function go(by: number) {
  if (month.value) month.value = shiftMonth(month.value, by)
}

const analysis = computed(() => (month.value ? monthlyAnalysis(props.days, month.value) : null))

const columns = computed(() => MONTHLY_KEYS.map((key) => ({ key, label: columnLabel(key) })))

// Display strings are prepared here so the template only reads them. Newest
// day first (the user's call); each day's change is still against the day before.
const rows = computed(() =>
  [...monthRows(analysis.value?.days ?? [])].reverse().map((row) => {
    if (row.kind === 'gap') {
      return {
        key: row.key,
        label: `${row.from} – ${row.to}`,
        note: '',
        title: t('overview.monthly.gapTitle', { n: formatNumber(row.count) }),
        cells: null,
      }
    }
    const { day } = row
    const figures = day.figures
    const captures = t('overview.monthly.captures', { n: formatNumber(day.captures) }, day.captures)
    return {
      key: day.key,
      label: day.label,
      note: day.since ? t('overview.monthly.vs', { day: day.since }) : '',
      title: figures
        ? day.since
          ? t('overview.monthly.comparedWith', { captures, day: day.since })
          : captures
        : t('overview.monthly.noCaptures'),
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
    const total = a.totals[key]
    const verbs = VERBS[key]
    const detail = [
      t(`overview.monthly.${verbs.up}`, { n: formatNumber(total.gained) }),
      t(`overview.monthly.${verbs.down}`, { n: formatNumber(total.spent) }),
    ]
    if (total.closing !== null) {
      detail.push(t('overview.monthly.closing', { n: formatNumber(total.closing) }))
    }
    if ((key === 'artifact4' || key === 'artifact3') && total.net !== null) {
      detail.push(
        t('overview.monthly.artifactExp', {
          n: formatSignedExact(total.net * ARTIFACT_LEVEL0_EXP[key]),
        }),
      )
    }
    return {
      key,
      label: columnLabel(key),
      net: total.net,
      hint: t('overview.monthly.thisMonth', { detail: detail.join(' · ') }),
    }
  })
})
</script>

<template>
  <UiPanel :title="$t('overview.monthly.title')">
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
        {{ $t('overview.monthly.noCaptures') }}
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
              <ChangeValue :value="total.net" exact :hint="total.hint" />
            </dd>
          </div>
        </dl>

        <div class="-mx-5 mt-5 overflow-x-auto border-t border-border-subtle">
          <table class="w-full border-collapse text-left">
            <caption class="sr-only">
              {{
                $t('overview.monthly.caption', { month: analysis.label })
              }}
            </caption>
            <thead>
              <tr class="border-b border-border-default">
                <th
                  scope="col"
                  class="sticky left-0 bg-surface-raised px-5 py-3 text-sm font-medium text-text-secondary"
                  :title="$t('overview.monthly.dayTitle')"
                >
                  {{ $t('overview.monthly.day') }}
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
                    <span class="sr-only">{{ $t('overview.monthly.noCapture') }}</span>
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
