<script setup lang="ts">
import { computed } from 'vue'
import type { AnecdoteProgress, CapturedAnecdotes } from '@/data/anecdote-progress'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { materialIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * Done / total, the stamps toward the next reward (the newest capture's
 * track), the reward's size (the game data's constants) and what is going
 * on now.
 */
const props = defineProps<{
  progress: AnecdoteProgress
  captured: CapturedAnecdotes
  rewardEvery: number
  rewardPrimogems: number
}>()

const primogem = materialIcon('Primogem')

const doneTitle = computed(() => {
  const parts: string[] = []
  let captured = 0
  let marked = 0
  for (const area of props.progress.areas)
    for (const group of area.groups)
      for (const entry of group.entries) {
        if (entry.source === 'captured') captured++
        else if (entry.source === 'marked') marked++
      }
  parts.push(`${formatNumber(captured)} captured`, `${formatNumber(marked)} by hand`)
  const unknown = props.progress.unknown.length
  if (unknown) parts.push(`${formatNumber(unknown)} newer than the game data`)
  return parts.join(' · ')
})
const reward = computed(() => props.captured.reward)
const stampsTitle = computed(() =>
  reward.value
    ? `Stamps toward reward ${formatNumber(reward.value.index + 1)}`
    : 'Not in a capture yet',
)
</script>

<template>
  <ul class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4" aria-label="Summary">
    <li class="flex min-w-0">
      <UiStat label="Done" :hint="doneTitle">
        <template #value>
          <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
            {{ formatNumber(progress.done)
            }}<span class="text-sm text-text-muted"> / {{ formatNumber(progress.total) }}</span>
          </span>
        </template>
        <UiProgress
          class="mt-1"
          :value="progress.done"
          :max="progress.total"
          label="Anecdotes done"
        />
      </UiStat>
    </li>
    <li class="flex min-w-0">
      <UiStat label="Stamps" :hint="stampsTitle">
        <template #value>
          <span v-if="reward" class="tabular truncate font-mono text-lg font-medium sm:text-xl">
            {{ formatNumber(reward.progress)
            }}<span class="text-sm text-text-muted"> / {{ formatNumber(reward.target) }}</span>
          </span>
          <span v-else class="font-mono text-lg font-medium text-text-muted sm:text-xl">—</span>
        </template>
        <UiProgress
          v-if="reward"
          class="mt-1"
          :value="reward.progress"
          :max="reward.target"
          label="Stamps toward the next reward"
        />
      </UiStat>
    </li>
    <li class="flex min-w-0">
      <UiStat
        label="Reward"
        :hint="`${formatNumber(rewardPrimogems)} primogems for every ${formatNumber(rewardEvery)} anecdotes recorded`"
      >
        <template #icon><img :src="primogem" alt="" class="size-4" /></template>
        <template #value>
          <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
            {{ formatNumber(rewardPrimogems)
            }}<span class="text-sm text-text-muted"> per {{ formatNumber(rewardEvery) }}</span>
          </span>
        </template>
      </UiStat>
    </li>
    <li class="flex min-w-0">
      <UiStat
        label="Active"
        :value="progress.active"
        exact
        hint="Going on now in the game (in the newest capture)"
      />
    </li>
  </ul>
</template>
