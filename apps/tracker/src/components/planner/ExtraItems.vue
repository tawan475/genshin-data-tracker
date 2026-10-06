<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { goalStatus, type StockStatus } from '@gdt/game-data/planner-goals'
import {
  itemGoal,
  type PlanGoal,
  type PlanOptions,
  type PlanTotals,
} from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { Eye, EyeOff, Plus } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { STOCK_MEANING, STOCK_TONE } from './farm-format'
import { materialSoft } from './material-soft'
import type { ItemGoalView } from './model'

/**
 * Extra item needs on the Goals tab: one compact row each (count coloured
 * like a goal's cost), the eye counts it in the totals or not, the row
 * opens the editor.
 */
const props = defineProps<{
  items: readonly ItemGoalView[]
  planner: PlannerData
  /** Every goal of the board, item needs included, and their totals. */
  goals: readonly PlanGoal[]
  totals: PlanTotals
  inventory: Readonly<Record<string, number>>
  options: PlanOptions
}>()
const emit = defineEmits<{ open: [key: string]; toggle: [item: ItemGoalView]; add: [] }>()

/** The item's stock state: as Mora or EXP when that is what it adds up to. */
function itemStatus(item: ItemGoalView): StockStatus {
  const goal = itemGoal(props.planner, item.key, item.target)
  const status = goalStatus(props.planner, goal, props.inventory, {
    ...props.options,
    all: props.totals,
    goals: props.goals,
  })
  return status.overall
}

const rows = computed(() =>
  props.items.map((item) => {
    const status = itemStatus(item)
    const icon =
      item.key === props.planner.mora.key
        ? materialIcon('Mora')
        : item.material
          ? gameIcon(item.material.icon)
          : materialIcon(item.key)
    const crafted = props.totals.lines.get(item.key)?.crafted ?? 0
    const parts = [
      `${item.name} ×${formatNumber(item.target.count)}`,
      `have ${formatNumber(item.have)}`,
      crafted && item.target.active ? `craft ${formatNumber(crafted)}` : '',
      STOCK_MEANING[status],
    ]
    return { item, icon, status, title: parts.filter(Boolean).join(' · ') }
  }),
)
</script>

<template>
  <section aria-label="Extra">
    <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-text-secondary">
      Extra
      <span class="tabular font-mono font-normal text-text-muted">{{ items.length }}</span>
      <button
        type="button"
        class="ml-1 inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        aria-label="Add item"
        title="Add item"
        @click="emit('add')"
      >
        <Plus class="size-4" aria-hidden="true" />
      </button>
    </h2>
    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <li
        v-for="row in rows"
        :key="row.item.id"
        class="flex items-center gap-1 rounded-xl border border-border-default bg-surface-raised py-1.5 pr-1.5 pl-2 shadow-sm transition-colors hover:border-border-strong"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          class="flex min-w-0 flex-1 items-center gap-3 text-left"
          :class="row.item.target.active ? '' : 'opacity-50'"
          :title="row.title"
          @click="emit('open', row.item.key)"
        >
          <span
            class="size-10 shrink-0 overflow-hidden rounded-lg text-xs"
            :class="materialSoft(row.item.key, row.item.material?.rarity)"
          >
            <MaterialIcon :src="row.icon" :name="row.item.name" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium">{{ row.item.name }}</span>
            <span v-if="row.item.target.note" class="truncate text-xs text-text-muted">{{
              row.item.target.note
            }}</span>
          </span>
          <span class="tabular flex shrink-0 flex-col items-end font-mono leading-tight">
            <span class="text-sm font-semibold" :class="STOCK_TONE[row.status]">{{
              formatCompact(row.item.target.count)
            }}</span>
            <span class="text-xs text-text-muted">{{ formatCompact(row.item.have) }}</span>
          </span>
          <span class="sr-only">{{ row.title }}</span>
        </button>
        <button
          type="button"
          class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          :aria-pressed="row.item.target.active"
          :aria-label="`${row.item.name}: ${row.item.target.active ? 'Counted' : 'Not counted'}`"
          :title="row.item.target.active ? 'Counted' : 'Not counted'"
          @click="emit('toggle', row.item)"
        >
          <Eye v-if="row.item.target.active" class="size-5" aria-hidden="true" />
          <EyeOff v-else class="size-5" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
</template>
