<script setup lang="ts">
import type { PlannerData, PlannerMaterial } from '@gdt/game-data'
import type { PlanTotals } from '@gdt/game-data/planner-math'
import { computed, reactive, watch } from 'vue'
import { Minus, Plus, RotateCcw } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import UiPopover from '@/components/ui/UiPopover.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import type { ItemContext } from './item-popover'

/**
 * The inventory editor every material icon opens: the material's whole
 * family (talent books, gems… tier by tier; EXP books or ores together),
 * each with what all goals need, what is still missing after crafting
 * (and what crafting covers), what the goal it was opened from needs, and
 * the count held: typed, or ±1 with the buttons, ↑/↓ or W/S (Shift: ±10).
 * A count that differs from the capture shows it, with a reset.
 */
const props = defineProps<{
  open: boolean
  anchor: HTMLElement | null
  itemKey: string | null
  context: ItemContext | null
  /** Opened by touch: no focus, so the keyboard doesn't cover the sheet. */
  touch: boolean
  planner: PlannerData
  /** Counts the planner works with (capture + hand edits). */
  bag: Readonly<Record<string, number>>
  /** The capture's counts (none without a capture). */
  capture: Readonly<Record<string, number>>
  totals: PlanTotals | null
}>()
const emit = defineEmits<{ close: []; change: [key: string, value: number] }>()

const material = computed(() =>
  props.itemKey ? (props.planner.materialsByKey.get(props.itemKey) ?? null) : null,
)

/** The rows: the family, the EXP items of the same kind, or the one material. */
const members = computed<PlannerMaterial[]>(() => {
  const m = material.value
  if (!m) return []
  if (m.family) return m.family.members
  if (m.kind === 'exp') return props.planner.expItems.character.map((i) => i.material)
  if (m.kind === 'ore') return props.planner.expItems.weapon.map((i) => i.material)
  return [m]
})

const count = (bag: Readonly<Record<string, number>>, key: string) =>
  Math.max(0, Math.trunc(bag[key] ?? 0))

const iconOf = (m: PlannerMaterial) =>
  m.key === props.planner.mora.key ? materialIcon('Mora') : gameIcon(m.icon)

/** EXP shown in points for the group (books and ores add up). */
const expKind = computed(() => {
  const kind = material.value?.kind
  return kind === 'exp' ? 'character' : kind === 'ore' ? 'weapon' : null
})
const expSummary = computed(() => {
  const kind = expKind.value
  const t = props.totals
  if (!kind || !t) return null
  const total = kind === 'character' ? t.characterExp : t.weaponExp
  const mine = props.context
    ? kind === 'character'
      ? props.context.requirement.characterExp
      : props.context.requirement.weaponExp
    : 0
  return { need: total.need, missing: total.missing, mine }
})

interface Row {
  material: PlannerMaterial
  have: number
  captured: number
  need: number
  missing: number
  crafted: number
  mine: number
}

const rows = computed<Row[]>(() =>
  members.value.map((m) => {
    const line = props.totals?.lines.get(m.key)
    const isMora = m.key === props.planner.mora.key
    const mora = props.totals?.mora
    return {
      material: m,
      have: count(props.bag, m.key),
      captured: count(props.capture, m.key),
      need: isMora ? (mora?.need ?? 0) : (line?.need ?? 0),
      missing: isMora ? (mora?.missing ?? 0) : (line?.missing ?? 0),
      crafted: line?.crafted ?? 0,
      mine: isMora
        ? (props.context?.requirement.mora ?? 0)
        : (props.context?.requirement.items.get(m.key) ?? 0),
    }
  }),
)

/** What is being typed, per material, while its input has focus. */
const drafts = reactive(new Map<string, string>())
watch(
  () => props.open,
  () => drafts.clear(),
)

function set(row: Row, value: number) {
  const n = Math.max(0, Math.min(1_000_000_000, Math.trunc(value)))
  if (n !== row.have) emit('change', row.material.key, n)
}

function onInput(row: Row, event: Event) {
  const input = event.target as HTMLInputElement
  const digits = input.value.replace(/\D+/g, '').slice(0, 10)
  if (digits !== input.value) input.value = digits
  drafts.set(row.material.key, digits)
  if (digits !== '') set(row, Number(digits))
}

function onKey(row: Row, event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const step = event.shiftKey ? 10 : 1
  const key = event.key.toLowerCase()
  if (event.key === 'ArrowUp' || key === 'w') set(row, row.have + step)
  else if (event.key === 'ArrowDown' || key === 's') set(row, row.have - step)
  else if (event.key === 'Enter') emit('close')
  else if (event.key.length === 1 && !/\d/.test(event.key)) {
    /* only digits */
  } else return
  event.preventDefault()
  drafts.delete(row.material.key)
}

const value = (row: Row) => drafts.get(row.material.key) ?? String(row.have)
const title = computed(() => material.value?.name ?? '')
const keysHint = '↑ / W +1 · ↓ / S −1 · Shift ±10'
</script>

<template>
  <UiPopover
    :open="open && !!material"
    :anchor="anchor"
    :label="title"
    :focus="!touch"
    @close="emit('close')"
  >
    <template #heading>
      <div class="min-w-0 flex-1 py-1">
        <h2 class="truncate text-base font-semibold">{{ title }}</h2>
        <p v-if="context" class="truncate text-xs text-text-muted">{{ context.label }}</p>
      </div>
    </template>

    <p
      v-if="expSummary && expSummary.need > 0"
      class="tabular flex flex-wrap gap-x-3 border-b border-border-subtle px-4 py-2 font-mono text-xs text-text-secondary"
    >
      <span>EXP need {{ formatCompact(expSummary.need) }}</span>
      <span v-if="expSummary.mine">Goal {{ formatCompact(expSummary.mine) }}</span>
      <span :class="expSummary.missing > 0 ? 'text-danger-text' : 'text-success-text'">{{
        expSummary.missing > 0 ? `Missing ${formatCompact(expSummary.missing)}` : 'Enough'
      }}</span>
    </p>

    <ul class="flex flex-col py-1">
      <li
        v-for="row in rows"
        :key="row.material.key"
        class="flex items-center gap-3 px-4 py-2"
        :class="row.material.key === itemKey ? 'bg-surface-overlay/60' : ''"
      >
        <span
          class="size-10 shrink-0 overflow-hidden rounded-lg text-xs"
          :class="RARITY_SOFT[row.material.rarity] ?? 'bg-surface-sunken'"
        >
          <MaterialIcon :src="iconOf(row.material)" :name="row.material.name" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="line-clamp-2 text-sm leading-tight font-medium break-words">{{
            row.material.name
          }}</span>
          <span class="tabular flex flex-wrap gap-x-2 font-mono text-xs leading-4 text-text-muted">
            <template v-if="!expKind && row.need > 0">
              <span>Need {{ formatCompact(row.need) }}</span>
              <span v-if="row.mine">Goal {{ formatCompact(row.mine) }}</span>
              <span :class="row.missing > 0 ? 'text-danger-text' : 'text-success-text'">{{
                row.missing > 0 ? `Missing ${formatCompact(row.missing)}` : 'Enough'
              }}</span>
            </template>
            <span v-if="row.crafted" class="text-text-secondary" title="Crafted from the tier below"
              >Craft {{ formatCompact(row.crafted) }}</span
            >
            <span
              v-if="row.have !== row.captured"
              class="inline-flex items-center gap-1 text-accent-text"
            >
              Capture {{ formatCompact(row.captured) }}
              <button
                type="button"
                class="inline-flex size-5 items-center justify-center rounded hover:bg-surface-overlay"
                :aria-label="`${row.material.name}: back to the capture's ${formatNumber(row.captured)}`"
                :title="`Back to ${formatNumber(row.captured)}`"
                @click="emit('change', row.material.key, row.captured)"
              >
                <RotateCcw class="size-3.5" aria-hidden="true" />
              </button>
            </span>
          </span>
        </span>
        <span class="flex shrink-0 items-center">
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-l-md border border-border-strong bg-surface-overlay text-text-secondary hover:text-text-primary disabled:opacity-40"
            :aria-label="`${row.material.name} −1`"
            :disabled="row.have === 0"
            @click="set(row, row.have - 1)"
          >
            <Minus class="size-4" aria-hidden="true" />
          </button>
          <input
            :value="value(row)"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :autofocus="row.material.key === itemKey || undefined"
            :aria-label="`${row.material.name} held`"
            :title="keysHint"
            class="tabular h-9 w-[4.5rem] border-y border-border-strong bg-surface-raised px-1 text-center font-mono text-sm text-text-primary focus:relative focus:z-10 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            @input="onInput(row, $event)"
            @keydown="onKey(row, $event)"
            @blur="drafts.delete(row.material.key)"
          />
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-r-md border border-border-strong bg-surface-overlay text-text-secondary hover:text-text-primary"
            :aria-label="`${row.material.name} +1`"
            @click="set(row, row.have + 1)"
          >
            <Plus class="size-4" aria-hidden="true" />
          </button>
        </span>
      </li>
    </ul>
  </UiPopover>
</template>
