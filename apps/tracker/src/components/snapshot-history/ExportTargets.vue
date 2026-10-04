<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, shallowRef, toRef, type Component } from 'vue'
import { CalendarCheck, Calculator, Trophy } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import { copyText } from '@/data/import-setup'
import { formatFullDateTime } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { copyNow, openTab, useLatestGood } from './latest-good'

/**
 * The old Export page's three cards, compact: each button copies the newest
 * snapshot's GOOD file and opens the site to paste it into.
 */
const props = defineProps<{ account: AccountResponse }>()
const feedback = useFeedback()
const { text, fetchLatest } = useLatestGood(toRef(props, 'account'))

interface Target {
  site: string
  url: string
  /** The old export page's per-site button colour (kept on purpose). */
  variant: string
}
interface Card {
  title: string
  icon: Component
  /** The icon tile's tint: a chart series colour per card. */
  chip: string
  targets: Target[]
}

const CARDS: Card[] = [
  {
    title: 'Optimizer',
    icon: Calculator,
    chip: 'bg-chart-4/15 text-chart-4',
    targets: [
      {
        site: 'Genshin Optimizer',
        url: 'https://frzyc.github.io/genshin-optimizer/#/setting',
        variant: 'blue',
      },
    ],
  },
  {
    title: 'Planner',
    icon: CalendarCheck,
    chip: 'bg-chart-3/15 text-chart-3',
    targets: [{ site: 'Seelie.me', url: 'https://seelie.me/inventory', variant: 'emerald' }],
  },
  {
    title: 'Achievement',
    icon: Trophy,
    chip: 'bg-chart-6/15 text-chart-6',
    targets: [
      { site: 'Stardb.gg', url: 'https://stardb.gg/en/import', variant: 'purple' },
      { site: 'Seelie.me', url: 'https://seelie.me/achievements', variant: 'secondary' },
    ],
  },
]

/** The target waiting for the file (clicked before it had loaded). */
const waiting = shallowRef<Target | null>(null)

const latest = computed(() => props.account.latest)
const titleFor = (target: Target) =>
  latest.value
    ? `Copy the latest GOOD file and open ${target.site}\n#${latest.value.id} · ${formatFullDateTime(latest.value.takenAt)}`
    : 'No snapshots yet'

function copied(target: Target, opened: boolean) {
  feedback.toast({
    tone: 'success',
    title: 'Copied to clipboard!',
    action: opened ? undefined : { label: `Open ${target.site}`, run: () => openTab(target.url) },
  })
}

/** Copies and opens in the click when the file is ready; otherwise after it loads. */
async function exportTo(target: Target) {
  if (!latest.value || waiting.value) return
  const ready = text.value
  if (ready !== null && copyNow(ready)) {
    copied(target, openTab(target.url))
    return
  }
  waiting.value = target
  try {
    const value = ready ?? (await fetchLatest())
    if (!copyNow(value) && !(await copyText(value))) {
      throw new Error('The browser refused clipboard access.')
    }
    copied(target, openTab(target.url))
  } catch (cause) {
    feedback.error('Failed to export data', cause)
  } finally {
    waiting.value = null
  }
}
</script>

<template>
  <div v-if="latest" class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
    <div
      v-for="card in CARDS"
      :key="card.title"
      class="flex items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm transition-colors sm:flex-col sm:items-stretch sm:p-4"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="rounded-lg p-2 transition-colors" :class="card.chip">
          <component :is="card.icon" class="size-5" aria-hidden="true" />
        </div>
        <h2 class="truncate text-sm font-semibold sm:text-base">
          {{ card.title }}
        </h2>
      </div>
      <div
        class="flex shrink-0 gap-2 sm:grid"
        :class="card.targets.length > 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-1'"
      >
        <BaseButton
          v-for="target in card.targets"
          :key="target.url"
          :variant="target.variant"
          size="sm"
          :title="titleFor(target)"
          :loading="waiting === target"
          :disabled="!latest || (waiting !== null && waiting !== target)"
          @click="exportTo(target)"
        >
          {{ target.site }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
