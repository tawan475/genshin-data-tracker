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
  variant: string
}
interface Card {
  title: string
  icon: Component
  chip: string
  targets: Target[]
}

const CARDS: Card[] = [
  {
    title: 'Optimizer',
    icon: Calculator,
    chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
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
    chip: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    targets: [{ site: 'Seelie.me', url: 'https://seelie.me/inventory', variant: 'emerald' }],
  },
  {
    title: 'Achievement',
    icon: Trophy,
    chip: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
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
      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-3 sm:p-4 flex items-center gap-3 sm:flex-col sm:items-stretch transition-colors"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="p-2 rounded-lg transition-colors" :class="card.chip">
          <component :is="card.icon" class="w-5 h-5" aria-hidden="true" />
        </div>
        <h2
          class="truncate text-sm sm:text-base font-bold text-slate-800 dark:text-white transition-colors"
        >
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
