<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { UigfGachaType } from '@gdt/shared'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import { HARD_PITY, SOFT_PITY, pityBand, type BannerStats, type PullRow } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import WishPortrait from './WishPortrait.vue'
import { BAND_COLOR, OUTCOME_LABEL, oddsOf, runName, wishMinute } from './wish-labels'

/**
 * Every 5★ of a banner, newest first: from sm a column each, as tall as its
 * pity and coloured by how far into pity it came, soft pity a dashed line,
 * the portrait under it ringed by the 50/50 (won, lost, guaranteed), in a
 * box that scrolls sideways; on phones a list of bars, the newest eight
 * until "All" opens the rest. The banner switch also picks the numbers
 * table beside the month chart.
 */
const props = defineProps<{ stats: BannerStats; options: SegmentedOption<UigfGachaType>[] }>()
const banner = defineModel<UigfGachaType>({ required: true })

const wide = useMediaQuery('(min-width: 640px)')
const FEW = 8
const all = ref(false)
watch(banner, () => (all.value = false))

const hard = computed(() => HARD_PITY[props.stats.banner][0])
const soft = computed(() => SOFT_PITY[props.stats.banner])
const rated = computed(() => props.stats.rate5 !== null)
const listed = computed(() =>
  wide.value || all.value ? props.stats.fives : props.stats.fives.slice(0, FEW),
)

/** Column bar height (px) at hard pity; the bar sits on the portrait and its gap. */
const BAR = 168
const FOOT = 42
const barHeight = (pity: number) => Math.max(3, Math.round((pity / hard.value) * BAR))
const color = (row: PullRow) => BAND_COLOR[pityBand(row.pity, props.stats.banner)]

function title(row: PullRow): string {
  return [
    `${row.pull.item.name} · pity ${row.pity}`,
    row.outcome ? `${OUTCOME_LABEL[row.outcome]} (${oddsOf(props.stats.banner)})` : '',
    wishMinute(row.pull.time),
    runName(row),
  ]
    .filter(Boolean)
    .join('\n')
}
</script>

<template>
  <section
    aria-label="Every 5★"
    class="flex min-w-0 flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm"
  >
    <div
      class="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-default px-4 py-3 sm:px-5"
    >
      <h2 class="text-base font-semibold">5★ journey</h2>
      <span
        class="tabular font-mono text-xs text-text-muted"
        :title="wide ? 'Newest first; scroll sideways for older' : 'Newest first'"
        >{{ formatNumber(stats.fives.length) }}</span
      >
      <div
        class="scroll-hide scroll-fade-x ml-auto max-w-full min-w-0 overflow-x-auto sm:scroll-fade-none"
      >
        <UiSegmented v-if="options.length > 1" v-model="banner" :options="options" label="Banner" />
      </div>
    </div>

    <p v-if="!stats.fives.length" class="px-5 py-8 text-center text-sm text-text-muted">
      No 5★ yet
    </p>

    <template v-else-if="wide">
      <div class="overflow-x-auto px-5 pt-5 pb-4">
        <div class="relative flex h-[240px] min-w-max items-end gap-2.5">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 border-t border-dashed border-rarity-5/50"
            :style="{ bottom: `${FOOT + (soft / hard) * BAR}px` }"
          />
          <div
            v-for="row in listed"
            :key="row.pull.id.toString()"
            class="relative flex w-[2.6rem] shrink-0 flex-col items-center gap-[6px]"
            :title="title(row)"
          >
            <span class="tabular font-mono text-xs font-semibold" :style="{ color: color(row) }">{{
              row.pity
            }}</span>
            <span
              class="w-[1.3rem] rounded-t-md rounded-b-sm"
              :class="row.outcome === 'lost' ? 'opacity-55' : ''"
              :style="{ height: `${barHeight(row.pity)}px`, background: color(row) }"
            />
            <WishPortrait :item="row.pull.item" :outcome="row.outcome" size="lg" />
          </div>
        </div>
      </div>
      <div
        class="flex flex-wrap gap-x-4.5 gap-y-1 px-5 pb-4 text-xs text-text-secondary"
        aria-hidden="true"
      >
        <template v-if="rated">
          <span class="inline-flex items-center gap-1.5"
            ><span class="size-3 rounded-full border-2 border-rarity-5" />Won
            {{ oddsOf(stats.banner) }}</span
          >
          <span class="inline-flex items-center gap-1.5"
            ><span class="size-3 rounded-full border-2 border-danger-text" />Lost
            {{ oddsOf(stats.banner) }}</span
          >
          <span class="inline-flex items-center gap-1.5"
            ><span
              class="size-3 rounded-full border-2 border-dashed border-text-muted"
            />Guaranteed</span
          >
        </template>
        <span class="inline-flex items-center gap-1.5"
          ><span class="w-4 border-t border-dashed border-rarity-5" />Soft pity {{ soft }}</span
        >
      </div>
    </template>

    <template v-else>
      <ul class="flex flex-col py-1">
        <li
          v-for="row in listed"
          :key="row.pull.id.toString()"
          class="flex min-w-0 items-center gap-2.5 px-4 py-2"
          :title="title(row)"
        >
          <WishPortrait :item="row.pull.item" :outcome="row.outcome" />
          <span class="w-24 shrink-0 truncate text-sm font-medium text-rarity-5">{{
            row.pull.item.name
          }}</span>
          <span class="h-1.5 min-w-0 flex-1 rounded-full bg-surface-sunken" aria-hidden="true">
            <span
              class="block h-full rounded-full"
              :class="row.outcome === 'lost' ? 'opacity-55' : ''"
              :style="{ width: `${(row.pity / hard) * 100}%`, background: color(row) }"
            />
          </span>
          <span
            class="tabular w-6 shrink-0 text-right font-mono text-sm font-semibold"
            :style="{ color: color(row) }"
            >{{ row.pity }}</span
          >
        </li>
      </ul>
      <button
        v-if="stats.fives.length > FEW"
        type="button"
        class="border-t border-border-default p-3 text-center text-sm text-accent-text hover:bg-surface-overlay"
        :aria-expanded="all"
        @click="all = !all"
      >
        {{ all ? 'Fewer' : `All ${formatNumber(stats.fives.length)}` }}
      </button>
    </template>
  </section>
</template>
