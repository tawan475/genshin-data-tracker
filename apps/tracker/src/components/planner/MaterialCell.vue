<script setup lang="ts">
import type { MaterialLine } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { formatCompact, formatNumber } from '@/lib/format'
import { gameIcon } from '@/lib/assets'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { fromTouch, useItemPopover } from './item-popover'

/**
 * One material of a farming group: the icon, what is still missing (or a
 * check), and have / need underneath. On the Planner it is a button that
 * opens the inventory editor (name, crafting, counts).
 */
const props = withDefaults(defineProps<{ line: MaterialLine; size?: 'md' | 'sm' }>(), {
  size: 'md',
})
const openItem = useItemPopover()

const title = computed(() => {
  const l = props.line
  const parts = [l.material.name, `Need ${formatNumber(l.need)}`, `Have ${formatNumber(l.have)}`]
  if (l.crafted) parts.push(`Craft ${formatNumber(l.crafted)}`)
  if (l.spent) parts.push(`Used to craft ${formatNumber(l.spent)}`)
  if (l.converted) parts.push(`Converted from others ${formatNumber(l.converted)}`)
  if (l.convertedAway) parts.push(`Converted into others ${formatNumber(l.convertedAway)}`)
  if (l.missing) parts.push(`Missing ${formatNumber(l.missing)}`)
  return parts.join(' · ')
})

function open(event: MouseEvent) {
  openItem?.({
    key: props.line.material.key,
    anchor: event.currentTarget as HTMLElement,
    touch: fromTouch(event),
  })
}
</script>

<template>
  <component
    :is="openItem ? 'button' : 'div'"
    :type="openItem ? 'button' : undefined"
    class="flex flex-col items-center gap-1 rounded-lg"
    :class="[
      size === 'sm' ? 'w-12' : 'w-16',
      openItem ? 'transition-colors hover:bg-surface-overlay focus-visible:bg-surface-overlay' : '',
    ]"
    :title="title"
    :aria-haspopup="openItem ? 'dialog' : undefined"
    @click="open"
  >
    <span
      class="overflow-hidden rounded-lg text-xs"
      :class="[
        size === 'sm' ? 'size-9' : 'size-12',
        RARITY_SOFT[line.material.rarity] ?? 'bg-surface-sunken',
      ]"
    >
      <MaterialIcon :src="gameIcon(line.material.icon)" :name="line.material.name" />
    </span>
    <span
      class="tabular font-mono leading-4 font-semibold"
      :class="[
        size === 'sm' ? 'text-xs' : 'text-sm',
        line.missing > 0
          ? 'text-warning-text'
          : line.need > 0
            ? 'text-success-text'
            : 'text-text-muted',
      ]"
    >
      {{ line.missing > 0 ? formatCompact(line.missing) : line.need > 0 ? '✓' : '–' }}
    </span>
    <span class="tabular font-mono text-[0.6875rem] leading-3 text-text-muted">
      {{ formatCompact(line.have)
      }}<template v-if="line.need > 0">/{{ formatCompact(line.need) }}</template>
    </span>
    <span class="sr-only">{{ title }}</span>
  </component>
</template>
