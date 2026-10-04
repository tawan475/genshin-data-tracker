<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber } from '@/lib/format'
import ChangeValue from './ChangeValue.vue'

/**
 * Unlocked, unequipped 4★ and 3★ artifacts with their change since the
 * previous snapshot. Sits in a row of StatTile.
 */
const props = defineProps<{
  artifact4: number
  artifact3: number
  /** undefined while loading, null when not measurable. */
  delta4?: number | null
  delta3?: number | null
}>()

const rows = computed(() => [
  { rarity: 4, value: formatNumber(props.artifact4), delta: props.delta4 },
  { rarity: 3, value: formatNumber(props.artifact3), delta: props.delta3 },
])
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1 rounded-xl border border-border-default bg-surface-raised p-4"
  >
    <span class="text-sm text-text-secondary" title="Unlocked, unequipped">4★ / 3★ Artifact</span>
    <dl class="flex flex-col">
      <div v-for="row in rows" :key="row.rarity" class="flex items-baseline gap-2">
        <dt
          class="w-7 shrink-0 text-sm"
          :class="row.rarity === 4 ? 'text-rarity-4' : 'text-rarity-3'"
        >
          <span aria-hidden="true">{{ row.rarity }}★</span>
          <span class="sr-only">{{ row.rarity }}-star</span>
        </dt>
        <dd class="flex min-w-0 items-baseline gap-2">
          <span class="tabular font-mono text-xl font-medium">{{ row.value }}</span>
          <ChangeValue
            v-if="row.delta !== undefined && row.delta !== null"
            :value="row.delta"
            hint="since previous snapshot"
            class="text-sm"
          />
        </dd>
      </div>
    </dl>
  </div>
</template>
