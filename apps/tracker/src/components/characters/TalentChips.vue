<script setup lang="ts">
import { computed } from 'vue'

/** Attack / skill / burst levels as three small chips; a crowned 10 is gold. */
const props = defineProps<{ talent: { auto: number; skill: number; burst: number } }>()

const levels = computed(() => [props.talent.auto, props.talent.skill, props.talent.burst])
const title = computed(
  () => `Attack ${props.talent.auto} · Skill ${props.talent.skill} · Burst ${props.talent.burst}`,
)
</script>

<template>
  <span class="inline-flex gap-1" role="img" :aria-label="title" :title="title">
    <span
      v-for="(level, index) in levels"
      :key="index"
      class="tabular inline-flex h-6 min-w-7 items-center justify-center rounded-md bg-surface-overlay px-1 font-mono text-sm leading-none"
      :class="
        level >= 10
          ? 'font-semibold text-rarity-5'
          : level >= 9
            ? 'font-medium text-text-primary'
            : 'text-text-secondary'
      "
      >{{ level }}</span
    >
  </span>
</template>
