<script setup lang="ts">
import type { InferredRoll } from '@/utils/artifact-rolls'
import { formatRollValue } from '@/utils/artifact-stats'
import { rollBarClass, rollFillPercent } from './styles'

/** One bar per roll of a substat, filled by roll size (the old GO SmolProgress look). */
defineProps<{
  statKey: string
  rolls: readonly InferredRoll[]
  rarity: number
}>()
</script>

<template>
  <div v-if="rolls.length" class="flex items-stretch gap-0.5 h-3.5 shrink-0">
    <div
      v-for="(roll, i) in rolls"
      :key="`${i}-${roll.value}`"
      class="w-[5px] rounded-sm overflow-hidden bg-slate-200 dark:bg-slate-700 relative"
      :title="`Roll: ${formatRollValue(statKey, roll.value)}`"
    >
      <div
        class="absolute bottom-0 left-0 right-0 transition-all"
        :class="rollBarClass(roll)"
        :style="{ height: `${rollFillPercent(roll, statKey, rarity)}%` }"
      />
    </div>
  </div>
</template>
