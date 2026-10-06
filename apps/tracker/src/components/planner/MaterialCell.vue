<script setup lang="ts">
import type { MaterialLine } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { formatCompact, formatNumber } from '@/lib/format'
import { gameIcon, materialIcon } from '@/lib/assets'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { fromTouch, useItemPopover } from './item-popover'
import { materialSoft } from './material-soft'

/**
 * One material of a farm card: the icon, what is still missing (or a
 * check), and have / need underneath (not at `xs`: the tooltip and the
 * editor have them). On the Planner it is a button that opens the
 * inventory editor (name, crafting, counts).
 */
const props = withDefaults(defineProps<{ line: MaterialLine; size?: 'md' | 'sm' | 'xs' }>(), {
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

/** Mora's game icon isn't on the image host: the material index's is. */
const src = computed(() =>
  props.line.material.key === 'Mora' ? materialIcon('Mora') : gameIcon(props.line.material.icon),
)

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
    class="flex flex-col items-center gap-0.5 rounded-lg"
    :class="[
      { md: 'w-16 gap-1', sm: 'w-12 gap-1', xs: 'w-10' }[size],
      openItem ? 'transition-colors hover:bg-surface-overlay focus-visible:bg-surface-overlay' : '',
    ]"
    :title="title"
    :aria-haspopup="openItem ? 'dialog' : undefined"
    @click="open"
  >
    <span
      class="overflow-hidden rounded-lg text-xs"
      :class="[
        { md: 'size-12', sm: 'size-9', xs: 'size-8' }[size],
        materialSoft(line.material.key, line.material.rarity),
      ]"
    >
      <MaterialIcon :src="src" :name="line.material.name" />
    </span>
    <span
      class="tabular font-mono leading-4 font-semibold"
      :class="[
        size === 'md' ? 'text-sm' : 'text-xs',
        line.missing > 0
          ? 'text-warning-text'
          : line.need > 0
            ? 'text-success-text'
            : 'text-text-muted',
      ]"
    >
      {{ line.missing > 0 ? formatCompact(line.missing) : line.need > 0 ? '✓' : '–' }}
    </span>
    <span v-if="size !== 'xs'" class="tabular font-mono text-[0.6875rem] leading-3 text-text-muted">
      {{ formatCompact(line.have)
      }}<template v-if="line.need > 0">/{{ formatCompact(line.need) }}</template>
    </span>
    <span class="sr-only">{{ title }}</span>
  </component>
</template>
