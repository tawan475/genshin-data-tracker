<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Star } from 'lucide-vue-next'
import type { UigfGachaType } from '@gdt/shared'
import type { PullRow } from '@/data/wish-history'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiPager from '@/components/ui/UiPager.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatNumber } from '@/lib/format'
import {
  OUTCOME_LABEL,
  OUTCOME_TONE,
  RARITY_TEXT,
  outcomeTitle,
  wishIcon,
  wishMinute,
} from './wish-labels'

/** Every pull of a banner, newest first, a page at a time; chips narrow it to rarities. */
const props = defineProps<{ rows: readonly PullRow[]; banner: UigfGachaType }>()

const PAGE_SIZE = 50
const page = ref(1)
const ranks = reactive<Record<3 | 4 | 5, boolean>>({ 5: false, 4: false, 3: false })
const counts = computed(() => {
  const c = { 5: 0, 4: 0, 3: 0 } as Record<3 | 4 | 5, number>
  for (const row of props.rows) {
    const r = row.pull.item.rank
    if (r === 3 || r === 4 || r === 5) c[r]++
  }
  return c
})
const filtered = computed(() => {
  const any = ranks[5] || ranks[4] || ranks[3]
  return any ? props.rows.filter((r) => ranks[r.pull.item.rank as 3 | 4 | 5]) : props.rows
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([() => props.banner, ranks], () => (page.value = 1))
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})
</script>

<template>
  <UiPanel flush>
    <template #header>
      <h2 class="text-base font-semibold">All pulls</h2>
    </template>
    <template #actions>
      <div role="group" aria-label="Rarity" class="flex items-center gap-2">
        <FilterChip
          v-for="rank in [5, 4, 3] as const"
          :key="rank"
          :pressed="ranks[rank]"
          :count="counts[rank]"
          @toggle="ranks[rank] = !ranks[rank]"
        >
          <Star class="size-3.5 fill-current" :class="RARITY_TEXT[rank]" aria-hidden="true" />
          <span>{{ rank }}</span>
          <span class="sr-only">star</span>
        </FilterChip>
      </div>
    </template>

    <table class="w-full text-sm">
      <thead class="sr-only sm:not-sr-only">
        <tr class="border-b border-border-default text-left text-xs text-text-muted">
          <th class="w-14 px-4 py-2 text-right font-medium">#</th>
          <th class="px-2 py-2 font-medium">Item</th>
          <th class="hidden px-2 py-2 font-medium sm:table-cell">Time</th>
          <th class="w-24 px-4 py-2 text-right font-medium">Pity</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-default">
        <tr v-for="row in shown" :key="row.pull.id.toString()">
          <td class="tabular w-14 px-4 py-1.5 text-right font-mono text-text-muted">
            {{ formatNumber(row.number) }}
          </td>
          <td class="px-2 py-1.5">
            <div class="flex min-w-0 items-center gap-2.5">
              <GameIcon
                :src="wishIcon(row.pull.item)"
                :name="row.pull.item.name"
                :rarity="row.pull.item.rank || undefined"
                size="xs"
              />
              <div class="flex min-w-0 flex-col">
                <span
                  class="truncate"
                  :class="[
                    RARITY_TEXT[row.pull.item.rank] ?? '',
                    row.pull.item.rank >= 4 ? 'font-medium' : '',
                  ]"
                  >{{ row.pull.item.name }}</span
                >
                <time class="tabular font-mono text-xs text-text-muted sm:hidden">{{
                  wishMinute(row.pull.time)
                }}</time>
              </div>
              <span
                v-if="row.pull.gachaType === 400"
                class="shrink-0 text-xs text-text-muted"
                title="Character Event Wish-2"
                >2</span
              >
            </div>
          </td>
          <td
            class="tabular hidden px-2 py-1.5 font-mono whitespace-nowrap text-text-secondary sm:table-cell"
          >
            {{ wishMinute(row.pull.time) }}
          </td>
          <td class="w-24 px-4 py-1.5 text-right">
            <span class="inline-flex items-center justify-end gap-2">
              <UiBadge
                v-if="row.outcome"
                :tone="OUTCOME_TONE[row.outcome]"
                :title="outcomeTitle(row.outcome, banner)"
                >{{ OUTCOME_LABEL[row.outcome][0] }}</UiBadge
              >
              <span
                v-if="row.pity"
                class="tabular font-mono font-medium"
                :class="RARITY_TEXT[row.pull.item.rank]"
                >{{ row.pity }}</span
              >
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="pageCount > 1" class="border-t border-border-default px-4 py-3">
      <UiPager
        v-model="page"
        :page-count="pageCount"
        :total="filtered.length"
        :page-size="PAGE_SIZE"
      />
    </div>
  </UiPanel>
</template>
