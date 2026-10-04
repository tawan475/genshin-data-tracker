<script setup lang="ts">
import { computed } from 'vue'
import UiStat from '@/components/ui/UiStat.vue'
import { formatNumber } from '@/lib/format'
import ChangeValue from './ChangeValue.vue'

/**
 * Unlocked, unequipped 4★ and 3★ artifacts with their change since the
 * previous snapshot: a stat tile with two rows.
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
  <UiStat label="4★ / 3★ Artifact" hint="Unlocked, unequipped">
    <template #value>
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
            <span class="tabular font-mono text-lg font-medium sm:text-xl">{{ row.value }}</span>
            <ChangeValue
              v-if="row.delta !== undefined && row.delta !== null"
              :value="row.delta"
              hint="since previous snapshot"
              class="text-sm"
            />
          </dd>
        </div>
      </dl>
    </template>
  </UiStat>
</template>
