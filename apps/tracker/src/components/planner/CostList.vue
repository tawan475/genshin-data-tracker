<script setup lang="ts">
import type { PlannerData, PlannerMaterial } from '@gdt/game-data'
import { goalStatus, type StockStatus } from '@gdt/game-data/planner-goals'
import {
  expItemMix,
  passiveDiscount,
  type PlanGoal,
  type PlanOptions,
  type Requirement,
} from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { characterName, mergeRequirements } from './model'
import { STOCK_MEANING, STOCK_TONE } from './farm-format'
import { fromTouch, useItemPopover } from './item-popover'

/**
 * What a goal costs, as item tiles: materials by kind and tier, EXP as
 * books / ores, then Mora. Each count is coloured by what the bag covers
 * (`goalStatus`): every counted goal with this one, this one alone, or not
 * even that. On the Planner each tile opens the inventory editor, which
 * shows what this goal (`label`) needs of it.
 */
const props = defineProps<{
  planner: PlannerData
  requirements: readonly Requirement[]
  /** The other goals (the totals' goals without these). */
  others: readonly PlanGoal[]
  inventory: Readonly<Record<string, number>>
  options: PlanOptions
  /** The goal's name, for the inventory editor. */
  label?: string
}>()
const openItem = useItemPopover()

function open(key: string, event: MouseEvent) {
  openItem?.({
    key,
    anchor: event.currentTarget as HTMLElement,
    touch: fromTouch(event),
    context: {
      label: props.label ?? '',
      requirement: mergeRequirements(props.planner, props.requirements, owned.value),
    },
  })
}

const KIND_ORDER = [
  'gem',
  'boss',
  'local',
  'common',
  'book',
  'weekly',
  'crown',
  'weapon',
  'elite',
  'currency',
]

interface Cell {
  key: string
  name: string
  icon: string
  rarity: number
  count: number
  status: StockStatus
  title: string
}

const owned = computed(() =>
  props.options.passives ? new Set<string>(props.options.passives) : null,
)

const cells = computed<Cell[]>(() => {
  const merged = mergeRequirements(props.planner, props.requirements, owned.value)
  const goal: PlanGoal = { id: 'self', requirement: merged }
  const status = goalStatus(props.planner, goal, props.inventory, {
    ...props.options,
    goals: props.others,
  })
  const materials = [...merged.items]
    .map(([key, count]) => ({ material: props.planner.materialsByKey.get(key), key, count }))
    .filter((x): x is { material: PlannerMaterial; key: string; count: number } => !!x.material)
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.material.kind) - KIND_ORDER.indexOf(b.material.kind) ||
        (a.material.family?.key ?? a.key).localeCompare(b.material.family?.key ?? b.key) ||
        a.material.tier - b.material.tier,
    )
  const cell = (material: PlannerMaterial, count: number, s: StockStatus, extra = ''): Cell => ({
    key: material.key,
    name: material.name,
    icon: gameIcon(material.icon),
    rarity: material.rarity,
    count,
    status: s,
    title: [`${material.name} ×${formatNumber(count)}`, STOCK_MEANING[s], extra]
      .filter(Boolean)
      .join(' · '),
  })
  const list = materials.map(({ material, count }) =>
    cell(material, count, status.items.get(material.key) ?? 'all'),
  )
  for (const item of expItemMix(merged.characterExp, props.planner.expItems.character)) {
    list.push(cell(item.material, item.count, status.characterExp ?? 'all'))
  }
  for (const item of expItemMix(merged.weaponExp, props.planner.expItems.weapon)) {
    list.push(cell(item.material, item.count, status.weaponExp ?? 'all'))
  }
  if (merged.mora > 0) {
    // What owned characters' passives take off weapon ascensions.
    const saved = owned.value
      ? props.requirements
          .map((r) => passiveDiscount(props.planner, r, owned.value!))
          .filter((d) => d.character && d.mora > 0)
          .map((d) => `${characterName(d.character!)} saves ${formatNumber(d.mora)}`)
          .join(' · ')
      : ''
    list.push({
      ...cell(props.planner.mora, merged.mora, status.mora ?? 'all', saved),
      icon: materialIcon('Mora'),
    })
  }
  return list
})
</script>

<template>
  <ul v-if="cells.length" class="flex flex-wrap gap-x-1.5 gap-y-2">
    <li v-for="c in cells" :key="c.key" class="w-14" :title="c.title">
      <component
        :is="openItem ? 'button' : 'span'"
        :type="openItem ? 'button' : undefined"
        class="flex w-full flex-col items-center gap-0.5 rounded-lg"
        :class="openItem ? 'transition-colors hover:bg-surface-overlay' : ''"
        :aria-haspopup="openItem ? 'dialog' : undefined"
        @click="open(c.key, $event)"
      >
        <span
          class="size-11 overflow-hidden rounded-lg text-xs"
          :class="RARITY_SOFT[c.rarity] ?? 'bg-surface-sunken'"
        >
          <MaterialIcon :src="c.icon" :name="c.name" />
        </span>
        <span class="tabular font-mono text-xs font-medium" :class="STOCK_TONE[c.status]">{{
          formatCompact(c.count)
        }}</span>
        <span class="sr-only">{{ c.title }}</span>
      </component>
    </li>
  </ul>
  <p v-else class="text-sm text-text-muted">Nothing to spend</p>
</template>
