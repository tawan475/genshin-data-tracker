<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { ChevronDown, List } from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import {
  HARD_PITY,
  PRIMOS_PER_PULL,
  SOFT_PITY,
  type BannerStats,
  type PullRow,
} from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import WishOddsChip from './WishOddsChip.vue'
import WishPityTrack from './WishPityTrack.vue'
import { RARITY_TEXT, bannerInfo, wishMinute } from './wish-labels'

/**
 * One banner on the overview: lifetime pulls with their Primogems, the 5★
 * pity (what the next 5★ is, the way to hard pity with soft pity shaded;
 * the pulls left and their cost in the tooltip) and the 4★ pity, each in
 * an inset tile. The title and the list icon open the banner's page.
 *
 * The chevron folds out the latest pulls (5★ / 4★ / 3★ chips, Name / Time /
 * Pity) as an extension of the card: the card loses its foot and the list
 * hangs below it over the page (no layout shift, no hole beside it), down
 * to the bottom of the window, scrolling inside. Only the chevron closes
 * it, so several can stay open.
 */
const props = defineProps<{ stats: BannerStats; to: RouteLocationRaw }>()

const LATEST = 200
const info = computed(() => bannerInfo(props.stats.banner))
const hard = computed(() => HARD_PITY[props.stats.banner])
const soft = computed(() => SOFT_PITY[props.stats.banner])

const fiveTitle = computed(() => {
  const left = hard.value[0] - props.stats.pity5
  return `${formatNumber(left)} pulls to hard pity · ✦ ${formatNumber(left * PRIMOS_PER_PULL)} · soft pity from ${soft.value}`
})
const fourTitle = computed(
  () =>
    `${hard.value[1] - props.stats.pity4} to a sure 4★${props.stats.guaranteed4 ? ' · the next 4★ is featured' : ''}`,
)

const open = ref(false)
const panelId = useId()
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

/** The list reaches the bottom of the window (above the phone's tab bar), however far down the card is. */
const panel = ref<HTMLElement | null>(null)
const maxHeight = ref('24rem')
let frame = 0
function fit() {
  frame = 0
  const el = panel.value
  if (!el) return
  const foot = window.innerWidth >= 1024 ? 16 : 88
  const room = window.innerHeight - el.getBoundingClientRect().top - foot
  maxHeight.value = `${Math.max(240, Math.round(room))}px`
}
const schedule = () => (frame ||= requestAnimationFrame(fit))
watch(open, async (isOpen) => {
  if (isOpen) {
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    await nextTick()
    fit()
  } else {
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="relative min-w-0" :class="open ? 'z-10' : ''">
    <section
      class="flex min-w-0 flex-col gap-2 border bg-surface-raised px-3.5 pt-3.5 pb-1 shadow-sm sm:px-4 sm:pt-4"
      :class="
        open
          ? 'rounded-t-xl border-border-default border-b-transparent'
          : 'rounded-xl border-border-default'
      "
    >
      <header class="flex min-w-0 items-center gap-2 pb-1 pl-0.5">
        <h2 class="min-w-0 truncate text-base font-semibold">
          <RouterLink :to="to" class="hover:underline" :title="`${info.title}: every pull`">{{
            info.title
          }}</RouterLink>
        </h2>
        <UiIconButton :label="`${info.title}: every pull`" :to="to" class="ml-auto">
          <List class="size-5" aria-hidden="true" />
        </UiIconButton>
      </header>

      <div
        class="flex items-center gap-2.5 rounded-lg bg-surface-sunken px-3.5 py-2.5"
        :title="`${formatNumber(stats.total)} wishes × ${PRIMOS_PER_PULL}`"
      >
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs text-text-secondary">Lifetime pulls</span>
          <span class="tabular truncate font-mono text-xs text-text-muted"
            >✦ {{ formatNumber(stats.total * PRIMOS_PER_PULL) }}</span
          >
        </span>
        <span class="tabular ml-auto font-mono text-2xl font-bold">{{
          formatNumber(stats.total)
        }}</span>
      </div>

      <div
        class="flex flex-col gap-2 rounded-lg bg-surface-sunken px-3.5 pt-2.5 pb-3"
        :title="fiveTitle"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-xs text-text-secondary">5★ pity</span>
            <span class="truncate text-xs text-text-muted">Guaranteed at {{ hard[0] }}</span>
          </span>
          <WishOddsChip :stats="stats" class="ml-auto" />
          <span
            class="tabular font-mono text-[1.65rem] leading-none font-bold text-rarity-5"
            :class="stats.guaranteed5 === null ? 'ml-auto' : ''"
            >{{ stats.pity5 }}</span
          >
        </div>
        <WishPityTrack :pity="stats.pity5" :hard="hard[0]" :soft="soft" size="sm" on="tile" />
      </div>

      <div
        class="flex flex-col gap-2 rounded-lg bg-surface-sunken px-3.5 pt-2.5 pb-3"
        :title="fourTitle"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-xs text-text-secondary">4★ pity</span>
            <span class="truncate text-xs text-text-muted">Guaranteed at {{ hard[1] }}</span>
          </span>
          <span
            class="tabular ml-auto font-mono text-[1.65rem] leading-none font-bold text-rarity-4"
            >{{ stats.pity4 }}</span
          >
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
          <div
            class="h-full rounded-full bg-rarity-4"
            :style="{ width: `${Math.min(100, (stats.pity4 / hard[1]) * 100)}%` }"
          />
        </div>
      </div>

      <button
        type="button"
        class="flex h-8 w-11 items-center justify-center self-center rounded-md text-text-muted hover:bg-surface-overlay hover:text-text-primary"
        :aria-expanded="open"
        :aria-controls="panelId"
        :aria-label="open ? 'Hide the latest pulls' : 'Show the latest pulls'"
        :title="open ? 'Hide the latest pulls' : 'Latest pulls'"
        @click="open = !open"
      >
        <ChevronDown
          class="size-5 transition-transform"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </section>

    <div
      v-if="open"
      :id="panelId"
      ref="panel"
      role="region"
      :aria-label="`${info.title}: latest pulls`"
      class="absolute inset-x-0 top-full flex flex-col gap-2 overflow-y-auto rounded-b-xl border border-t-0 border-border-default bg-surface-raised px-3.5 pt-1 pb-3 shadow-[var(--shadow-overlay)] sm:px-4"
      :style="{ maxHeight }"
    >
      <div role="group" aria-label="Rarity" class="flex gap-1.5">
        <FilterChip
          v-for="rank in [5, 4, 3] as const"
          :key="rank"
          :pressed="ranks[rank]"
          @toggle="ranks[rank] = !ranks[rank]"
        >
          <span :class="RARITY_TEXT[rank]">{{ rank }}★</span>
        </FilterChip>
      </div>
      <p v-if="latest.length === 0" class="py-2 text-center text-xs text-text-muted">None</p>
      <table v-else class="tabular w-full table-fixed font-mono text-xs">
        <thead>
          <tr class="text-left text-text-muted">
            <th scope="col" class="py-1 font-medium">Name</th>
            <th scope="col" class="w-[7.5rem] py-1 pl-2 font-medium">Time</th>
            <th scope="col" class="w-9 py-1 text-right font-medium">Pity</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in latest"
            :key="row.pull.id.toString()"
            class="border-t border-border-default"
          >
            <td
              class="truncate py-1.5 font-sans font-medium"
              :class="RARITY_TEXT[row.pull.item.rank]"
              :title="row.pull.item.name"
            >
              {{ row.pull.item.name }}
            </td>
            <td class="truncate py-1.5 pl-2 whitespace-nowrap text-text-secondary">
              {{ wishMinute(row.pull.time) }}
            </td>
            <td class="py-1.5 text-right font-semibold">{{ row.pity || '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
