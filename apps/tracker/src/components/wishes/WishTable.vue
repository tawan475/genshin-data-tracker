<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, Star } from 'lucide-vue-next'
import type { UigfGachaType } from '@gdt/shared'
import type { PullRow } from '@/data/wish-history'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPager from '@/components/ui/UiPager.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import {
  OUTCOME_LABEL,
  OUTCOME_TONE,
  RARITY_TEXT,
  outcomeTitle,
  runName,
  wishIcon,
  wishMinute,
} from './wish-labels'

/**
 * Every pull of a banner, a page at a time (fast at 15,000 rows): search by
 * item, rarity chips (3★ off until asked for, remembered per device), time
 * order either way. Columns as paimon.moe's detail table: pull number,
 * time, item, type, pity, the 50/50 result and the banner it was on; 4★
 * and 5★ rows are tinted.
 */
const props = defineProps<{ rows: readonly PullRow[]; banner: UigfGachaType }>()

const PAGE_SIZE = 50
const page = ref(1)
const query = ref('')
const RANKS_KEY = 'wishes:ranks'
const stored = readStorage(RANKS_KEY) ?? '54'
const ranks = reactive<Record<3 | 4 | 5, boolean>>({
  5: stored.includes('5'),
  4: stored.includes('4'),
  3: stored.includes('3'),
})
watch(ranks, (r) =>
  writeStorage(RANKS_KEY, ([5, 4, 3] as const).filter((n) => r[n]).join('') || '-'),
)
const order = ref<'new' | 'old'>('new')
const ORDER = [
  { value: 'new' as const, label: 'Newest', icon: ArrowDownWideNarrow },
  { value: 'old' as const, label: 'Oldest', icon: ArrowUpNarrowWide },
]

const counts = computed(() => {
  const c = { 5: 0, 4: 0, 3: 0 } as Record<3 | 4 | 5, number>
  for (const row of props.rows) {
    const r = row.pull.item.rank
    if (r === 3 || r === 4 || r === 5) c[r]++
  }
  return c
})
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out = props.rows.filter(
    (r) =>
      (ranks[r.pull.item.rank as 3 | 4 | 5] ?? true) &&
      (!q || r.pull.item.name.toLowerCase().includes(q)),
  )
  return order.value === 'new' ? out : out.reverse()
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([() => props.banner, ranks, query, order], () => (page.value = 1))
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

const TINT: Record<number, string> = {
  5: 'bg-rarity-5/10',
  4: 'bg-rarity-4/8',
}
</script>

<template>
  <UiPanel flush>
    <template #header>
      <div class="flex w-full flex-wrap items-center gap-2">
        <label class="relative min-w-0 basis-full sm:max-w-64 sm:basis-auto sm:flex-1">
          <span class="sr-only">Search</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput
            v-model="query"
            type="search"
            class="pl-9"
            placeholder="Search"
            title="Character or weapon name"
            autocomplete="off"
          />
        </label>
        <div role="group" aria-label="Rarity" class="flex gap-2">
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
        <UiSegmented v-model="order" :options="ORDER" label="Order" icon-only class="sm:ml-auto" />
      </div>
    </template>

    <p v-if="filtered.length === 0" class="px-5 py-6 text-center text-sm text-text-muted">
      No pulls match
    </p>
    <table v-else class="w-full text-sm">
      <thead class="sr-only sm:not-sr-only">
        <tr class="border-b border-border-default text-left text-xs text-text-muted">
          <th class="w-16 px-4 py-2 text-right font-medium" title="Pull number on this banner">
            #
          </th>
          <th class="hidden px-2 py-2 font-medium sm:table-cell">Time</th>
          <th class="px-2 py-2 font-medium">Item</th>
          <th class="hidden px-2 py-2 font-medium md:table-cell">Type</th>
          <th class="hidden px-2 py-2 font-medium lg:table-cell">Banner</th>
          <th class="w-28 px-4 py-2 text-right font-medium">Pity</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-default">
        <tr
          v-for="row in shown"
          :key="row.pull.id.toString()"
          :class="TINT[row.pull.item.rank] ?? ''"
        >
          <td class="tabular w-16 px-4 py-1.5 text-right font-mono text-text-muted">
            {{ formatNumber(row.number) }}
          </td>
          <td
            class="tabular hidden px-2 py-1.5 font-mono whitespace-nowrap text-text-secondary sm:table-cell"
          >
            {{ wishMinute(row.pull.time) }}
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
            </div>
          </td>
          <td class="hidden px-2 py-1.5 text-text-secondary md:table-cell">
            {{ row.pull.item.kind === 'weapon' ? 'Weapon' : row.pull.item.kind ? 'Character' : '' }}
          </td>
          <td
            class="hidden max-w-48 truncate px-2 py-1.5 text-text-secondary lg:table-cell"
            :title="row.on ? `${runName(row)} · ${row.on.version}` : undefined"
          >
            {{ runName(row) }}
          </td>
          <td class="w-28 px-4 py-1.5 text-right">
            <span class="inline-flex items-center justify-end gap-2">
              <UiBadge
                v-if="row.outcome"
                :tone="OUTCOME_TONE[row.outcome]"
                :title="outcomeTitle(row.outcome, banner, row.pull.item.rank)"
                >{{ OUTCOME_LABEL[row.outcome] }}</UiBadge
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
