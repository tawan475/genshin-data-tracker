<script setup lang="ts">
import type { MaterialLine } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { formatCompact, formatNumber } from '@/lib/format'
import { gameIcon } from '@/lib/assets'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'

/**
 * One material of a farming group: the icon, what is still missing (or a
 * check), and have / need underneath. Crafting details in the tooltip.
 */
const props = defineProps<{ line: MaterialLine }>()

const title = computed(() => {
  const l = props.line
  const parts = [l.material.name, `Need ${formatNumber(l.need)}`, `Have ${formatNumber(l.have)}`]
  if (l.crafted) parts.push(`Craft ${formatNumber(l.crafted)}`)
  if (l.spent) parts.push(`Used to craft ${formatNumber(l.spent)}`)
  if (l.missing) parts.push(`Missing ${formatNumber(l.missing)}`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="flex w-16 flex-col items-center gap-1" :title="title">
    <span
      class="size-12 overflow-hidden rounded-lg text-xs"
      :class="RARITY_SOFT[line.material.rarity] ?? 'bg-surface-sunken'"
    >
      <MaterialIcon :src="gameIcon(line.material.icon)" :name="line.material.name" />
    </span>
    <span
      class="tabular font-mono text-sm leading-4 font-semibold"
      :class="
        line.missing > 0
          ? 'text-warning-text'
          : line.need > 0
            ? 'text-success-text'
            : 'text-text-muted'
      "
    >
      {{ line.missing > 0 ? formatCompact(line.missing) : line.need > 0 ? '✓' : '–' }}
    </span>
    <span class="tabular font-mono text-[0.6875rem] leading-3 text-text-muted">
      {{ formatCompact(line.have)
      }}<template v-if="line.need > 0">/{{ formatCompact(line.need) }}</template>
    </span>
    <span class="sr-only">{{ title }}</span>
  </div>
</template>
