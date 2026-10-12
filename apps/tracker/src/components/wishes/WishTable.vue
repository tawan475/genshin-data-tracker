<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Search, Star } from 'lucide-vue-next'
import type { UigfGachaType } from '@gdt/shared'
import { HARD_PITY, runPullNumbers, type PullRow } from '@/data/wish-history'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPager from '@/components/ui/UiPager.vue'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import {
  OUTCOME_LABEL,
  RARITY_TEXT,
  outcomeTitle,
  pityColor,
  runName,
  wishIcon,
  wishMinute,
} from './wish-labels'

/**
 * Every pull of a banner as paimon.moe's detail table, a page at a time
 * (fast at 15,000 rows): time (click to flip the order), pity with the
 * 50/50 result as a star (filled: won, faded: guaranteed, hollow: lost),
 * the item, its rarity, its type, its number within the banner run and the
 * banner it was on. 4★ and 5★ rows carry their rarity's tint. Rarity chips
 * (3★ off until asked for) are remembered per device; search by name.
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
const newestFirst = ref(true)

const counts = computed(() => {
  const c = { 5: 0, 4: 0, 3: 0 } as Record<3 | 4 | 5, number>
  for (const row of props.rows) {
    const r = row.pull.item.rank
    if (r === 3 || r === 4 || r === 5) c[r]++
  }
  return c
})
const rolls = computed(() => runPullNumbers(props.rows))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out = props.rows.filter(
    (r) =>
      (ranks[r.pull.item.rank as 3 | 4 | 5] ?? true) &&
      (!q || r.pull.item.name.toLowerCase().includes(q)),
  )
  return newestFirst.value ? out : out.reverse()
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([() => props.banner, ranks, query, newestFirst], () => (page.value = 1))
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

/** paimon.moe's row tint: the rarity's colour glowing in from the left. */
const TINT: Record<number, string> = {
  5: 'bg-linear-to-r from-transparent via-rarity-5/20 via-15% to-transparent',
  4: 'bg-linear-to-r from-transparent via-rarity-4/15 via-15% to-transparent',
}
const rated = computed(() => props.banner === 301 || props.banner === 302)
/** A 5★ pity runs green to red as on paimon.moe; a 4★ one stays purple (10 is the norm). */
const pityStyle = (row: PullRow) =>
  row.pull.item.rank === 5 ? { color: pityColor(row.pity, HARD_PITY[props.banner][0]) } : undefined
const kind = (row: PullRow) =>
  row.pull.item.kind === 'weapon' ? 'Weapon' : row.pull.item.kind ? 'Character' : ''
</script>

<template>
  <section class="rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <div class="flex flex-wrap items-center gap-2 border-b border-border-default p-3">
      <div role="group" aria-label="Rarity" class="flex gap-2">
        <FilterChip
          v-for="rank in [5, 4, 3] as const"
          :key="rank"
          :pressed="ranks[rank]"
          :count="counts[rank]"
          @toggle="ranks[rank] = !ranks[rank]"
        >
          <span :class="RARITY_TEXT[rank]">{{ rank }}★</span>
        </FilterChip>
      </div>
      <label class="relative min-w-0 basis-full sm:ml-auto sm:w-52 sm:basis-auto">
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
    </div>

    <p v-if="filtered.length === 0" class="px-5 py-6 text-center text-sm text-text-muted">
      No pulls match
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-text-muted">
            <th class="hidden py-2 pr-2 pl-4 font-medium sm:table-cell">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-text-primary"
                :title="newestFirst ? 'Newest first' : 'Oldest first'"
                @click="newestFirst = !newestFirst"
              >
                Time
                <component
                  :is="newestFirst ? ArrowDown : ArrowUp"
                  class="size-3.5"
                  aria-hidden="true"
                />
                <span class="sr-only">{{ newestFirst ? 'newest first' : 'oldest first' }}</span>
              </button>
            </th>
            <th class="py-2 pr-2 pl-4 text-center font-medium sm:pl-2">Pity</th>
            <th class="px-2 py-2 font-medium">Name</th>
            <th class="hidden px-2 py-2 text-center font-medium md:table-cell">
              <Star class="inline size-3.5" aria-label="Rarity" />
            </th>
            <th class="hidden px-2 py-2 font-medium md:table-cell">Type</th>
            <th
              class="hidden px-2 py-2 text-center font-medium lg:table-cell"
              :title="rated || banner === 500 ? 'Pull number on that banner' : 'Pull number'"
            >
              #Roll
            </th>
            <th
              v-if="banner !== 200 && banner !== 100"
              class="hidden py-2 pr-4 pl-2 font-medium lg:table-cell"
            >
              Banner
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in shown"
            :key="row.pull.id.toString()"
            class="border-t border-border-default"
            :class="TINT[row.pull.item.rank] ?? ''"
          >
            <td
              class="tabular hidden py-1 pr-2 pl-4 font-mono whitespace-nowrap text-text-secondary sm:table-cell"
            >
              {{ wishMinute(row.pull.time) }}
            </td>
            <td class="py-1 pr-2 pl-4 text-center whitespace-nowrap sm:pl-2">
              <span
                v-if="row.pity"
                class="tabular inline-flex items-center gap-1 font-mono font-semibold"
                :class="row.pull.item.rank === 5 ? '' : RARITY_TEXT[row.pull.item.rank]"
                :style="pityStyle(row)"
              >
                <span class="w-6 text-right">{{ row.pity }}</span>
                <span
                  v-if="row.outcome"
                  role="img"
                  class="inline-flex"
                  :aria-label="OUTCOME_LABEL[row.outcome]"
                  :title="outcomeTitle(row.outcome, banner, row.pull.item.rank)"
                >
                  <Star
                    class="size-3.5"
                    :class="
                      row.outcome === 'won'
                        ? 'fill-current'
                        : row.outcome === 'guaranteed'
                          ? 'fill-current opacity-50'
                          : ''
                    "
                    aria-hidden="true"
                  />
                </span>
                <span v-else-if="rated" class="size-3.5" aria-hidden="true" />
              </span>
            </td>
            <td class="px-2 py-1">
              <div class="flex min-w-0 items-center gap-2">
                <GameIcon
                  :src="wishIcon(row.pull.item)"
                  :name="row.pull.item.name"
                  :rarity="row.pull.item.rank || undefined"
                  size="xs"
                  class="size-6! rounded-md"
                />
                <span class="flex min-w-0 flex-col">
                  <span
                    class="truncate"
                    :class="[
                      RARITY_TEXT[row.pull.item.rank] ?? '',
                      row.pull.item.rank >= 4 ? 'font-semibold' : '',
                    ]"
                    >{{ row.pull.item.name }}</span
                  >
                  <time class="tabular font-mono text-xs text-text-muted sm:hidden">{{
                    wishMinute(row.pull.time)
                  }}</time>
                </span>
              </div>
            </td>
            <td
              class="tabular hidden px-2 py-1 text-center font-mono text-text-secondary md:table-cell"
            >
              {{ row.pull.item.rank || '' }}
            </td>
            <td class="hidden px-2 py-1 text-text-secondary md:table-cell">{{ kind(row) }}</td>
            <td
              class="tabular hidden px-2 py-1 text-center font-mono text-text-secondary lg:table-cell"
            >
              {{ formatNumber(rolls.get(row) ?? row.number) }}
            </td>
            <td
              v-if="banner !== 200 && banner !== 100"
              class="hidden max-w-56 truncate py-1 pr-4 pl-2 text-text-secondary lg:table-cell"
              :title="row.on ? `${runName(row)} · ${row.on.version}` : undefined"
            >
              {{ runName(row) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pageCount > 1" class="border-t border-border-default px-4 py-3">
      <UiPager
        v-model="page"
        :page-count="pageCount"
        :total="filtered.length"
        :page-size="PAGE_SIZE"
      />
    </div>
  </section>
</template>
