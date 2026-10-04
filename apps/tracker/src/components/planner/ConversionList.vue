<script setup lang="ts">
import type { PlannerMaterial } from '@gdt/game-data'
import type { Conversion } from '@gdt/game-data/planner-convert'
import { ArrowRight } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { gameIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/** "2 × [Claw] → [Plume] · [solvent] 2": conversions a source card assumes. */
defineProps<{
  conversions: readonly Conversion[]
  /** The currency spent (Dream Solvent, Dust of Azoth). */
  via: PlannerMaterial
}>()
</script>

<template>
  <ul class="flex flex-col gap-1 border-t border-border-subtle pt-2 text-xs">
    <li
      v-for="(c, i) in conversions"
      :key="i"
      class="tabular flex items-center gap-1.5 font-mono text-text-secondary"
      :title="`Convert ${formatNumber(c.count)} ${c.from.name} into ${c.to.name} for ${formatNumber(c.cost)} ${via.name}`"
    >
      <span>{{ formatNumber(c.count) }}×</span>
      <span class="size-6 overflow-hidden rounded bg-surface-sunken">
        <MaterialIcon :src="gameIcon(c.from.icon)" :name="c.from.name" />
      </span>
      <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true" />
      <span class="size-6 overflow-hidden rounded bg-surface-sunken">
        <MaterialIcon :src="gameIcon(c.to.icon)" :name="c.to.name" />
      </span>
      <span class="ml-auto flex items-center gap-1 text-text-muted">
        <span class="size-5 overflow-hidden rounded">
          <MaterialIcon :src="gameIcon(via.icon)" :name="via.name" />
        </span>
        {{ formatNumber(c.cost) }}
      </span>
      <span class="sr-only"
        >Convert {{ c.count }} {{ c.from.name }} into {{ c.to.name }} for {{ c.cost }}
        {{ via.name }}</span
      >
    </li>
  </ul>
</template>
