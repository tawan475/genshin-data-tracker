<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUp } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import type { RefineInfo } from '@/data/weapons'

/** "R1→R3": spare copies could refine an equipped one. Details in the tooltip. */
const props = defineProps<{ refine: RefineInfo }>()

const first = computed(() => props.refine.targets[0]!)
const title = computed(
  () =>
    `${props.refine.spare} spare · ` +
    props.refine.targets.map((t) => `${t.ownerName} R${t.from} → R${t.to}`).join(' · '),
)
</script>

<template>
  <UiBadge tone="success" mono class="shrink-0 gap-0.5" :title="title">
    <ArrowUp class="size-3" aria-hidden="true" />
    R{{ first.from }}→R{{ first.to }}
    <span class="sr-only">possible: {{ title }}</span>
  </UiBadge>
</template>
