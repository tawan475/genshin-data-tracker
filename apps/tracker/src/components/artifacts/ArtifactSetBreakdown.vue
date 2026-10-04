<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import type { SetOption } from '@/data/artifacts'
import { artifactSetIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * The biggest sets among the current matches as icon + count chips (name in
 * the tooltip); picking one filters to it. One row that scrolls sideways when
 * it does not fit.
 */
const props = withDefaults(
  defineProps<{ sets: SetOption[]; selected: readonly string[]; limit?: number }>(),
  { limit: 8 },
)
const emit = defineEmits<{ toggle: [key: string] }>()

const top = computed(() => props.sets.slice(0, props.limit))
const rest = computed(() => props.sets.length - top.value.length)
</script>

<template>
  <div
    class="-my-1 flex min-w-0 items-center gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none]"
    role="group"
    aria-label="Top sets"
  >
    <button
      v-for="set in top"
      :key="set.key"
      type="button"
      class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border py-1 pr-2.5 pl-1 text-sm transition-colors hover:bg-surface-overlay"
      :class="selected.includes(set.key) ? 'border-accent-text' : 'border-border-default'"
      :aria-pressed="selected.includes(set.key)"
      :aria-label="`${set.name}, ${set.count}`"
      :title="set.name"
      @click="emit('toggle', set.key)"
    >
      <GameIcon :src="artifactSetIcon(set.key)" :name="set.name" size="sm" aria-hidden="true" />
      <span class="tabular font-mono">{{ formatNumber(set.count) }}</span>
    </button>
    <span
      v-if="rest > 0"
      class="tabular shrink-0 font-mono text-sm text-text-muted"
      :title="`${rest} more sets`"
    >
      +{{ formatNumber(rest) }}
    </span>
  </div>
</template>
