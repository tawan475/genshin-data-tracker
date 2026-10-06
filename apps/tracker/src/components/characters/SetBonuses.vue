<script setup lang="ts">
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { setBonusTitle } from '@/data/character-build'
import type { SetCount } from '@/data/characters'
import { artifactSetIcon } from '@/lib/assets'

/**
 * The sets worn, most pieces first: icon, name and piece count, green once
 * it grants a bonus. The tooltip lists the stats each bonus adds.
 */
defineProps<{ sets: SetCount[] }>()

function title(set: SetCount): string {
  return [
    `${set.name} ×${set.count}`,
    ...setBonusTitle(set.setKey, set.active),
    set.active.length ? '' : `Bonus at ${set.thresholds[0] ?? 2} pieces`,
  ]
    .filter(Boolean)
    .join('\n')
}
</script>

<template>
  <ul class="flex min-w-0 flex-wrap gap-2" aria-label="Sets">
    <li
      v-for="set in sets"
      :key="set.setKey"
      class="flex min-w-0 items-center gap-2 rounded-lg border border-border-default bg-surface-raised py-1 pr-1.5 pl-1"
      :title="title(set)"
    >
      <GameIcon :src="artifactSetIcon(set.setKey)" :name="set.name" size="xs" />
      <span class="min-w-0 truncate text-sm">{{ set.name }}</span>
      <UiBadge :tone="set.active.length ? 'success' : 'neutral'" mono>
        {{ set.count }}
        <span class="sr-only">pieces{{ set.active.length ? ', bonus active' : '' }}</span>
      </UiBadge>
    </li>
  </ul>
</template>
