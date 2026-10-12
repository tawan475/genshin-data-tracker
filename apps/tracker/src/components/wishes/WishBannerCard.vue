<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { ArrowUpCircle, ChevronDown, List, Star } from 'lucide-vue-next'
import { HARD_PITY, PRIMOS_PER_PULL, SOFT_PITY, type BannerStats } from '@/data/wish-history'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { formatNumber } from '@/lib/format'
import { RARITY_TEXT, bannerInfo, oddsOf, wishIcon, wishMinute } from './wish-labels'

/**
 * One banner on the overview, after paimon.moe's: lifetime pulls and their
 * Primogems, both pities toward their hard pity (an arrow when the next 5★
 * is guaranteed, a bar with the soft pity mark), and a fold with the latest
 * pulls (3★ off until asked for). The list icon opens the banner's page.
 */
const props = defineProps<{ stats: BannerStats; to: RouteLocationRaw }>()

const info = computed(() => bannerInfo(props.stats.banner))
const hard = computed(() => HARD_PITY[props.stats.banner])
const soft = computed(() => SOFT_PITY[props.stats.banner])
const left = computed(() => hard.value[0] - props.stats.pity5)

const open = ref(false)
const ranks = reactive<Record<3 | 4 | 5, boolean>>({ 5: true, 4: true, 3: false })
const recent = computed(() =>
  props.stats.rows.filter((r) => ranks[r.pull.item.rank as 3 | 4 | 5] ?? true).slice(0, 12),
)

const pityTitle = computed(() => {
  const g = props.stats.guaranteed5
  const next =
    g === true
      ? 'the next 5★ is featured (guaranteed)'
      : g === false
        ? `the next 5★ is a ${oddsOf(props.stats.banner)}`
        : ''
  return [
    `${formatNumber(left.value)} to hard pity: ${formatNumber(left.value * PRIMOS_PER_PULL)} Primogems`,
    `soft pity from ${soft.value}`,
    next,
  ]
    .filter(Boolean)
    .join(' · ')
})
</script>

<template>
  <section
    class="flex flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm"
  >
    <header class="flex items-center justify-between gap-2 px-4 pt-3">
      <h2 class="text-sm font-semibold text-text-secondary">{{ info.title }}</h2>
      <UiIconButton :label="`${info.title}: every pull`" :to="to">
        <List class="size-5" aria-hidden="true" />
      </UiIconButton>
    </header>
    <div class="flex flex-col gap-3 px-4 pb-3">
      <div>
        <p
          class="tabular font-mono text-2xl font-medium"
          :title="`${formatNumber(stats.total)} wishes`"
        >
          {{ formatNumber(stats.total) }}
        </p>
        <p class="tabular font-mono text-xs text-text-muted" title="Primogems">
          ✦ {{ formatNumber(stats.total * PRIMOS_PER_PULL) }}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div :title="pityTitle">
          <p class="flex items-center gap-1 text-xs text-text-secondary">
            5★ pity
            <ArrowUpCircle
              v-if="stats.guaranteed5"
              class="size-3.5 text-success-text"
              aria-label="Guaranteed"
            />
          </p>
          <p class="tabular font-mono text-lg font-medium">
            <span :class="stats.pity5 >= soft ? 'text-warning-text' : ''">{{ stats.pity5 }}</span>
            <span class="text-sm text-text-muted"> / {{ hard[0] }}</span>
          </p>
          <span class="relative mt-1 block h-1.5 rounded-full bg-surface-sunken" aria-hidden="true">
            <span
              class="block h-full rounded-full bg-rarity-5"
              :style="{ width: `${Math.min(100, (stats.pity5 / hard[0]) * 100)}%` }"
            />
            <span
              class="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-text-muted"
              :style="{ left: `${(soft / hard[0]) * 100}%` }"
            />
          </span>
        </div>
        <div :title="`Guaranteed at ${hard[1]}`">
          <p class="flex items-center gap-1 text-xs text-text-secondary">
            4★ pity
            <ArrowUpCircle
              v-if="stats.guaranteed4"
              class="size-3.5 text-success-text"
              aria-label="Next 4★ featured"
            />
          </p>
          <p class="tabular font-mono text-lg font-medium">
            {{ stats.pity4 }}<span class="text-sm text-text-muted"> / {{ hard[1] }}</span>
          </p>
          <span class="mt-1 block h-1.5 rounded-full bg-surface-sunken" aria-hidden="true">
            <span
              class="block h-full rounded-full bg-rarity-4"
              :style="{ width: `${Math.min(100, (stats.pity4 / hard[1]) * 100)}%` }"
            />
          </span>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="flex items-center justify-center gap-1 border-t border-border-default py-1.5 text-xs text-text-muted hover:bg-surface-overlay hover:text-text-primary"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span>Latest</span>
      <ChevronDown
        class="size-4 transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>
    <div v-if="open" class="flex flex-col gap-2 border-t border-border-default px-3 py-2">
      <div role="group" aria-label="Rarity" class="flex gap-1.5">
        <FilterChip
          v-for="rank in [5, 4, 3] as const"
          :key="rank"
          :pressed="ranks[rank]"
          @toggle="ranks[rank] = !ranks[rank]"
        >
          <Star class="size-3.5 fill-current" :class="RARITY_TEXT[rank]" aria-hidden="true" />
          {{ rank }}<span class="sr-only"> star</span>
        </FilterChip>
      </div>
      <p v-if="recent.length === 0" class="py-2 text-center text-sm text-text-muted">None</p>
      <ul v-else class="flex flex-col">
        <li
          v-for="row in recent"
          :key="row.pull.id.toString()"
          class="flex items-center gap-2 py-1"
        >
          <GameIcon
            :src="wishIcon(row.pull.item)"
            :name="row.pull.item.name"
            :rarity="row.pull.item.rank || undefined"
            size="xs"
          />
          <span class="min-w-0 flex-1 truncate text-sm" :class="RARITY_TEXT[row.pull.item.rank]">{{
            row.pull.item.name
          }}</span>
          <time class="tabular hidden font-mono text-xs text-text-muted sm:inline">{{
            wishMinute(row.pull.time).slice(0, 10)
          }}</time>
          <span
            class="tabular w-6 text-right font-mono text-sm"
            :class="RARITY_TEXT[row.pull.item.rank]"
            >{{ row.pity || '' }}</span
          >
        </li>
      </ul>
    </div>
  </section>
</template>
