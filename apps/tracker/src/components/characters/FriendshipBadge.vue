<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'

/**
 * Friendship as the game words it: "Friendship 10". `bare` is the number alone
 * (a "Friendship" column). `exp` and `need` (toward the next level) join the tooltip.
 */
const props = defineProps<{
  level: number
  bare?: boolean
  exp?: number | null
  need?: number | null
}>()
const title = computed(() => {
  const base = t('characters.friendship.title', { level: props.level })
  if (props.exp == null || props.need == null) return base
  return `${base} · ${t('game.expProgress', { exp: formatNumber(props.exp), need: formatNumber(props.need) })}`
})
</script>

<template>
  <span class="inline-flex items-baseline gap-1 whitespace-nowrap" :title="title">
    <span v-if="!bare">{{ $t('game.friendship') }}</span>
    <span class="tabular font-mono" :class="level >= 10 ? 'font-semibold text-text-primary' : ''">{{
      level
    }}</span>
  </span>
</template>
