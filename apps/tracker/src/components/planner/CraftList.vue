<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import { computed } from 'vue'
import { ArrowRight, ChevronsUp, Clock, Hammer, Repeat2 } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber, keyToName } from '@/lib/format'
import { formatSeconds } from './farm-format'

/**
 * What the totals assume you do in game before levelling, in order:
 * conversions (Dream Solvent, Dust of Azoth), crafts from the lowest tier
 * up, then forging (`craftingSteps`). All of it can be done with the stock.
 */
const props = defineProps<{ planner: PlannerData; steps: readonly PlanStep[] }>()

interface Icon {
  src: string
  name: string
  rarity: number
}

interface Row {
  id: string
  kind: PlanStep['kind']
  from: Icon
  uses: number
  to: Icon
  count: number
  /** Mora, or the currency spent. */
  cost: { icon: Icon; count: number }
  seconds: number
  title: string
}

const KIND_ICON = { craft: ChevronsUp, convert: Repeat2, forge: Hammer } as const
const KIND_LABEL = { craft: 'Craft', convert: 'Convert', forge: 'Forge' } as const

const icon = (key: string): Icon => {
  const m = props.planner.materialsByKey.get(key)
  return m
    ? {
        src: key === props.planner.mora.key ? materialIcon('Mora') : gameIcon(m.icon),
        name: m.name,
        rarity: m.rarity,
      }
    : { src: materialIcon(key), name: keyToName(key), rarity: 0 }
}

const rows = computed<Row[]>(() =>
  props.steps.map((s, i) => {
    const mora = icon(props.planner.mora.key)
    if (s.kind === 'convert') {
      const via = icon(s.via)
      return {
        id: `${i}`,
        kind: s.kind,
        from: icon(s.from.key),
        uses: s.count,
        to: icon(s.to.key),
        count: s.count,
        cost: { icon: via, count: s.cost },
        seconds: 0,
        title: `Convert ${formatNumber(s.count)} ${s.from.name} into ${s.to.name} · ${formatNumber(s.cost)} ${via.name}`,
      }
    }
    if (s.kind === 'forge') {
      const from = icon(s.input)
      return {
        id: `${i}`,
        kind: s.kind,
        from,
        uses: s.uses,
        to: icon(s.to.key),
        count: s.count,
        cost: { icon: mora, count: s.mora },
        seconds: s.seconds,
        title: `Forge ${formatNumber(s.count)} ${s.to.name} from ${formatNumber(s.uses)} ${from.name} · ${formatNumber(s.mora)} Mora · ${formatSeconds(s.seconds)}`,
      }
    }
    return {
      id: `${i}`,
      kind: s.kind,
      from: icon(s.from.key),
      uses: s.uses,
      to: icon(s.to.key),
      count: s.count,
      cost: { icon: mora, count: s.mora },
      seconds: 0,
      title: `Craft ${formatNumber(s.count)} ${s.to.name} from ${formatNumber(s.uses)} ${s.from.name} · ${formatNumber(s.mora)} Mora`,
    }
  }),
)

const mora = computed(() =>
  props.steps.reduce((sum, s) => sum + (s.kind === 'convert' ? 0 : s.mora), 0),
)
</script>

<template>
  <section aria-label="Craft">
    <p v-if="rows.length === 0" class="py-8 text-center text-text-secondary">Nothing to craft</p>
    <template v-else>
      <p class="mb-2 flex items-center gap-1.5 text-sm text-text-secondary">
        <span class="tabular font-mono">{{ formatNumber(rows.length) }}</span> steps
        <span class="text-text-muted">·</span>
        <span class="size-5 overflow-hidden rounded">
          <MaterialIcon :src="materialIcon('Mora')" name="Mora" />
        </span>
        <span class="tabular font-mono" title="Mora for crafting and forging">{{
          formatNumber(mora)
        }}</span>
      </p>
      <ul class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        <li
          v-for="row in rows"
          :key="row.id"
          class="flex items-center gap-2 rounded-xl border border-border-default bg-surface-raised px-3 py-2 shadow-sm"
          :title="row.title"
        >
          <component
            :is="KIND_ICON[row.kind]"
            class="size-4 shrink-0 text-text-muted"
            :aria-label="KIND_LABEL[row.kind]"
          />
          <span class="tabular flex items-center gap-1 font-mono text-sm">
            <span
              class="size-9 overflow-hidden rounded-lg text-xs"
              :class="RARITY_SOFT[row.from.rarity] ?? 'bg-surface-sunken'"
            >
              <MaterialIcon :src="row.from.src" :name="row.from.name" />
            </span>
            {{ formatCompact(row.uses) }}
          </span>
          <ArrowRight class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span class="tabular flex items-center gap-1 font-mono text-sm font-semibold">
            <span
              class="size-9 overflow-hidden rounded-lg text-xs"
              :class="RARITY_SOFT[row.to.rarity] ?? 'bg-surface-sunken'"
            >
              <MaterialIcon :src="row.to.src" :name="row.to.name" />
            </span>
            {{ formatCompact(row.count) }}
          </span>
          <span
            class="tabular ml-auto flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs text-text-muted"
          >
            <span class="flex items-center gap-1">
              <span class="size-4 overflow-hidden rounded">
                <MaterialIcon :src="row.cost.icon.src" :name="row.cost.icon.name" />
              </span>
              {{ formatCompact(row.cost.count) }}
            </span>
            <span v-if="row.seconds" class="flex items-center gap-1">
              <Clock class="size-3" aria-hidden="true" />
              {{ formatSeconds(row.seconds) }}
            </span>
          </span>
          <span class="sr-only">{{ row.title }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
