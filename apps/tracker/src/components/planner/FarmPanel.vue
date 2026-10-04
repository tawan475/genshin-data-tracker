<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import {
  WEEKDAY_LABELS,
  type ExpTotal,
  type PlanTotals,
  type SourceGroup,
  type SourceKind,
} from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { CalendarDays, PartyPopper } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import ToggleChip from '@/components/characters/ToggleChip.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import SourceCard from './SourceCard.vue'

/**
 * "What to farm": EXP and Mora on top, then what the active goals still
 * need, grouped by where it drops. Domains open today come first and carry
 * the accent.
 */
const props = defineProps<{
  planner: PlannerData
  totals: PlanTotals
  groups: SourceGroup[]
  today: number
  estimate: { resin: number; days: number; partial: boolean } | null
}>()
const missingOnly = defineModel<boolean>('missingOnly', { required: true })

const SECTIONS: { kind: SourceKind; label: string; compact: boolean }[] = [
  { kind: 'talent', label: 'Talent books', compact: false },
  { kind: 'weapon', label: 'Weapon materials', compact: false },
  { kind: 'weekly', label: 'Weekly bosses', compact: true },
  { kind: 'boss', label: 'Bosses', compact: true },
  { kind: 'gem', label: 'Gems', compact: false },
  { kind: 'local', label: 'Specialties', compact: true },
  { kind: 'enemy', label: 'Enemy drops', compact: false },
  { kind: 'crown', label: 'Crowns', compact: true },
]

const sections = computed(() =>
  SECTIONS.map((section) => {
    const all = props.groups.filter((g) => g.kind === section.kind)
    const shown = all
      .filter((g) => !missingOnly.value || g.missing > 0)
      .sort(
        (a, b) =>
          Number(b.missing > 0 && b.weekdays.includes(props.today)) -
          Number(a.missing > 0 && a.weekdays.includes(props.today)),
      )
    return { ...section, all, shown, missing: all.filter((g) => g.missing > 0).length }
  }).filter((s) => s.shown.length > 0),
)
const anyMissing = computed(() => props.groups.some((g) => g.missing > 0))

interface Tile {
  key: string
  label: string
  icon: string
  name: string
  /** In the tile's unit (items). */
  missing: number
  have: number
  need: number
  title: string
}

function expTile(key: string, label: string, total: ExpTotal, kind: 'character' | 'weapon'): Tile {
  const items = props.planner.expItems[kind]
  const big = items[items.length - 1]!
  const mix = total.missingItems.map((i) => `${formatNumber(i.count)} ${i.material.name}`)
  return {
    key,
    label,
    icon: gameIcon(big.material.icon),
    name: big.material.name,
    missing: Math.ceil(total.missing / big.exp),
    have: Math.floor(total.have / big.exp),
    need: Math.ceil(total.need / big.exp),
    title: [
      `${kind === 'character' ? 'Character' : 'Weapon'} EXP: need ${formatNumber(total.need)}`,
      `have ${formatNumber(total.have)}`,
      mix.length ? `missing ${mix.join(' + ')}` : 'covered',
    ].join(' · '),
  }
}

const tiles = computed<Tile[]>(() => {
  const t = props.totals
  const mora = props.planner.mora
  const list: Tile[] = [
    {
      key: 'mora',
      label: 'Mora',
      icon: materialIcon('Mora'),
      name: mora.name,
      missing: t.mora.missing,
      have: t.mora.have,
      need: t.mora.need,
      title: `Mora: need ${formatNumber(t.mora.need)} (crafting ${formatNumber(t.mora.crafting)}) · have ${formatNumber(t.mora.have)}`,
    },
  ]
  if (t.characterExp.need > 0) {
    list.push(expTile('characterExp', 'EXP', t.characterExp, 'character'))
  }
  if (t.weaponExp.need > 0) list.push(expTile('weaponExp', 'Ore', t.weaponExp, 'weapon'))
  return list
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <ul class="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4" aria-label="Totals">
      <li
        v-for="tile in tiles"
        :key="tile.key"
        class="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-border-default bg-surface-raised p-2.5 text-center shadow-sm sm:flex-row sm:gap-3 sm:p-3 sm:text-left"
        :title="tile.title"
      >
        <span class="size-9 shrink-0 text-xs sm:size-11">
          <MaterialIcon :src="tile.icon" :name="tile.name" />
        </span>
        <span class="flex w-full min-w-0 flex-1 flex-col">
          <span class="truncate text-xs text-text-muted">{{ tile.label }}</span>
          <span
            class="tabular truncate font-mono text-base leading-6 font-semibold sm:text-lg"
            :class="tile.missing > 0 ? 'text-warning-text' : 'text-success-text'"
            >{{ tile.missing > 0 ? formatCompact(tile.missing) : '✓' }}</span
          >
          <span class="tabular truncate font-mono text-[0.6875rem] text-text-muted sm:text-xs"
            >{{ formatCompact(tile.have) }}/{{ formatCompact(tile.need) }}</span
          >
        </span>
        <span class="sr-only">{{ tile.title }}</span>
      </li>
      <li
        v-if="estimate"
        class="flex min-w-0 flex-col justify-center rounded-xl border border-border-default bg-surface-raised p-2.5 text-center shadow-sm sm:p-3 sm:text-left"
        :title="`Estimate from average drops${estimate.partial ? ', some sources have no rate' : ''}`"
      >
        <span class="truncate text-xs text-text-muted">Resin</span>
        <span class="tabular truncate font-mono text-base leading-6 font-semibold sm:text-lg"
          >~{{ formatCompact(estimate.resin) }}{{ estimate.partial ? '+' : '' }}</span
        >
        <span class="tabular truncate font-mono text-[0.6875rem] text-text-muted sm:text-xs"
          >~{{ formatNumber(estimate.days) }} d</span
        >
      </li>
    </ul>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <span
        class="inline-flex items-center gap-1.5 text-sm text-text-secondary"
        title="Server day (resets 04:00)"
      >
        <CalendarDays class="size-4" aria-hidden="true" />
        {{ WEEKDAY_LABELS[today] }}
      </span>
      <ToggleChip v-model="missingOnly">Missing</ToggleChip>
    </div>

    <p
      v-if="!anyMissing && missingOnly"
      class="flex items-center justify-center gap-2 py-8 text-text-secondary"
    >
      <PartyPopper class="size-5" aria-hidden="true" />
      Nothing missing
    </p>

    <section v-for="section in sections" :key="section.kind" :aria-label="section.label">
      <h2 class="mb-2 flex items-center gap-2 text-base font-semibold">
        {{ section.label }}
        <span class="tabular font-mono text-sm font-normal text-text-muted">{{
          section.missing
        }}</span>
      </h2>
      <div
        class="grid gap-2 sm:gap-3"
        :class="
          section.compact
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        "
      >
        <SourceCard
          v-for="group in section.shown"
          :key="group.id"
          :group="group"
          :today="today"
          :compact="section.compact"
        />
      </div>
    </section>
  </div>
</template>
