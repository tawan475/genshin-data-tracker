<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { ChevronDown, CircleArrowUp, List } from 'lucide-vue-next'
import {
  HARD_PITY,
  PRIMOS_PER_PULL,
  SOFT_PITY,
  type BannerStats,
  type PullRow,
} from '@/data/wish-history'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { formatNumber } from '@/lib/format'
import { RARITY_TEXT, bannerInfo, oddsOf, wishMinute } from './wish-labels'

/**
 * One banner on the overview, as paimon.moe's counter: three inset tiles
 * (lifetime pulls with their Primogems, 5★ pity, 4★ pity; an arrow before a
 * pity whose next pull of that rarity is featured), and a chevron that opens
 * the latest pulls as text (3★ off until asked for). The list icon opens the
 * banner's page.
 */
const props = defineProps<{ stats: BannerStats; to: RouteLocationRaw }>()

const LATEST = 20
const info = computed(() => bannerInfo(props.stats.banner))
const hard = computed(() => HARD_PITY[props.stats.banner])
const soft = computed(() => SOFT_PITY[props.stats.banner])

const open = ref(false)
const ranks = reactive<Record<3 | 4 | 5, boolean>>({ 5: true, 4: true, 3: false })
/** The newest LATEST of the chosen rarities, without filtering every pull. */
const latest = computed(() => {
  const out: PullRow[] = []
  if (!open.value) return out
  for (const row of props.stats.rows) {
    if (!(ranks[row.pull.item.rank as 3 | 4 | 5] ?? true)) continue
    out.push(row)
    if (out.length === LATEST) break
  }
  return out
})

const fiveTitle = computed(() => {
  const left = hard.value[0] - props.stats.pity5
  const g = props.stats.guaranteed5
  return [
    `${formatNumber(left)} to hard pity (${formatNumber(left * PRIMOS_PER_PULL)} Primogems)`,
    `soft pity from ${soft.value}`,
    g === true
      ? 'next 5★ is featured'
      : g === false
        ? `next 5★ is a ${oddsOf(props.stats.banner)}`
        : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

const tiles = computed(() => [
  {
    label: 'Lifetime pulls',
    sub: `✦ ${formatNumber(props.stats.total * PRIMOS_PER_PULL)}`,
    value: props.stats.total,
    tone: '',
    up: false,
    title: `${formatNumber(props.stats.total)} wishes · ${formatNumber(props.stats.total * PRIMOS_PER_PULL)} Primogems`,
  },
  {
    label: '5★ pity',
    sub: `Guaranteed at ${hard.value[0]}`,
    value: props.stats.pity5,
    tone: 'text-rarity-5',
    up: !!props.stats.guaranteed5,
    title: fiveTitle.value,
  },
  {
    label: '4★ pity',
    sub: `Guaranteed at ${hard.value[1]}`,
    value: props.stats.pity4,
    tone: 'text-rarity-4',
    up: !!props.stats.guaranteed4,
    title: `${hard.value[1] - props.stats.pity4} to a sure 4★${props.stats.guaranteed4 ? ' · next 4★ is featured' : ''}`,
  },
])
</script>

<template>
  <section
    class="flex flex-col rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm sm:p-4"
  >
    <header class="mb-2 flex items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">{{ info.title }}</h2>
      <UiIconButton :label="`${info.title}: every pull`" :to="to">
        <List class="size-5" aria-hidden="true" />
      </UiIconButton>
    </header>

    <div class="flex flex-col gap-2">
      <div
        v-for="tile in tiles"
        :key="tile.label"
        class="flex items-center gap-2 rounded-lg bg-surface-sunken px-4 py-2.5"
        :title="tile.title"
      >
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm">{{ tile.label }}</span>
          <span class="tabular truncate text-xs text-text-muted">{{ tile.sub }}</span>
        </span>
        <CircleArrowUp
          v-if="tile.up"
          class="size-5 shrink-0"
          :class="tile.tone"
          aria-label="Next one is featured"
        />
        <span class="tabular font-mono text-3xl font-semibold" :class="tile.tone">{{
          formatNumber(tile.value)
        }}</span>
      </div>
    </div>

    <button
      type="button"
      class="mt-2 -mb-1 flex items-center justify-center rounded-lg py-0.5 text-text-muted hover:bg-surface-overlay hover:text-text-primary"
      :aria-expanded="open"
      :aria-label="open ? 'Hide the latest pulls' : 'Show the latest pulls'"
      :title="open ? 'Hide' : 'Latest pulls'"
      @click="open = !open"
    >
      <ChevronDown
        class="size-5 transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>

    <div v-if="open" class="mt-2 flex flex-col gap-2">
      <div role="group" aria-label="Rarity" class="flex gap-2">
        <FilterChip
          v-for="rank in [5, 4, 3] as const"
          :key="rank"
          :pressed="ranks[rank]"
          @toggle="ranks[rank] = !ranks[rank]"
        >
          <span :class="RARITY_TEXT[rank]">{{ rank }}★</span>
        </FilterChip>
      </div>
      <p v-if="latest.length === 0" class="py-2 text-center text-sm text-text-muted">None</p>
      <div v-else class="max-h-80 overflow-y-auto">
        <table class="w-full table-fixed text-sm">
          <thead class="sticky top-0 bg-surface-raised">
            <tr class="text-left text-xs text-text-muted">
              <th class="py-1 font-medium">Name</th>
              <th class="w-32 px-2 py-1 font-medium">Time</th>
              <th class="w-10 py-1 text-right font-medium">Pity</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in latest"
              :key="row.pull.id.toString()"
              class="border-t border-border-default"
            >
              <td
                class="truncate py-1 font-medium"
                :class="RARITY_TEXT[row.pull.item.rank]"
                :title="row.pull.item.name"
              >
                {{ row.pull.item.name }}
              </td>
              <td class="tabular px-2 py-1 font-mono text-xs whitespace-nowrap text-text-muted">
                {{ wishMinute(row.pull.time) }}
              </td>
              <td class="tabular py-1 text-right font-mono">{{ row.pity || '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
