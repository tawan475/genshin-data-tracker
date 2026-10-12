<script setup lang="ts">
import { computed } from 'vue'
import { HARD_PITY, PRIMOS_PER_PULL, SOFT_PITY, type BannerStats } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import WishOddsChip from './WishOddsChip.vue'
import WishPityTrack from './WishPityTrack.vue'

/**
 * Where a banner stands now: the 5★ pity big against hard pity, what the
 * next 5★ is, the pulls (and Primogems) left to hard pity, the track with
 * soft pity marked, and the 4★ pity.
 */
const props = defineProps<{ stats: BannerStats }>()

const hard = computed(() => HARD_PITY[props.stats.banner])
const soft = computed(() => SOFT_PITY[props.stats.banner])
const left = computed(() => hard.value[0] - props.stats.pity5)
</script>

<template>
  <section
    aria-label="Now"
    class="flex min-w-0 flex-col gap-4.5 rounded-xl border border-border-default bg-surface-raised px-4 py-4 shadow-sm sm:px-6 sm:py-5.5"
  >
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <span class="text-xs text-text-secondary">5★ pity</span>
        <span class="flex items-end gap-2">
          <span
            class="tabular font-mono text-[3rem] leading-[.9] font-bold text-rarity-5 sm:text-[3.55rem]"
            >{{ stats.pity5 }}</span
          >
          <span class="tabular font-mono text-lg text-text-muted">/ {{ hard[0] }}</span>
        </span>
      </div>
      <WishOddsChip :stats="stats" icon class="mb-1.5 ml-2" />
      <div class="hidden flex-auto sm:block" />
      <div
        class="flex basis-full items-baseline gap-2 pb-1.5 sm:basis-auto sm:flex-col sm:items-end sm:gap-0.5"
      >
        <span class="tabular font-mono text-base font-semibold"
          >{{ formatNumber(left) }} to hard pity</span
        >
        <span
          class="tabular font-mono text-xs text-text-muted"
          :title="`${formatNumber(left)} wishes × ${PRIMOS_PER_PULL}`"
          >✦ {{ formatNumber(left * PRIMOS_PER_PULL) }}</span
        >
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <WishPityTrack :pity="stats.pity5" :hard="hard[0]" :soft="soft" size="lg" />
      <div class="tabular relative h-[1.1rem] font-mono text-xs text-text-muted" aria-hidden="true">
        <span class="absolute left-0">0</span>
        <span
          class="absolute -translate-x-1/2 whitespace-nowrap text-warning-text"
          :style="{ left: `${(soft / hard[0]) * 100}%` }"
          >{{ soft }} soft</span
        >
        <span class="absolute right-0">{{ hard[0] }}</span>
      </div>
    </div>

    <div class="flex min-w-0 items-center gap-3" :title="`${hard[1] - stats.pity4} to a sure 4★`">
      <span class="shrink-0 text-sm font-semibold text-rarity-4">4★ pity</span>
      <span class="tabular shrink-0 font-mono text-sm">{{ stats.pity4 }} / {{ hard[1] }}</span>
      <span
        class="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-sunken"
        aria-hidden="true"
      >
        <span
          class="block h-full rounded-full bg-rarity-4"
          :style="{ width: `${Math.min(100, (stats.pity4 / hard[1]) * 100)}%` }"
        />
      </span>
      <span
        v-if="stats.guaranteed4"
        class="shrink-0 truncate text-xs text-text-muted"
        title="The last 4★ was off-banner: the next one is featured"
        >next 4★ featured</span
      >
    </div>
  </section>
</template>
