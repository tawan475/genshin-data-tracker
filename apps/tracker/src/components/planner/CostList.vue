<script setup lang="ts">
import type { PlannerData, PlannerMaterial } from '@gdt/game-data'
import { expItemMix, type PlanGoal, type Requirement } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { costCheck, type CostState, type CostStatus } from './model'

/**
 * What some goals cost, as item tiles: materials by kind and tier, EXP as
 * books / ores, then Mora. Each count is coloured by what the bag covers:
 * every counted goal with this one, this one alone, or not even that.
 */
const props = defineProps<{
  planner: PlannerData
  requirements: readonly Requirement[]
  /** The other goals (the totals' goals without these). */
  others: readonly PlanGoal[]
  inventory: Readonly<Record<string, number>>
}>()

const KIND_ORDER = ['gem', 'boss', 'local', 'common', 'book', 'weekly', 'crown', 'weapon', 'elite']

const TONE: Record<CostStatus, string> = {
  all: 'text-success-text',
  alone: 'text-warning-text',
  short: 'text-danger-text',
}

function statusText(state: CostState, format: (n: number) => string): string {
  const craft = state.crafted > 0 ? `craft ${formatNumber(state.crafted)} · ` : ''
  if (state.status === 'all') return `${craft}enough for all goals`
  if (state.status === 'alone')
    return `${craft}enough for this goal · all goals short ${format(state.missingAll)}`
  return `short ${format(state.missing)}`
}

interface Cell {
  key: string
  name: string
  icon: string
  rarity: number
  count: number
  status: CostStatus
  title: string
}

const cells = computed<Cell[]>(() => {
  const counts = new Map<string, number>()
  let mora = 0
  let characterExp = 0
  let weaponExp = 0
  for (const r of props.requirements) {
    for (const [key, count] of r.items) counts.set(key, (counts.get(key) ?? 0) + count)
    mora += r.mora
    characterExp += r.characterExp
    weaponExp += r.weaponExp
  }
  const check = costCheck(props.planner, props.requirements, props.others, props.inventory)
  const materials = [...counts]
    .map(([key, count]) => ({ material: props.planner.materialsByKey.get(key), key, count }))
    .filter((x): x is { material: PlannerMaterial; key: string; count: number } => !!x.material)
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.material.kind) - KIND_ORDER.indexOf(b.material.kind) ||
        (a.material.family?.key ?? a.key).localeCompare(b.material.family?.key ?? b.key) ||
        a.material.tier - b.material.tier,
    )
  const cell = (
    material: PlannerMaterial,
    count: number,
    state: CostState,
    format: (n: number) => string = formatNumber,
  ): Cell => ({
    key: material.key,
    name: material.name,
    icon: gameIcon(material.icon),
    rarity: material.rarity,
    count,
    status: state.status,
    title: `${material.name} ×${formatNumber(count)} · ${statusText(state, format)}`,
  })
  const list = materials.map(({ material, count }) =>
    cell(material, count, check.item(material.key)),
  )
  const exp = (n: number) => `${formatNumber(n)} EXP`
  for (const item of expItemMix(characterExp, props.planner.expItems.character)) {
    list.push(cell(item.material, item.count, check.characterExp, exp))
  }
  for (const item of expItemMix(weaponExp, props.planner.expItems.weapon)) {
    list.push(cell(item.material, item.count, check.weaponExp, exp))
  }
  if (mora > 0) {
    list.push({ ...cell(props.planner.mora, mora, check.mora), icon: materialIcon('Mora') })
  }
  return list
})
</script>

<template>
  <ul v-if="cells.length" class="flex flex-wrap gap-x-1.5 gap-y-2">
    <li
      v-for="c in cells"
      :key="c.key"
      class="flex w-14 flex-col items-center gap-0.5"
      :title="c.title"
    >
      <span
        class="size-11 overflow-hidden rounded-lg text-xs"
        :class="RARITY_SOFT[c.rarity] ?? 'bg-surface-sunken'"
      >
        <MaterialIcon :src="c.icon" :name="c.name" />
      </span>
      <span class="tabular font-mono text-xs font-medium" :class="TONE[c.status]">{{
        formatCompact(c.count)
      }}</span>
      <span class="sr-only">{{ c.title }}</span>
    </li>
  </ul>
  <p v-else class="text-sm text-text-muted">Nothing to spend</p>
</template>
