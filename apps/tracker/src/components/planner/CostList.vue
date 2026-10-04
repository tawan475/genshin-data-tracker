<script setup lang="ts">
import type { PlannerData, PlannerMaterial } from '@gdt/game-data'
import { expItemMix, type MaterialLine, type Requirement } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'

/**
 * What some goals cost, as item tiles: materials by kind and tier, EXP as
 * books / ores, then Mora. Items the plan as a whole is short of are amber.
 */
const props = defineProps<{
  planner: PlannerData
  requirements: readonly Requirement[]
  lines: ReadonlyMap<string, MaterialLine>
  /** Missing EXP / Mora across the whole plan, to flag those tiles too. */
  short: { characterExp: boolean; weaponExp: boolean; mora: boolean }
}>()

const KIND_ORDER = ['gem', 'boss', 'local', 'common', 'book', 'weekly', 'crown', 'weapon', 'elite']

interface Cell {
  key: string
  name: string
  icon: string
  rarity: number
  count: number
  short: boolean
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
  const materials = [...counts]
    .map(([key, count]) => ({ material: props.planner.materialsByKey.get(key), key, count }))
    .filter((x): x is { material: PlannerMaterial; key: string; count: number } => !!x.material)
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.material.kind) - KIND_ORDER.indexOf(b.material.kind) ||
        (a.material.family?.key ?? a.key).localeCompare(b.material.family?.key ?? b.key) ||
        a.material.tier - b.material.tier,
    )
  const cell = (material: PlannerMaterial, count: number, short: boolean): Cell => ({
    key: material.key,
    name: material.name,
    icon: gameIcon(material.icon),
    rarity: material.rarity,
    count,
    short,
    title: `${material.name} ×${formatNumber(count)}`,
  })
  const list = materials.map(({ material, count }) =>
    cell(material, count, (props.lines.get(material.key)?.missing ?? 0) > 0),
  )
  for (const item of expItemMix(characterExp, props.planner.expItems.character)) {
    list.push(cell(item.material, item.count, props.short.characterExp))
  }
  for (const item of expItemMix(weaponExp, props.planner.expItems.weapon)) {
    list.push(cell(item.material, item.count, props.short.weaponExp))
  }
  if (mora > 0) {
    list.push({
      ...cell(props.planner.mora, mora, props.short.mora),
      icon: materialIcon('Mora'),
    })
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
      <span
        class="tabular font-mono text-xs font-medium"
        :class="c.short ? 'text-warning-text' : 'text-text-secondary'"
        >{{ formatCompact(c.count) }}</span
      >
      <span class="sr-only">{{ c.title }}{{ c.short ? ', missing' : '' }}</span>
    </li>
  </ul>
  <p v-else class="text-sm text-text-muted">Nothing to spend</p>
</template>
