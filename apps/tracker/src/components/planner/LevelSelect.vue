<script setup lang="ts">
import type { AscensionPhase } from '@gdt/game-data'
import { levelMilestones } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import UiSelect from '@/components/ui/UiSelect.vue'

/**
 * Level + ascension as one choice: 1, 20, 20+, 40, 40+, … 90 ("+" is
 * ascended at that cap). A stored pair that is not a milestone is kept as
 * an option of its own.
 */
const props = defineProps<{ phases: readonly AscensionPhase[]; label: string }>()
const level = defineModel<number>('level', { required: true })
const ascension = defineModel<number>('ascension', { required: true })

const options = computed(() => {
  const list = levelMilestones(props.phases)
  if (!list.some((m) => m.level === level.value && m.ascension === ascension.value)) {
    list.push({ level: level.value, ascension: ascension.value })
    list.sort((a, b) => a.level - b.level || a.ascension - b.ascension)
  }
  return list.map((m) => {
    const ascended = m.ascension > 0 && props.phases[m.ascension - 1]?.cap === m.level
    return { value: `${m.level}/${m.ascension}`, label: `${m.level}${ascended ? '+' : ''}` }
  })
})

const value = computed({
  get: () => `${level.value}/${ascension.value}`,
  set: (v: string) => {
    const [l, a] = v.split('/').map(Number)
    level.value = l ?? 1
    ascension.value = a ?? 0
  },
})
</script>

<template>
  <UiSelect v-model="value" :options="options" :aria-label="label" />
</template>
