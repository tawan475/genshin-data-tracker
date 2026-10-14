<script setup lang="ts">
import { computed } from 'vue'
import {
  ARTIFACT_CV_TIERS,
  BUILD_CV_TIERS,
  CRIT_TIER_TEXT,
  cvTier,
  tierBounds,
  type CvScope,
} from '@/lib/crit-tiers'
import { t } from '@/i18n'

/**
 * A crit value in its tier colour (akasha.cv's tiers, lib/crit-tiers): one
 * artifact's by default, `scope="build"` for five pieces added up. Pass
 * `crit-circlet` for a circlet with a CRIT main stat (tiered 7.77 higher).
 * `label` writes "CV" before it; `detail` adds a tooltip line. `plain`
 * drops the tier colour (secondary text): the tiers are 5★ scales, so 1–4★
 * pieces show theirs plain.
 */
const props = withDefaults(
  defineProps<{
    value: number
    scope?: CvScope
    critCirclet?: boolean
    label?: boolean
    detail?: string
    plain?: boolean
  }>(),
  { scope: 'artifact', detail: undefined },
)

const tier = computed(() => cvTier(props.value, props.scope, props.critCirclet))
const title = computed(() =>
  [
    t('ui.crit.title', { value: props.value.toFixed(1) }),
    props.detail,
    props.plain
      ? ''
      : `${tierBounds(props.scope === 'build' ? BUILD_CV_TIERS : ARTIFACT_CV_TIERS)}` +
        (props.critCirclet ? t('ui.crit.circlet') : ''),
  ]
    .filter(Boolean)
    .join('\n'),
)
</script>

<template>
  <span class="tabular font-mono whitespace-nowrap" :title="title">
    <span v-if="label" class="text-text-secondary">CV </span>
    <span :class="plain ? 'text-text-secondary' : CRIT_TIER_TEXT[tier]">{{
      value.toFixed(1)
    }}</span>
  </span>
</template>
