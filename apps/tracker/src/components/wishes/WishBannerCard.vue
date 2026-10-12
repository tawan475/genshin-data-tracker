<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import GameIcon from '@/components/ui/GameIcon.vue'
import { HARD_PITY, PRIMOS_PER_PULL, SOFT_PITY, type BannerStats } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import WishOddsChip from './WishOddsChip.vue'
import WishPityTrack from './WishPityTrack.vue'
import { OUTCOME_LABEL, bannerInfo, wishDay, wishIcon, wishMinute } from './wish-labels'

/**
 * One banner on the overview, a link to its page: the 5★ pity big against
 * hard pity, what the next 5★ is, the way there with soft pity shaded, the
 * 4★ pity and the last 5★ (red pity when it lost the 50/50). The pulls left
 * to hard pity and their Primogems are the tooltip. Phones keep the pities
 * and the track.
 */
const props = defineProps<{ stats: BannerStats; to: RouteLocationRaw }>()

const info = computed(() => bannerInfo(props.stats.banner))
const hard = computed(() => HARD_PITY[props.stats.banner])
const soft = computed(() => SOFT_PITY[props.stats.banner])
const last = computed(() => props.stats.fives[0] ?? null)

const toHard = computed(() => {
  const left = hard.value[0] - props.stats.pity5
  return `${formatNumber(left)} to hard pity · ✦ ${formatNumber(left * PRIMOS_PER_PULL)} · soft pity from ${soft.value}`
})
const lastWhen = computed(() => {
  const row = last.value
  if (!row) return ''
  const day = wishDay(row.pull.time)
  return row.outcome ? `${day} · ${OUTCOME_LABEL[row.outcome].toLowerCase()}` : day
})
</script>

<template>
  <RouterLink
    :to="to"
    class="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border-default bg-surface-raised px-4 py-3.5 shadow-sm transition-colors hover:border-border-strong sm:gap-3.5 sm:px-5 sm:py-4.5"
  >
    <div class="flex min-w-0 items-baseline gap-2">
      <h2 class="truncate text-base font-semibold" :title="info.title">{{ info.label }}</h2>
      <span
        class="tabular ml-auto shrink-0 font-mono text-xs text-text-muted"
        :title="`✦ ${formatNumber(stats.total * PRIMOS_PER_PULL)} Primogems`"
        >{{ formatNumber(stats.total) }} pulls</span
      >
    </div>

    <div class="flex min-w-0 flex-col gap-2.5 sm:gap-3.5" :title="toHard">
      <div class="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-1 sm:gap-x-2.5">
        <span
          class="tabular font-mono text-[2rem] leading-none font-bold text-rarity-5 sm:text-[2.45rem]"
          >{{ stats.pity5 }}</span
        >
        <span
          class="tabular shrink-0 pb-1 font-mono text-sm whitespace-nowrap text-text-muted sm:text-base"
          >/ {{ hard[0] }}</span
        >
        <span
          class="tabular ml-2 shrink-0 pb-1 font-mono text-xs whitespace-nowrap text-rarity-4 sm:hidden"
          >4★ {{ stats.pity4 }}/{{ hard[1] }}</span
        >
        <WishOddsChip :stats="stats" class="mb-1 ml-auto" />
      </div>
      <WishPityTrack :pity="stats.pity5" :hard="hard[0]" :soft="soft" />
    </div>

    <div
      class="hidden items-center gap-2.5 text-xs text-text-secondary sm:flex"
      :title="`${hard[1] - stats.pity4} to a sure 4★${stats.guaranteed4 ? ' · next 4★ is featured' : ''}`"
    >
      <span class="font-semibold text-rarity-4">4★</span>
      <span class="tabular font-mono">{{ stats.pity4 }} / {{ hard[1] }}</span>
      <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <span
          class="block h-full rounded-full bg-rarity-4"
          :style="{ width: `${Math.min(100, (stats.pity4 / hard[1]) * 100)}%` }"
        />
      </span>
    </div>

    <div class="hidden min-w-0 items-center gap-2.5 border-t border-border-default pt-3 sm:flex">
      <template v-if="last">
        <GameIcon
          :src="wishIcon(last.pull.item)"
          :name="last.pull.item.name"
          :rarity="5"
          size="sm"
        />
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-medium text-rarity-5" :title="last.pull.item.name">{{
            last.pull.item.name
          }}</span>
          <span
            class="tabular truncate font-mono text-xs text-text-muted"
            :title="wishMinute(last.pull.time)"
            >{{ lastWhen }}</span
          >
        </div>
        <span
          class="tabular ml-auto shrink-0 font-mono text-sm font-semibold"
          :class="last.outcome === 'lost' ? 'text-danger-text' : 'text-text-primary'"
          :title="`Pity ${last.pity}`"
          >{{ last.pity }}</span
        >
      </template>
      <span v-else class="flex h-9 items-center text-xs text-text-muted">No 5★ yet</span>
    </div>
  </RouterLink>
</template>
