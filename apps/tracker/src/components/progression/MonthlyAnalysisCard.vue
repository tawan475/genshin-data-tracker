<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/legacy/BaseButton.vue'
import ItemDisplay from '@/components/legacy/ItemDisplay.vue'
import MoraDisplay from '@/components/legacy/MoraDisplay.vue'
import { loadSnapshots } from '@/data/account-data'
import { loadMaterialsHistory } from '@/data/materials'
import { monthlyAnalysis } from '@/data/monthly-analysis'
import { useResource } from '@/data/use-resource'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from '@/views/account/context'

const account = useAccount()
const feedback = useFeedback()

const source = useResource(
  () => account.value,
  async (a) => {
    if (!a.latest) return { accountId: a.id, snapshots: [], materials: null }
    const [snapshots, materials] = await Promise.all([loadSnapshots(a), loadMaterialsHistory(a)])
    return { accountId: a.id, snapshots, materials }
  },
)
watch(source.error, (error) => {
  if (error) feedback.error('Could not load monthly analysis', error)
})

/** Spinner on first load and while switching accounts, not on a refresh. */
const isFetchingMonthly = computed(
  () =>
    source.loading.value &&
    (!source.data.value || source.data.value.accountId !== account.value.id),
)

const now = new Date()
const analysisMonth = ref(now.getMonth() + 1)
const analysisYear = ref(now.getFullYear())

const monthlyAnalysisData = computed(() => {
  const data = source.data.value
  if (!data) return null
  if (!data.materials) return { month: analysisMonth.value, year: analysisYear.value, rows: [] }
  return monthlyAnalysis(data.snapshots, data.materials, analysisYear.value, analysisMonth.value)
})

const prevMonth = () => {
  if (analysisMonth.value === 1) {
    analysisMonth.value = 12
    analysisYear.value -= 1
  } else {
    analysisMonth.value -= 1
  }
}

const nextMonth = () => {
  if (analysisMonth.value === 12) {
    analysisMonth.value = 1
    analysisYear.value += 1
  } else {
    analysisMonth.value += 1
  }
}
</script>

<template>
  <!-- Monthly Analysis Table -->
  <div
    class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 relative z-10 mt-8 transition-colors"
  >
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <h3
        class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors"
      >
        Monthly Analysis
        <span
          v-if="monthlyAnalysisData"
          class="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-400 px-2 py-1 rounded transition-colors"
        >
          {{ String(monthlyAnalysisData.month).padStart(2, '0') }} / {{ monthlyAnalysisData.year }}
        </span>
      </h3>

      <div class="flex items-center gap-2">
        <BaseButton
          variant="secondary"
          size="xs"
          class="!p-1.5"
          aria-label="Previous month"
          @click="prevMonth"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            ></path>
          </svg>
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="xs"
          class="!p-1.5"
          aria-label="Next month"
          @click="nextMonth"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            ></path>
          </svg>
        </BaseButton>
      </div>
    </div>

    <div v-if="isFetchingMonthly" class="flex justify-center p-8">
      <span
        class="w-6 h-6 border-3 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"
      ></span>
    </div>
    <div
      v-else-if="!monthlyAnalysisData || monthlyAnalysisData.rows.length === 0"
      class="text-center py-8 text-slate-400 dark:text-slate-500 transition-colors"
    >
      No data for this month.
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
  </div>
</template>
