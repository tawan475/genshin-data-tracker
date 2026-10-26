<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'
import UiProgress from './UiProgress.vue'

/** A short bar of EXP toward the next level; the numbers are in its tooltip. */
const props = defineProps<{ exp: number; need: number }>()
const label = computed(() =>
  t('game.expProgress', { exp: formatNumber(props.exp), need: formatNumber(props.need) }),
)
</script>

<template>
  <span class="inline-flex w-14 items-center" :title="label">
    <UiProgress :value="exp" :max="need" :label="label" class="!h-1.5" />
  </span>
</template>
