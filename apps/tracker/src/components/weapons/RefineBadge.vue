<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUp } from 'lucide-vue-next'
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
  <span
    class="tabular inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-mono text-xs font-medium text-success-text"
    :title="title"
  >
    <ArrowUp class="size-3" aria-hidden="true" />
    R{{ first.from }}→R{{ first.to }}
    <span class="sr-only">possible: {{ title }}</span>
  </span>
</template>
