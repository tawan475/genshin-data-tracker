<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { levelCap } from '@/lib/level'

/**
 * A character's or weapon's level as the game shows it: "Lv. 80/90", the
 * level over its ascension phase's cap. Below `target` (e.g. 90) the level
 * is in the warning colour. `bare` drops "Lv." (in a column headed "Lv").
 */
const props = defineProps<{ level: number; ascension: number; target?: number; bare?: boolean }>()

const cap = computed(() => levelCap(props.ascension, props.level))
const warn = computed(() => props.target !== undefined && props.level < props.target)
const title = computed(() =>
  t('ui.level.title', { level: props.level, cap: cap.value, ascension: props.ascension }),
)
</script>

<template>
  <span class="tabular font-mono whitespace-nowrap" :title="title">
    <span v-if="!bare" class="text-text-secondary">Lv. </span>
    <span :class="warn ? 'text-warning-text' : ''">{{ level }}</span>
    <span class="text-text-muted">/{{ cap }}</span>
  </span>
</template>
