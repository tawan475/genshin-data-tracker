<script setup lang="ts">
import { computed } from 'vue'
import {
  getRollColorIndex,
  inferSubstatRolls,
  rollFillPercent,
  ROLL_BAR_COLORS,
} from '../utils/artifact-rolls'

const props = defineProps<{
  statKey: string
  value: number
  rarity?: number
}>()

const rolls = computed(() =>
  inferSubstatRolls(props.statKey, props.value, props.rarity ?? 5),
)

function barColor(rollValue: number): string {
  const idx = getRollColorIndex(rollValue, props.statKey, props.rarity ?? 5)
  return ROLL_BAR_COLORS[idx] ?? ROLL_BAR_COLORS[1]
}

function fillPct(rollValue: number): number {
  return rollFillPercent(rollValue, props.statKey, props.rarity ?? 5)
}
</script>

<template>
  <div v-if="rolls.length" class="flex items-stretch gap-0.5 h-3.5 shrink-0">
    <div
      v-for="(roll, i) in rolls"
      :key="`${i}-${roll}`"
      class="w-[5px] rounded-sm overflow-hidden bg-slate-200 dark:bg-slate-700 relative"
      :title="`Roll: ${roll}`"
    >
      <div
        class="absolute bottom-0 left-0 right-0 transition-all"
        :class="barColor(roll)"
        :style="{ height: `${fillPct(roll)}%` }"
      />
    </div>
  </div>
</template>
