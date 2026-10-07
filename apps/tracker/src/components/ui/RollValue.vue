<script setup lang="ts">
import { computed } from 'vue'
import {
  BUILD_RV_TIERS,
  CRIT_TIER_TEXT,
  RV_TIERS,
  rvTier,
  tierBounds,
  type CvScope,
} from '@/lib/crit-tiers'

/**
 * A roll value ("640%") in its tier colour (akasha.cv's RV tiers,
 * lib/crit-tiers): every substat roll as a % of that stat's highest roll,
 * added up. `label` writes "RV" before it; `plain` drops the tier colour
 * (the tiers are 5★ scales, so 1–4★ pieces show theirs plain).
 * `scope="build"` tiers five pieces added up.
 */
const props = withDefaults(
  defineProps<{ value: number; label?: boolean; plain?: boolean; scope?: CvScope }>(),
  { scope: 'artifact' },
)

const tier = computed(() => rvTier(props.value, props.scope))
const title = computed(
  () =>
    `RV ${props.value}% · rolls as % of the highest roll, added up` +
    (props.plain ? '' : `\n${tierBounds(props.scope === 'build' ? BUILD_RV_TIERS : RV_TIERS)}`),
)
</script>

<template>
  <span class="tabular font-mono whitespace-nowrap" :title="title">
    <span v-if="label" class="text-text-secondary">RV </span>
    <span :class="plain ? 'text-text-secondary' : CRIT_TIER_TEXT[tier]">{{ value }}%</span>
  </span>
</template>
