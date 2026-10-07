<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import { computed, ref } from 'vue'
import { ArrowRight, Check, CheckCheck, ChevronsUp, Clock, Hammer, Repeat2 } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { materialName } from '@/utils/materials'
import {
  CRAFT_LABEL,
  changesShort,
  craftChanges,
  craftGroups,
  craftTotals,
  rowText,
  type CraftItem,
  type CraftKind,
  type CraftRow,
} from './crafting'
import { formatSeconds } from './farm-format'
import { materialSoft } from './material-soft'

/**
 * What the totals assume is converted, crafted and forged before levelling
 * (crafting.ts), as a checklist to follow in game: per step what comes out
 * and what goes in, by picture (the input's only from `sm` up) and name,
 * with its Mora, Dream Solvent or forging time,
 * grouped as the game does them (Convert, Craft family by family from the
 * lowest tier, Forge). The first few show, the rest one tap away.
 *
 * Each step's tick (and "All" in the header) records it as done in the
 * planner's bag, input and costs out and product in, with an Undo; a step
 * that needs what an earlier one makes waits for it.
 */
const props = defineProps<{
  planner: PlannerData
  steps: readonly PlanStep[]
  /** The planner's bag (capture plus hand edits). */
  bag: Readonly<Record<string, number>>
}>()
const emit = defineEmits<{ done: [rows: CraftRow[]] }>()

/** Rows shown folded: three on a phone, six (two columns) from `sm` up. */
const SHOWN = 6
const PHONE_SHOWN = 3
const all = ref(false)

const KIND_ICON = { craft: ChevronsUp, convert: Repeat2, forge: Hammer } as const
const KIND_TITLE: Record<CraftKind, string> = {
  convert: 'Alchemy: conversion',
  craft: 'Alchemy: crafting, lowest tier first',
  forge: 'Blacksmith: forging',
}

const icon = (key: string) => {
  if (key === props.planner.mora.key) return materialIcon('Mora')
  const m = props.planner.materialsByKey.get(key)
  return m ? gameIcon(m.icon) : materialIcon(key)
}
const soft = (key: string) => materialSoft(key, props.planner.materialsByKey.get(key)?.rarity)

const costText = (c: CraftItem) => `${formatNumber(c.count)} ${materialName(c.key)}`

interface Row extends CraftRow {
  at: number
  title: string
  short: CraftItem[]
}

const groups = computed(() => {
  let at = 0
  return craftGroups(props.planner, props.steps).map((g) => ({
    kind: g.kind,
    rows: g.rows.map((row): Row => {
      const extra = [
        ...row.costs.map(costText),
        ...(row.seconds ? [formatSeconds(row.seconds)] : []),
      ]
      return {
        ...row,
        at: at++,
        title: rowText(row, materialName, extra),
        short: changesShort(craftChanges([row]), props.bag),
      }
    }),
  }))
})
const rows = computed(() => groups.value.flatMap((g) => g.rows))
const totals = computed(() => craftTotals(rows.value))
const allShort = computed(() => changesShort(craftChanges(rows.value), props.bag))

/** Folded: the first rows, the ones past a phone's three hidden there. */
const shownGroups = computed(() =>
  groups.value
    .map((g) => ({ ...g, rows: all.value ? g.rows : g.rows.filter((r) => r.at < SHOWN) }))
    .filter((g) => g.rows.length),
)
const phoneOnly = (row: Row) => !all.value && row.at >= PHONE_SHOWN
/** "All N" shows on a phone past three rows, everywhere past six. */
const moreClass = computed(() =>
  all.value || rows.value.length > SHOWN
    ? ''
    : rows.value.length > PHONE_SHOWN
      ? 'sm:hidden'
      : 'hidden',
)

const shortTitle = (short: CraftItem[]) =>
  `Not yet: needs ${short.map(costText).join(', ')} more (do the steps above first)`
const doneLabel = (row: Row) => (row.short.length ? shortTitle(row.short) : `Done: ${row.title}`)
const allLabel = computed(() =>
  allShort.value.length
    ? `Not enough: needs ${allShort.value.map(costText).join(', ')} more`
    : `All ${formatNumber(rows.value.length)} done: the bag as after them`,
)
</script>

<template>
  <article
    class="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-2 shadow-sm"
    aria-label="Crafting"
  >
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <h3 class="text-sm leading-7 font-semibold">Crafting</h3>
      <span class="tabular font-mono text-xs text-text-secondary"
        >{{ formatNumber(rows.length) }} {{ rows.length === 1 ? 'step' : 'steps' }}</span
      >
      <span
        v-for="c in totals.costs"
        :key="c.key"
        class="tabular inline-flex items-center gap-0.5 font-mono text-xs text-text-secondary"
        :title="`${costText(c)} in all`"
      >
        <span class="size-4 shrink-0">
          <MaterialIcon :src="icon(c.key)" :name="materialName(c.key)" />
        </span>
        {{ formatCompact(c.count) }}
        <span class="sr-only">{{ materialName(c.key) }}</span>
      </span>
      <span
        v-if="totals.seconds"
        class="tabular inline-flex items-center gap-0.5 font-mono text-xs text-text-secondary"
        :title="`Forging time ${formatSeconds(totals.seconds)} (the forge's queue aside)`"
      >
        <Clock class="size-3.5" aria-hidden="true" />
        {{ formatSeconds(totals.seconds) }}
        <span class="sr-only">forging</span>
      </span>
      <span class="ml-auto inline-flex items-center gap-1.5">
        <slot />
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border-strong px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
          :aria-disabled="allShort.length > 0 || undefined"
          :title="allLabel"
          :aria-label="allLabel"
          @click="allShort.length || emit('done', rows)"
        >
          <CheckCheck class="size-4" aria-hidden="true" />
          <span class="max-sm:sr-only">All done</span>
        </button>
      </span>
    </div>

    <section
      v-for="g in shownGroups"
      :key="g.kind"
      class="flex flex-col gap-1"
      :class="g.rows.every(phoneOnly) ? 'max-sm:hidden' : ''"
      :aria-label="CRAFT_LABEL[g.kind]"
    >
      <h4
        class="flex items-center gap-1 text-xs font-medium text-text-muted"
        :title="KIND_TITLE[g.kind]"
      >
        <component :is="KIND_ICON[g.kind]" class="size-3.5" aria-hidden="true" />
        {{ CRAFT_LABEL[g.kind] }}
      </h4>
      <ul class="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <li
          v-for="row in g.rows"
          :key="row.id"
          class="flex min-w-0 items-center gap-1.5 rounded-lg bg-surface-overlay/60 py-1 pr-1 pl-1"
          :class="phoneOnly(row) ? 'max-sm:hidden' : ''"
          :title="row.title"
        >
          <!-- Phones name the input on the row's second line; the picture pair needs the width. -->
          <span
            class="size-9 shrink-0 overflow-hidden rounded-md text-[0.625rem] max-sm:hidden"
            :class="soft(row.input.key)"
          >
            <MaterialIcon :src="icon(row.input.key)" :name="materialName(row.input.key)" />
          </span>
          <ArrowRight class="size-3.5 shrink-0 text-text-muted max-sm:hidden" aria-hidden="true" />
          <span
            class="size-9 shrink-0 overflow-hidden rounded-md text-[0.625rem]"
            :class="soft(row.output.key)"
          >
            <MaterialIcon :src="icon(row.output.key)" :name="materialName(row.output.key)" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight" aria-hidden="true">
            <span class="line-clamp-2 text-sm break-words">
              <span class="tabular font-mono font-semibold">{{
                formatNumber(row.output.count)
              }}</span>
              {{ materialName(row.output.key) }}
            </span>
            <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
              <span class="min-w-0 break-words"
                >from <span class="tabular font-mono">{{ formatNumber(row.input.count) }}</span>
                {{ materialName(row.input.key) }}</span
              >
              <span
                v-for="c in row.costs"
                :key="c.key"
                class="tabular inline-flex shrink-0 items-center gap-0.5 font-mono text-text-secondary"
              >
                <span class="size-3.5 shrink-0">
                  <MaterialIcon :src="icon(c.key)" :name="materialName(c.key)" />
                </span>
                {{ formatCompact(c.count) }}
              </span>
              <span
                v-if="row.seconds"
                class="tabular inline-flex shrink-0 items-center gap-0.5 font-mono text-text-secondary"
              >
                <Clock class="size-3" />
                {{ formatSeconds(row.seconds) }}
              </span>
            </span>
          </span>
          <span class="sr-only">{{ row.title }}</span>
          <button
            type="button"
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-strong text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
            :aria-disabled="row.short.length > 0 || undefined"
            :title="doneLabel(row)"
            :aria-label="doneLabel(row)"
            @click="row.short.length || emit('done', [row])"
          >
            <Check class="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <button
      type="button"
      class="self-start rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-text hover:bg-surface-overlay"
      :class="moreClass"
      :aria-expanded="all"
      @click="all = !all"
    >
      {{ all ? 'Fewer' : `All ${formatNumber(rows.length)}` }}
    </button>
  </article>
</template>
