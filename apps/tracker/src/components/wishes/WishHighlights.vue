<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UigfGachaType } from '@gdt/shared'
import type { PullRow } from '@/data/wish-history'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatNumber } from '@/lib/format'
import { OUTCOME_LABEL, OUTCOME_TONE, outcomeTitle, wishIcon, wishMinute } from './wish-labels'

/**
 * The 5★ (or 4★) pulls of a banner, newest first: who, when, the pity it
 * took (a bar of the hard pity) and the 50/50 result. Long lists show the
 * newest `limit` until opened.
 */
const props = defineProps<{
  rows: readonly PullRow[]
  rank: 5 | 4
  banner: UigfGachaType
  hardPity: number
  limit: number
}>()

const open = ref(false)
watch(
  () => props.banner,
  () => (open.value = false),
)
const shown = computed(() => (open.value ? props.rows : props.rows.slice(0, props.limit)))
const average = computed(() =>
  props.rows.length === 0
    ? null
    : props.rows.reduce((sum, r) => sum + r.pity, 0) / props.rows.length,
)
const BAR = { 5: 'bg-rarity-5', 4: 'bg-rarity-4' } as const
</script>

<template>
  <UiPanel flush>
    <template #header>
      <div class="flex min-w-0 items-baseline gap-3">
        <h2 class="text-base font-semibold" :class="rank === 5 ? 'text-rarity-5' : 'text-rarity-4'">
          {{ rank }}★
        </h2>
        <span class="tabular font-mono text-sm text-text-secondary">{{
          formatNumber(rows.length)
        }}</span>
        <span
          v-if="average !== null"
          class="tabular font-mono text-sm text-text-muted"
          :title="`Average pity: ${average.toFixed(1)}`"
          >⌀ {{ average.toFixed(1) }}</span
        >
      </div>
    </template>
    <p v-if="rows.length === 0" class="px-5 py-4 text-sm text-text-muted">None yet</p>
    <ul v-else class="divide-y divide-border-default">
      <li
        v-for="row in shown"
        :key="row.pull.id.toString()"
        class="flex items-center gap-3 px-4 py-2"
      >
        <GameIcon
          :src="wishIcon(row.pull.item)"
          :name="row.pull.item.name"
          :rarity="rank"
          :size="rank === 5 ? 'md' : 'sm'"
        />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-medium">{{ row.pull.item.name }}</span>
          <time
            class="tabular truncate font-mono text-xs text-text-muted"
            :title="`Pull ${formatNumber(row.number)} · game clock`"
            >{{ wishMinute(row.pull.time) }}</time
          >
        </div>
        <UiBadge
          v-if="row.outcome"
          :tone="OUTCOME_TONE[row.outcome]"
          :title="outcomeTitle(row.outcome, banner)"
          >{{ OUTCOME_LABEL[row.outcome] }}</UiBadge
        >
        <div class="flex w-14 shrink-0 flex-col items-end gap-1" :title="`Pity ${row.pity}`">
          <span class="tabular font-mono text-lg leading-none font-medium">{{ row.pity }}</span>
          <span
            class="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
            aria-hidden="true"
          >
            <span
              class="block h-full rounded-full"
              :class="BAR[rank]"
              :style="{ width: `${Math.min(100, (row.pity / hardPity) * 100)}%` }"
            />
          </span>
        </div>
      </li>
    </ul>
    <div v-if="rows.length > limit" class="border-t border-border-default px-4 py-2">
      <UiButton variant="ghost" size="sm" block @click="open = !open">
        {{ open ? 'Show fewer' : `Show all ${formatNumber(rows.length)}` }}
      </UiButton>
    </div>
  </UiPanel>
</template>
