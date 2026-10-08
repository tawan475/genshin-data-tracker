<script setup lang="ts">
import { computed } from 'vue'
import { CONSTELLATION_MAX_STYLE } from './max-badges'

/**
 * Attack / skill / burst levels as three small chips, frosted so they sit on
 * a namecard in either theme; a crowned 10 is the game's gold chip (the C6
 * badge's, max-badges).
 */
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
      class="tabular inline-flex h-6 min-w-7 items-center justify-center rounded-md px-1 font-mono text-sm leading-none"
      :class="
        level >= 10
          ? 'font-bold'
          : [
              'bg-surface-raised/80 ring-1 ring-border-subtle backdrop-blur-sm',
              level >= 9 ? 'font-medium text-text-primary' : 'text-text-secondary',
            ]
      "
      :style="level >= 10 ? CONSTELLATION_MAX_STYLE : undefined"
      >{{ level }}</span
    >
  </span>
</template>
