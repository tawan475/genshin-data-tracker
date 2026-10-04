<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ItemDisplay from '@/components/legacy/ItemDisplay.vue'
import MoraDisplay from '@/components/legacy/MoraDisplay.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { loadMaterialsHistory } from '@/data/materials'
import { capturedMonths, monthlyAnalysis, type CalendarMonth } from '@/data/monthly-analysis'
import { monthLabel } from '@/data/overview'
import { useResource } from '@/data/use-resource'
import { useAccount } from '@/views/account/context'

/**
 * The original tracker's Monthly Analysis table, unchanged, in a panel with
 * the new month controls. Opens on the newest month with captures; months
 * step one at a time between the first and the newest captured month.
 * `snapshots` is undefined while they load.
 */
const props = defineProps<{ snapshots: SnapshotResponse[] | undefined }>()

const account = useAccount()

// Extraction counts come from the materials history (decoded in the browser).
const {
  data: materialsData,
  error: materialsError,
  reload: reloadMaterials,
} = useResource(
  () => account.value,
  async (a) => ({ accountId: a.id, history: a.latest ? await loadMaterialsHistory(a) : null }),
)
/** Undefined while loading and while switching accounts. */
const materials = computed(() => {
  const value = materialsData.value
  return value && value.accountId === account.value.id ? value : undefined
})

const months = computed(() => (props.snapshots ? capturedMonths(props.snapshots) : []))
const firstMonth = computed(() => months.value[0] ?? null)
const latestMonth = computed(() => months.value[months.value.length - 1] ?? null)

function order(m: CalendarMonth): number {
  return m.year * 12 + m.month - 1
}

function label(m: CalendarMonth): string {
  return monthLabel({ year: m.year, month: m.month - 1 })
}

function shift(m: CalendarMonth, by: number): CalendarMonth {
  const d = new Date(m.year, m.month - 1 + by, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

// Opens on the newest captured month (the current month is often empty);
// stays where the user put it unless new data moves the bounds past it.
const selected = ref<CalendarMonth | null>(null)
watch(
  [firstMonth, latestMonth],
  ([first, latest]) => {
    if (!first || !latest) {
      selected.value = null
      return
    }
    const current = selected.value
    if (!current || order(current) < order(first) || order(current) > order(latest)) {
      selected.value = latest
    }
  },
  { immediate: true },
)

const canPrev = computed(
  () => !!selected.value && !!firstMonth.value && order(selected.value) > order(firstMonth.value),
)
const canNext = computed(
  () => !!selected.value && !!latestMonth.value && order(selected.value) < order(latestMonth.value),
)
const prevLabel = computed(() =>
  selected.value ? `Previous month, ${label(shift(selected.value, -1))}` : 'Previous month',
)
const nextLabel = computed(() =>
  selected.value ? `Next month, ${label(shift(selected.value, 1))}` : 'Next month',
)

const prevMonth = () => {
  if (selected.value && canPrev.value) selected.value = shift(selected.value, -1)
}

const nextMonth = () => {
  if (selected.value && canNext.value) selected.value = shift(selected.value, 1)
}

const monthlyAnalysisData = computed(() => {
  const month = selected.value
  const loaded = materials.value
  if (!month || !props.snapshots || !loaded) return null
  if (!loaded.history) return { month: month.month, year: month.year, rows: [] }
  return monthlyAnalysis(props.snapshots, loaded.history, month.year, month.month)
})

/** On a month without captures: the nearest earlier captured month and the newest one. */
const jumps = computed(() => {
  const current = selected.value
  if (!current) return []
  const at = order(current)
  let earlier: CalendarMonth | undefined
  for (const m of months.value) if (order(m) < at) earlier = m
  const latest = latestMonth.value
  const list: { key: string; month: CalendarMonth; label: string; direction: 'prev' | 'next' }[] =
    []
  if (earlier) {
    list.push({ key: 'prev', month: earlier, label: label(earlier), direction: 'prev' })
  }
  if (latest && order(latest) > at) {
    list.push({ key: 'next', month: latest, label: label(latest), direction: 'next' })
  }
  return list
})
</script>

<template>
  <UiPanel title="Monthly analysis">
    <template v-if="selected" #actions>
      <div class="flex items-center gap-1">
        <UiIconButton
          :label="prevLabel"
          :disabled="!canPrev"
          class="disabled:pointer-events-none disabled:opacity-40"
          @click="prevMonth"
        >
          <ChevronLeft class="size-5" aria-hidden="true" />
        </UiIconButton>
        <span class="min-w-32 text-center font-medium" aria-live="polite">{{
          label(selected)
        }}</span>
        <UiIconButton
          :label="nextLabel"
          :disabled="!canNext"
          class="disabled:pointer-events-none disabled:opacity-40"
          @click="nextMonth"
        >
          <ChevronRight class="size-5" aria-hidden="true" />
        </UiIconButton>
      </div>
    </template>

    <UiError
      v-if="materialsError && !materials"
      title="Monthly analysis unavailable"
      :error="materialsError"
      @retry="reloadMaterials"
    />
    <div v-else-if="!monthlyAnalysisData" class="flex justify-center p-8" role="status">
      <span class="sr-only">Loading monthly analysis</span>
      <UiSpinner class="size-6 text-text-muted" />
    </div>
    <div
      v-else-if="monthlyAnalysisData.rows.length === 0"
      class="flex flex-col items-center gap-3 py-8 text-center"
    >
      <p class="text-text-secondary">No captures</p>
      <div v-if="jumps.length" class="flex flex-wrap justify-center gap-2">
        <UiButton
          v-for="jump in jumps"
          :key="jump.key"
          size="sm"
          :title="`Go to ${jump.label}`"
          @click="selected = jump.month"
        >
          <ChevronLeft v-if="jump.direction === 'prev'" class="size-4" aria-hidden="true" />
          {{ jump.label }}
          <ChevronRight v-if="jump.direction === 'next'" class="size-4" aria-hidden="true" />
        </UiButton>
      </div>
    </div>
    <div v-else class="overflow-x-auto">
      <!-- [&_img]:max-w-none: preflight's img max-width:100% makes the item icons count as
           zero width when the table sizes its columns, so the diffs overlapped them.
           Cells use px-3 (the original px-4) so the table still fits a 1440px screen. -->
      <table class="w-full text-sm text-left border-collapse [&_img]:max-w-none">
        <thead>
          <tr
            class="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 transition-colors"
          >
            <th
              class="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              Date
            </th>
            <th
              class="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              Primogem
            </th>
            <th
              class="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              Mora
            </th>
            <th
              class="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              Artifact
            </th>
            <th
              class="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              Extract
            </th>
            <th
              class="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              Net Worth
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50 transition-colors">
          <tr
            v-for="row in monthlyAnalysisData.rows"
            :key="row.date"
            class="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <td
              class="px-3 py-3 font-medium text-slate-900 dark:text-slate-100 align-top whitespace-nowrap transition-colors"
            >
              {{ row.date }}
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5">
                <ItemDisplay
                  :amount="row.primogem.total"
                  name="primogem"
                  image="/img/Item_Primogem.webp"
                  class="font-semibold text-sky-600 dark:text-sky-400 transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="
                    row.primogem.diff >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  "
                >
                  &nbsp;({{ row.primogem.diff >= 0 ? '+' : ''
                  }}{{ row.primogem.diff.toLocaleString() }})
                </span>
              </div>
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5">
                <MoraDisplay
                  :amount="row.mora.total"
                  class="font-semibold text-amber-700 dark:text-amber-500 transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="
                    row.mora.diff >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  "
                >
                  &nbsp;({{ row.mora.diff >= 0 ? '+' : '' }}{{ row.mora.diff.toLocaleString()
                  }}<span class="sr-only">&nbsp;mora</span>)
                </span>
              </div>
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5 mb-1.5">
                <MoraDisplay
                  :amount="row.artifact.totalWorth"
                  class="font-semibold text-slate-900 dark:text-white transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="
                    row.artifact.diffWorth >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  "
                >
                  &nbsp;({{ row.artifact.diffWorth >= 0 ? '+' : ''
                  }}{{ row.artifact.diffWorth.toLocaleString()
                  }}<span class="sr-only">&nbsp;mora</span>)
                </span>
              </div>

              <div
                class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors"
              >
                <span class="flex items-center">
                  <span
                    class="text-purple-600 dark:text-purple-400 font-medium inline-flex items-center transition-colors"
                    >{{ row.artifact.total4 }}x 4⭐</span
                  >,
                  <span
                    class="text-blue-600 dark:text-blue-400 font-medium inline-flex items-center ml-1 transition-colors"
                    >{{ row.artifact.total3 }}x 3⭐</span
                  >
                </span>
                <span class="flex items-center">
                  (
                  <span
                    class="inline-flex items-center transition-colors"
                    :class="
                      row.artifact.diff4 >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    "
                  >
                    {{ row.artifact.diff4 >= 0 ? '+' : '' }}{{ row.artifact.diff4 }}x 4⭐ </span
                  >,
                  <span
                    class="inline-flex items-center ml-1 transition-colors"
                    :class="
                      row.artifact.diff3 >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    "
                  >
                    {{ row.artifact.diff3 >= 0 ? '+' : '' }}{{ row.artifact.diff3 }}x 3⭐
                  </span>
                  )
                </span>
              </div>
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5 mb-1.5">
                <span class="font-semibold text-slate-900 dark:text-white transition-colors">{{
                  row.extract.totalExp.toLocaleString()
                }}</span>
                <span
                  class="text-xs font-medium transition-colors"
                  :class="
                    row.extract.diffExp >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  "
                >
                  ({{ row.extract.diffExp >= 0 ? '+' : ''
                  }}{{ row.extract.diffExp.toLocaleString() }})
                </span>
              </div>

              <div
                class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors"
              >
                <span class="flex items-center gap-1">
                  <ItemDisplay
                    :amount="row.extract.total4"
                    image="/img/Item_Sanctifying_Essence.webp"
                    name="Sanctifying Essence"
                    class="text-purple-600 dark:text-purple-400 font-medium transition-colors"
                  />,
                  <ItemDisplay
                    :amount="row.extract.total3"
                    image="/img/Item_Sanctifying_Unction.webp"
                    name="Sanctifying Unction"
                    class="text-blue-600 dark:text-blue-400 font-medium transition-colors"
                  />
                </span>
                <span class="flex items-center gap-1">
                  (
                  <ItemDisplay
                    :amount="(row.extract.diff4 >= 0 ? '+' : '') + row.extract.diff4"
                    image="/img/Item_Sanctifying_Essence.webp"
                    name="Sanctifying Essence"
                    :class="
                      row.extract.diff4 >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    "
                    class="transition-colors"
                  />,
                  <ItemDisplay
                    :amount="(row.extract.diff3 >= 0 ? '+' : '') + row.extract.diff3"
                    image="/img/Item_Sanctifying_Unction.webp"
                    name="Sanctifying Unction"
                    :class="
                      row.extract.diff3 >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    "
                    class="transition-colors"
                  />
                  )
                </span>
              </div>
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5">
                <MoraDisplay
                  :amount="row.mora.total + row.artifact.totalWorth"
                  class="font-semibold text-emerald-700 dark:text-emerald-500 transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="
                    row.mora.diff + row.artifact.diffWorth >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  "
                >
                  &nbsp;({{ row.mora.diff + row.artifact.diffWorth >= 0 ? '+' : ''
                  }}{{ (row.mora.diff + row.artifact.diffWorth).toLocaleString()
                  }}<span class="sr-only">&nbsp;mora</span>)
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UiPanel>
</template>
