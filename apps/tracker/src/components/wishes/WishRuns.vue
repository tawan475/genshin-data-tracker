<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UigfGachaType } from '@gdt/shared'
import { formatWishTime, wishItemInfo } from '@gdt/shared'
import type { BannerRun } from '@/data/wish-history'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatNumber } from '@/lib/format'
import { OUTCOME_LABEL, pityTone, wishIcon } from './wish-labels'

/**
 * The account's pulls per banner run, newest first: which banner (both
 * names of a dual character phase when both were pulled on), its version
 * and dates, the pulls made there (a bar against the busiest run) and the
 * 5★s it gave with their pity.
 */
const props = defineProps<{ runs: readonly BannerRun[]; banner: UigfGachaType; soft: number }>()

const LIMIT = 12
const open = ref(false)
const newestFirst = computed(() => [...props.runs].reverse())
const shown = computed(() => (open.value ? newestFirst.value : newestFirst.value.slice(0, LIMIT)))
const most = computed(() => Math.max(1, ...props.runs.map((r) => r.pulls)))

function name(run: BannerRun): string {
  const b = run.banner
  if (props.banner === 302) {
    return b.featured5.map((key) => wishItemInfo('weapon', key)?.name ?? key).join(' · ')
  }
  return b.name400 ? `${b.name} / ${b.name400}` : b.name
}
const day = (utc: number) => formatWishTime(utc + 8 * 3600).slice(0, 10)
</script>

<template>
  <UiPanel flush>
    <template #header>
      <div class="flex items-baseline gap-3">
        <h2 class="text-base font-semibold">Banners</h2>
        <span class="tabular font-mono text-sm text-text-muted">{{
          formatNumber(runs.length)
        }}</span>
      </div>
    </template>
    <ul class="divide-y divide-border-default">
      <li
        v-for="run in shown"
        :key="run.banner.start + run.banner.name"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
      >
        <div class="flex min-w-0 flex-1 basis-48 flex-col">
          <span class="truncate font-medium" :title="name(run)">{{ name(run) }}</span>
          <span class="tabular font-mono text-xs text-text-muted"
            >{{ run.banner.version }} · {{ day(run.banner.start) }} →
            {{ day(run.banner.end) }}</span
          >
        </div>
        <div
          class="flex w-28 shrink-0 flex-col items-end gap-1"
          :title="`${formatNumber(run.pulls)} pulls`"
        >
          <span class="tabular font-mono text-sm">{{ formatNumber(run.pulls) }}</span>
          <span class="h-1 w-full rounded-full bg-surface-sunken" aria-hidden="true">
            <span
              class="block h-full rounded-full bg-accent"
              :style="{ width: `${(run.pulls / most) * 100}%` }"
            />
          </span>
        </div>
        <ul class="flex min-w-24 flex-wrap justify-end gap-1">
          <li
            v-for="row in run.fives"
            :key="row.pull.id.toString()"
            class="flex items-center gap-1"
            :title="`${row.pull.item.name} · pity ${row.pity}${row.outcome ? ` · ${OUTCOME_LABEL[row.outcome]}` : ''}`"
          >
            <GameIcon
              :src="wishIcon(row.pull.item)"
              :name="row.pull.item.name"
              :rarity="5"
              size="xs"
            />
            <span class="tabular font-mono text-sm" :class="pityTone(row.pity, soft)">{{
              row.pity
            }}</span>
          </li>
        </ul>
      </li>
    </ul>
    <div v-if="runs.length > LIMIT" class="border-t border-border-default px-4 py-2">
      <UiButton variant="ghost" size="sm" block @click="open = !open">
        {{ open ? 'Show fewer' : `Show all ${formatNumber(runs.length)}` }}
      </UiButton>
    </div>
  </UiPanel>
</template>
