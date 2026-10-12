<script setup lang="ts">
import type { BannerStats } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import WishFiveTile from './WishFiveTile.vue'

/**
 * Every 5★ of a banner as tiles, newest first, in a box that scrolls (its
 * height from `boxClass`), with the 50/50 ring legend where the banner has
 * one. `dated` adds each one's day (the banner page).
 */
defineProps<{ stats: BannerStats; boxClass?: string; dated?: boolean }>()

const LEGEND = [
  { label: 'won', dot: 'bg-success-text' },
  { label: 'lost', dot: 'bg-danger-text' },
  { label: 'guaranteed', dot: 'bg-accent-text' },
]
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2.5">
    <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
      <span class="font-semibold text-rarity-5">Every 5★</span>
      <span class="tabular font-mono text-text-muted"
        >{{ formatNumber(stats.fives.length) }} · newest first</span
      >
      <span v-if="stats.rate5" class="ml-auto inline-flex gap-3 text-text-muted">
        <span v-for="l in LEGEND" :key="l.label" class="inline-flex items-center gap-1.5"
          ><span class="size-2.5 rounded-full" :class="l.dot" aria-hidden="true" />{{
            l.label
          }}</span
        >
      </span>
    </div>
    <p v-if="!stats.fives.length" class="py-6 text-center text-xs text-text-muted">No 5★ yet</p>
    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-2 overflow-y-auto pr-1"
      :class="boxClass"
    >
      <WishFiveTile
        v-for="row in stats.fives"
        :key="row.pull.id.toString()"
        :row="row"
        :banner="stats.banner"
        :dated="dated"
      />
    </div>
  </div>
</template>
