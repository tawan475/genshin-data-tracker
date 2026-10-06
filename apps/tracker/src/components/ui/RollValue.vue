<script setup lang="ts">
import { computed } from 'vue'
import { CRIT_TIER_TEXT, RV_TIERS, rvTier, tierBounds } from '@/lib/crit-tiers'

/**
 * A roll value ("640%") in its tier colour (akasha.cv's RV tiers,
 * lib/crit-tiers): every substat roll as a % of that stat's highest roll,
 * added up. `label` writes "RV" before it; `plain` drops the tier colour
 * (the tiers are 5★ scales, so 1–4★ pieces show theirs plain).
 */
const props = defineProps<{ value: number; label?: boolean; plain?: boolean }>()

const tier = computed(() => rvTier(props.value))
const title = computed(
  () =>
    `RV ${props.value}% · rolls as % of the highest roll, added up` +
    (props.plain ? '' : `\n${tierBounds(RV_TIERS)}`),
)
</script>

<template>
  <span class="tabular font-mono whitespace-nowrap" :title="title">
    <span v-if="label" class="text-text-secondary">RV </span>
    <span :class="plain ? 'text-text-secondary' : CRIT_TIER_TEXT[tier]">{{ value }}%</span>
  </span>
</template>
