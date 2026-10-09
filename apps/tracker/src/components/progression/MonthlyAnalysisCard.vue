<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { CalendarX, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ItemDisplay from '@/components/legacy/ItemDisplay.vue'
import MoraDisplay from '@/components/legacy/MoraDisplay.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { loadMaterialsHistory } from '@/data/materials'
import { materialIcon } from '@/lib/assets'
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

/** The month's days, newest first (each day's change is still against the day before). */
const newestFirst = computed(() => [...(monthlyAnalysisData.value?.rows ?? [])].reverse())
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
    <UiEmpty v-else-if="monthlyAnalysisData.rows.length === 0" title="No captures">
      <template #icon><CalendarX aria-hidden="true" /></template>
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
    </UiEmpty>
    <!-- Wider than a phone (and than the panel at 1366px): it scrolls, the clipped edge fades. -->
    <div v-else class="scroll-fade-x -mx-5 overflow-x-auto px-5">
      <!-- [&_img]:max-w-none: preflight's img max-width:100% makes the item icons count as
           zero width when the table sizes its columns, so the diffs overlapped them.
           Cells use px-3 (the original px-4) so the table still fits a 1440px screen. -->
      <table class="w-full text-sm text-left border-collapse [&_img]:max-w-none">
        <thead>
          <tr class="border-b border-border-default bg-surface-overlay/50 transition-colors">
            <th
              class="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap transition-colors"
            >
              Date
            </th>
            <th
              class="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap transition-colors"
            >
              Primogem
            </th>
            <th
              class="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap transition-colors"
            >
              Mora
            </th>
            <th
              class="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap transition-colors"
            >
              Artifact
            </th>
            <th
              class="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap transition-colors"
            >
              Extract
            </th>
            <th
              class="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap transition-colors"
            >
              Net Worth
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle transition-colors">
          <tr
            v-for="row in newestFirst"
            :key="row.date"
            class="hover:bg-surface-overlay/60 transition-colors"
          >
            <td
              class="px-3 py-3 font-medium text-text-primary align-top whitespace-nowrap transition-colors"
            >
              {{ row.date }}
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5">
                <ItemDisplay
                  :amount="row.primogem.total"
                  name="primogem"
                  :image="materialIcon('Primogem')"
                  class="font-semibold text-hydro transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="row.primogem.diff >= 0 ? 'text-success-text' : 'text-danger-text'"
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
                  class="font-semibold text-rarity-5 transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="row.mora.diff >= 0 ? 'text-success-text' : 'text-danger-text'"
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
                  class="font-semibold text-text-primary transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="row.artifact.diffWorth >= 0 ? 'text-success-text' : 'text-danger-text'"
                >
                  &nbsp;({{ row.artifact.diffWorth >= 0 ? '+' : ''
                  }}{{ row.artifact.diffWorth.toLocaleString()
                  }}<span class="sr-only">&nbsp;mora</span>)
                </span>
              </div>

              <div class="text-xs text-text-secondary flex items-center gap-1.5 transition-colors">
                <span class="flex items-center">
                  <span class="text-rarity-4 font-medium inline-flex items-center transition-colors"
                    >{{ row.artifact.total4 }}x 4★</span
                  >,
                  <span
                    class="text-rarity-3 font-medium inline-flex items-center ml-1 transition-colors"
                    >{{ row.artifact.total3 }}x 3★</span
                  >
                </span>
                <span class="flex items-center">
                  (
                  <span
                    class="inline-flex items-center transition-colors"
                    :class="row.artifact.diff4 >= 0 ? 'text-success-text' : 'text-danger-text'"
                  >
                    {{ row.artifact.diff4 >= 0 ? '+' : '' }}{{ row.artifact.diff4 }}x 4★ </span
                  >,
                  <span
                    class="inline-flex items-center ml-1 transition-colors"
                    :class="row.artifact.diff3 >= 0 ? 'text-success-text' : 'text-danger-text'"
                  >
                    {{ row.artifact.diff3 >= 0 ? '+' : '' }}{{ row.artifact.diff3 }}x 3★
                  </span>
                  )
                </span>
              </div>
            </td>

            <td class="px-3 py-3 align-top whitespace-nowrap">
              <div class="flex items-center gap-1.5 mb-1.5">
                <span class="font-semibold text-text-primary transition-colors">{{
                  row.extract.totalExp.toLocaleString()
                }}</span>
                <span
                  class="text-xs font-medium transition-colors"
                  :class="row.extract.diffExp >= 0 ? 'text-success-text' : 'text-danger-text'"
                >
                  ({{ row.extract.diffExp >= 0 ? '+' : ''
                  }}{{ row.extract.diffExp.toLocaleString() }})
                </span>
              </div>

              <div class="text-xs text-text-secondary flex items-center gap-1.5 transition-colors">
                <span class="flex items-center gap-1">
                  <ItemDisplay
                    :amount="row.extract.total4"
                    :image="materialIcon('SanctifyingEssence')"
                    name="Sanctifying Essence"
                    class="text-rarity-4 font-medium transition-colors"
                  />,
                  <ItemDisplay
                    :amount="row.extract.total3"
                    :image="materialIcon('SanctifyingUnction')"
                    name="Sanctifying Unction"
                    class="text-rarity-3 font-medium transition-colors"
                  />
                </span>
                <span class="flex items-center gap-1">
                  (
                  <ItemDisplay
                    :amount="(row.extract.diff4 >= 0 ? '+' : '') + row.extract.diff4"
                    :image="materialIcon('SanctifyingEssence')"
                    name="Sanctifying Essence"
                    :class="row.extract.diff4 >= 0 ? 'text-success-text' : 'text-danger-text'"
                    class="transition-colors"
                  />,
                  <ItemDisplay
                    :amount="(row.extract.diff3 >= 0 ? '+' : '') + row.extract.diff3"
                    :image="materialIcon('SanctifyingUnction')"
                    name="Sanctifying Unction"
                    :class="row.extract.diff3 >= 0 ? 'text-success-text' : 'text-danger-text'"
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
                  class="font-semibold text-success-text transition-colors"
                />
                <span
                  class="text-xs font-medium transition-colors"
                  :class="
                    row.mora.diff + row.artifact.diffWorth >= 0
                      ? 'text-success-text'
                      : 'text-danger-text'
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
