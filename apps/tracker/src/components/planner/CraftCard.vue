<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import { computed, ref } from 'vue'
import { ArrowRight, ChevronsUp, Clock, Hammer, Repeat2 } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { materialName, materialRarity } from '@/utils/materials'
import { formatSeconds } from './farm-format'

/**
 * What the totals assume is crafted, converted and forged before levelling
 * (`craftingSteps`, in order: conversions, crafts from the lowest tier up,
 * forging), as one card among the no-resin ones: a step per chip, the
 * first few shown, the rest one tap away. All of it can be done with what
 * is held.
 */
const props = defineProps<{ planner: PlannerData; steps: readonly PlanStep[] }>()

const SHOWN = 2
const all = ref(false)

interface Icon {
  src: string
  name: string
  rarity: number
}

const KIND_ICON = { craft: ChevronsUp, convert: Repeat2, forge: Hammer } as const
const KIND_LABEL = { craft: 'Craft', convert: 'Convert', forge: 'Forge' } as const

const icon = (key: string): Icon => {
  const m = props.planner.materialsByKey.get(key)
  return m
    ? {
        src: key === props.planner.mora.key ? materialIcon('Mora') : gameIcon(m.icon),
        name: m.name,
        rarity: materialRarity(key, m.rarity) ?? 0,
      }
    : { src: materialIcon(key), name: materialName(key), rarity: materialRarity(key) ?? 0 }
}

const rows = computed(() =>
  props.steps.map((s, i) => {
    if (s.kind === 'convert') {
      const via = icon(s.via)
      return {
        id: `${i}`,
        kind: s.kind,
        from: icon(s.from.key),
        uses: s.count,
        to: icon(s.to.key),
        count: s.count,
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
      title: `Craft ${formatNumber(s.count)} ${s.to.name} from ${formatNumber(s.uses)} ${s.from.name} · ${formatNumber(s.mora)} Mora`,
    }
  }),
)
const shown = computed(() => (all.value ? rows.value : rows.value.slice(0, SHOWN)))
const hidden = computed(() => rows.value.length - shown.value.length)

const mora = computed(() =>
  props.steps.reduce((sum, s) => sum + (s.kind === 'convert' ? 0 : s.mora), 0),
)
const seconds = computed(() =>
  props.steps.reduce((sum, s) => sum + (s.kind === 'forge' ? s.seconds : 0), 0),
)
</script>

<template>
  <article
    class="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border-default bg-surface-raised p-2 shadow-sm"
  >
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <h3 class="text-sm leading-7 font-semibold">Crafting</h3>
      <span class="tabular font-mono text-xs text-text-secondary"
        >{{ formatNumber(rows.length) }} {{ rows.length === 1 ? 'step' : 'steps' }}</span
      >
      <span
        v-if="mora"
        class="tabular inline-flex items-center gap-0.5 font-mono text-xs text-text-secondary"
        :title="`${formatNumber(mora)} Mora for crafting and forging`"
      >
        <span class="size-4 shrink-0">
          <MaterialIcon :src="materialIcon('Mora')" name="Mora" />
        </span>
        {{ formatCompact(mora) }}
      </span>
      <span
        v-if="seconds"
        class="tabular inline-flex items-center gap-0.5 font-mono text-xs text-text-secondary"
        :title="`Forging time ${formatSeconds(seconds)}`"
      >
        <Clock class="size-3.5" aria-hidden="true" />
        {{ formatSeconds(seconds) }}
      </span>
      <span class="ml-auto"><slot /></span>
    </div>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5" aria-label="Steps">
      <li
        v-for="row in shown"
        :key="row.id"
        class="tabular flex items-center gap-1 rounded-lg bg-surface-overlay/60 px-1.5 py-1 font-mono text-xs"
        :title="row.title"
      >
        <component
          :is="KIND_ICON[row.kind]"
          class="size-3.5 shrink-0 text-text-muted"
          :aria-label="KIND_LABEL[row.kind]"
        />
        <span
          class="size-7 shrink-0 overflow-hidden rounded-md text-[0.625rem]"
          :class="RARITY_SOFT[row.from.rarity] ?? 'bg-surface-sunken'"
        >
          <MaterialIcon :src="row.from.src" :name="row.from.name" />
        </span>
        {{ formatCompact(row.uses) }}
        <ArrowRight class="size-3 shrink-0 text-text-muted" aria-hidden="true" />
        <span
          class="size-7 shrink-0 overflow-hidden rounded-md text-[0.625rem]"
          :class="RARITY_SOFT[row.to.rarity] ?? 'bg-surface-sunken'"
        >
          <MaterialIcon :src="row.to.src" :name="row.to.name" />
        </span>
        <span class="font-semibold">{{ formatCompact(row.count) }}</span>
        <span class="sr-only">{{ row.title }}</span>
      </li>
    </ul>
    <button
      v-if="hidden > 0 || all"
      type="button"
      class="self-start rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-text hover:bg-surface-overlay"
      :aria-expanded="all"
      @click="all = !all"
    >
      {{ all ? 'Fewer' : `All ${formatNumber(rows.length)}` }}
    </button>
  </article>
</template>
