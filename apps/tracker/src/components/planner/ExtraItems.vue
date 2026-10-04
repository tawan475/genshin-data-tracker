<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { PlanGoal } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { Eye, EyeOff, Plus } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import {
  costCheck,
  itemRequirement,
  type CostState,
  type CostStatus,
  type ItemGoalView,
} from './model'

/**
 * Extra item needs on the Goals tab: one compact row each (count coloured
 * like a goal's cost), the eye counts it in the totals or not, the row
 * opens the editor.
 */
const props = defineProps<{
  items: readonly ItemGoalView[]
  planner: PlannerData
  /** Every goal of the board, item needs included. */
  goals: readonly PlanGoal[]
  inventory: Readonly<Record<string, number>>
}>()
const emit = defineEmits<{ open: [key: string]; toggle: [item: ItemGoalView]; add: [] }>()

const TONE: Record<CostStatus, string> = {
  all: 'text-success-text',
  alone: 'text-warning-text',
  short: 'text-danger-text',
}
const MEANING: Record<CostStatus, string> = {
  all: 'enough for all goals',
  alone: 'enough for this need alone',
  short: 'short',
}

/** The item's cost state: as Mora or EXP when that is what it adds up to. */
function itemState(item: ItemGoalView): CostState | null {
  if (!item.material) return null
  const r = itemRequirement(props.planner, item.key, item.target.count)
  const others = props.goals.filter((g) => g.id !== item.id)
  const check = costCheck(props.planner, [r], others, props.inventory)
  if (r.mora) return check.mora
  if (r.characterExp) return check.characterExp
  if (r.weaponExp) return check.weaponExp
  return check.item(item.key)
}

const rows = computed(() =>
  props.items.map((item) => {
    const state = itemState(item)
    const icon =
      item.key === props.planner.mora.key
        ? materialIcon('Mora')
        : gameIcon(item.material?.icon ?? '')
    const parts = [
      `${item.name} ×${formatNumber(item.target.count)}`,
      `have ${formatNumber(item.have)}`,
    ]
    if (state?.crafted) parts.push(`craft ${formatNumber(state.crafted)}`)
    parts.push(state ? MEANING[state.status] : 'not in the planner data')
    return { item, icon, status: state?.status ?? null, title: parts.join(' · ') }
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
            :class="RARITY_SOFT[row.item.material?.rarity ?? 0] ?? 'bg-surface-sunken'"
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
            <span
              class="text-sm font-semibold"
              :class="row.status ? TONE[row.status] : 'text-text-muted'"
              >{{ formatCompact(row.item.target.count) }}</span
            >
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
