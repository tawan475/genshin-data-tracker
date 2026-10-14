<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { ArrowUp } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import type { RefineInfo } from '@/data/weapons'

/** "R1→R3": spare copies could refine an equipped one. Details in the tooltip. */
const props = defineProps<{ refine: RefineInfo }>()

const first = computed(() => props.refine.targets[0]!)
const title = computed(() =>
  [
    t('weapons.refine.spare', { n: props.refine.spare }),
    ...props.refine.targets.map((target) => `${target.ownerName} R${target.from} → R${target.to}`),
  ].join(' · '),
)
</script>

<template>
  <UiBadge tone="success" mono class="shrink-0 gap-0.5" :title="title">
    <ArrowUp class="size-3" aria-hidden="true" />
    R{{ first.from }}→R{{ first.to }}
    <span class="sr-only">{{ $t('weapons.refine.possible', { title }) }}</span>
  </UiBadge>
</template>
