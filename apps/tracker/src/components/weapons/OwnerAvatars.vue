<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import { characterIcon } from '@/lib/assets'

/** Who wears copies of a weapon: overlapping portraits, "+N" past `max`. */
const props = withDefaults(
  defineProps<{ owners: { key: string; name: string }[]; max?: number }>(),
  { max: 3 },
)

const shown = computed(() => props.owners.slice(0, props.max))
const extra = computed(() => props.owners.length - shown.value.length)
const names = computed(() => props.owners.map((o) => o.name).join(', '))
</script>

<template>
  <span v-if="owners.length" class="inline-flex shrink-0 items-center" :title="names">
    <span class="sr-only">Equipped by {{ names }}</span>
    <span class="flex -space-x-2" aria-hidden="true">
      <GameIcon
        v-for="owner in shown"
        :key="owner.key"
        :src="characterIcon(owner.key)"
        :name="owner.name"
        size="xs"
        class="rounded-full! ring-2 ring-surface-raised"
      />
    </span>
    <span
      v-if="extra > 0"
      class="tabular ml-1 font-mono text-xs text-text-secondary"
      aria-hidden="true"
      >+{{ extra }}</span
    >
  </span>
</template>
