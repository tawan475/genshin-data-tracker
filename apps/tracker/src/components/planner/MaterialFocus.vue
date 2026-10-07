<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { gameIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { materialName } from '@/utils/materials'
import { fromTouch, useItemPopover } from './item-popover'
import { optionName, type FocusRow, type MaterialOption } from './material-filter'
import { materialSoft } from './material-soft'

/**
 * The line above the cards while the Goals tab shows the goals using a
 * material: its icon and name, then have / need of the goals shown (a
 * family tier by tier, EXP in points), green when held, amber when short;
 * the tooltips say what is missing after crafting, each goal after the
 * counted goals above it. A tier opens the inventory editor; × clears.
 */
const props = defineProps<{
  option: MaterialOption
  rows: readonly FocusRow[]
  /** Goals shown. */
  goals: number
}>()
defineEmits<{ clear: [] }>()
const openItem = useItemPopover()

const name = computed(() => optionName(props.option, materialName))
/** A family shows each tier's icon; one material or the EXP only the numbers. */
const tiers = computed(() => props.option.members.length > 1 && !props.option.exp)

function rowTitle(row: FocusRow): string {
  const exp = props.option.exp
  const parts = [
    exp ? name.value : materialName(row.material.key),
    `Need ${formatNumber(row.need)}`,
    `Have ${formatNumber(row.have)}`,
  ]
  if (row.crafted) parts.push(`Craft ${formatNumber(row.crafted)}`)
  if (row.missing > 0) {
    parts.push(`Missing ${formatNumber(row.missing)}`)
  } else parts.push('Enough')
  return parts.join(' · ')
}

const title = computed(
  () =>
    `${name.value}: ${formatNumber(props.goals)} ${props.goals === 1 ? 'goal' : 'goals'}, each after the counted goals above it`,
)

function open(row: FocusRow, event: MouseEvent) {
  openItem?.({
    key: row.material.key,
    anchor: event.currentTarget as HTMLElement,
    touch: fromTouch(event),
  })
}
</script>

<template>
  <section
    class="flex scroll-mt-24 items-center gap-2 rounded-xl border border-accent-text/40 bg-surface-raised py-1 pr-1 pl-1.5 shadow-sm"
    :aria-label="title"
  >
    <span
      class="size-10 shrink-0 overflow-hidden rounded-lg text-xs"
      :class="materialSoft(option.face.key, option.face.rarity)"
      :title="title"
    >
      <MaterialIcon :src="gameIcon(option.face.icon)" :name="name" />
    </span>
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
      <span class="min-w-0 truncate font-semibold" :title="title">{{ name }}</span>
      <ul v-if="rows.length" class="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <li v-for="row in rows" :key="row.material.key">
          <component
            :is="openItem ? 'button' : 'span'"
            :type="openItem ? 'button' : undefined"
            class="tabular inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-mono text-sm"
            :class="openItem ? 'transition-colors hover:bg-surface-overlay' : ''"
            :title="rowTitle(row)"
            :aria-haspopup="openItem ? 'dialog' : undefined"
            @click="open(row, $event)"
          >
            <span
              v-if="tiers"
              class="size-6 shrink-0 overflow-hidden rounded text-[0.5rem]"
              :class="materialSoft(row.material.key, row.material.rarity)"
            >
              <MaterialIcon :src="gameIcon(row.material.icon)" :name="row.material.name" />
            </span>
            <span aria-hidden="true"
              ><span
                class="font-semibold"
                :class="row.missing > 0 ? 'text-warning-text' : 'text-success-text'"
                >{{ formatCompact(row.have) }}</span
              ><span class="text-text-muted">/{{ formatCompact(row.need) }}</span></span
            >
            <span class="sr-only">{{ rowTitle(row) }}</span>
          </component>
        </li>
      </ul>
    </div>
    <UiIconButton :label="`Clear ${name}`" @click="$emit('clear')">
      <X class="size-5" aria-hidden="true" />
    </UiIconButton>
  </section>
</template>
