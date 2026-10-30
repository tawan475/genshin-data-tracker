<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowRight, ChevronDown, Eye } from 'lucide-vue-next'
import type { CatalogEntry } from '@gdt/shared'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import { t } from '@/i18n'
import { statLabel } from '@/data/character-build'
import { captureLabel, type BuildStep, type GearDay, type PieceChange } from '@/data/character-gear'
import type { CharacterChange } from '@/data/characters-history'
import { SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/data/characters'
import { itemName } from '@/data/weapons'
import { artifactIcon } from '@/lib/assets'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'
import { formatSetName } from '@/utils/artifact-stats'

/**
 * A character's history, newest first, as a dotted vertical timeline:
 * level, constellation and talent changes, and gear changes folded to one
 * row per day (however often the pieces were swapped) that opens into that
 * day's captured builds. Every entry can be viewed: the dialog then shows
 * the build that capture had.
 */
const props = defineProps<{
  changes: CharacterChange[]
  /** Gear rows; null while loading (progression shows meanwhile). */
  days: GearDay[] | null
  resetKey: string
  /** The snapshot whose build is on screen, null for now. */
  viewing: number | null
  /** Catalog pieces, for the build rows' icons. */
  piece: ((id: number) => CatalogEntry | undefined) | null
}>()
const emit = defineEmits<{ view: [snapshotId: number] }>()

type Filter = 'all' | 'progression' | 'gear'
type Item =
  | { kind: 'change'; at: number; change: CharacterChange }
  | { kind: 'gear'; at: number; day: GearDay }

const PREVIEW = 6
const showAll = ref(false)
const filter = ref<Filter>('all')
const open = reactive(new Set<number>())
watch(
  () => props.resetKey,
  () => {
    showAll.value = false
    open.clear()
  },
)

const filters = computed<SegmentedOption<Filter>[]>(() => [
  { value: 'all', label: t('characters.builds.filter.all') },
  { value: 'progression', label: t('characters.builds.filter.progression') },
  { value: 'gear', label: t('characters.builds.filter.gear') },
])

const items = computed<Item[]>(() => {
  const list: Item[] = []
  if (filter.value !== 'gear') {
    for (const change of props.changes) list.push({ kind: 'change', at: change.at, change })
  }
  if (filter.value !== 'progression') {
    for (const day of props.days ?? []) list.push({ kind: 'gear', at: day.at, day })
  }
  return list.sort((a, b) => b.at - a.at)
})
const shown = computed(() => (showAll.value ? items.value : items.value.slice(0, PREVIEW)))
const viewable = computed(() => props.days !== null)

function toggle(day: GearDay) {
  if (open.has(day.at)) open.delete(day.at)
  else open.add(day.at)
}

function dayTitle(day: GearDay): string {
  return [day.artifacts ? t('game.artifacts') : null, day.weapon ? t('game.weapon') : null]
    .filter(Boolean)
    .join(' · ')
}

function pieceText(change: PieceChange): string {
  const slot = SLOT_LABELS[change.slot]
  if (change.kind === 'levelled') return `${slot} +${change.from} → +${change.to}`
  if (change.kind !== 'swapped') return t(`characters.builds.${change.kind}`, { slot })
  const from = props.piece?.(change.ids[0])
  const to = props.piece?.(change.ids[1])
  return from && to && from.mainStatKey !== to.mainStatKey
    ? `${slot} ${statLabel(from.mainStatKey)} → ${statLabel(to.mainStatKey)}`
    : slot
}

function weaponText(step: BuildStep): string | null {
  const change = step.weapon
  if (!change) return null
  const { from, to } = change
  if (!to) return t('characters.builds.noWeapon')
  if (change.kind === 'upgraded' && from) {
    return from.level !== to.level
      ? `Lv. ${from.level} → ${to.level}`
      : `R${from.refinement} → R${to.refinement}`
  }
  return itemName(to.key)
}

/** Icons of a step's five pieces, ringed where this step changed them. */
function slotsOf(step: BuildStep) {
  const changed = new Map(step.pieces.map((p) => [p.slot, p.kind]))
  return SLOT_ORDER.map((slot: SlotKey, i) => {
    const id = step.gear.pieces[i]
    const piece = id === null || id === undefined ? undefined : props.piece?.(id)
    const kind = changed.get(slot)
    return {
      slot,
      piece,
      ring: kind === 'levelled' ? 'ring-talent-boost' : kind ? 'ring-accent' : '',
    }
  })
}

const slotsText = (day: GearDay) => day.slots.map((s) => SLOT_LABELS[s]).join(', ')

function setsText(step: BuildStep): string {
  return step.sets
    .filter((s) => s.count >= 2)
    .map((s) => `${s.count} ${formatSetName(s.setKey)}`)
    .join(' · ')
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UiSegmented
      v-if="days?.length"
      v-model="filter"
      :options="filters"
      :label="$t('characters.builds.filterLabel')"
      class="self-start"
    />
    <ol class="relative flex flex-col">
      <li
        v-for="(item, index) in shown"
        :key="`${item.kind}-${item.at}`"
        class="relative flex gap-3 pb-4 pl-6 last:pb-0 sm:gap-4"
      >
        <span
          v-if="index < shown.length - 1"
          class="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-border-default"
          aria-hidden="true"
        />
        <span
          class="absolute top-1.5 left-0 size-2.5 rounded-full ring-4 ring-surface-raised"
          :class="
            item.kind === 'gear'
              ? item.day.sameEnd
                ? 'bg-text-muted'
                : 'bg-accent-text'
              : item.change.kind === 'changed'
                ? 'bg-accent'
                : 'bg-text-muted'
          "
          aria-hidden="true"
        />
        <time
          class="w-24 shrink-0 text-sm text-text-secondary sm:w-28"
          :datetime="new Date(item.at).toISOString()"
          :title="formatDateTime(item.at)"
          >{{ formatDate(item.at) }}</time
        >

        <!-- Level, constellation, talents (and first seen / obtained) -->
        <div
          v-if="item.kind === 'change'"
          class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
        >
          <p v-if="item.change.kind !== 'changed'" class="flex flex-wrap gap-x-2 text-sm">
            <span class="text-text-secondary">{{
              item.change.kind === 'first'
                ? $t('characters.timeline.firstSeen')
                : $t('characters.timeline.obtained')
            }}</span>
            <span class="tabular font-mono">{{ item.change.state }}</span>
          </p>
          <ul v-else class="flex flex-wrap gap-1.5">
            <li
              v-for="line in item.change.lines"
              :key="line.label"
              class="inline-flex items-center gap-1.5 rounded-md bg-surface-overlay px-2 py-0.5 text-sm"
            >
              <span class="text-text-secondary">{{ line.label }}</span>
              <span class="tabular font-mono text-text-secondary">{{ line.from }}</span>
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true" />
              <span class="sr-only">{{ $t('characters.timeline.to') }}</span>
              <span class="tabular font-mono font-medium">{{ line.to }}</span>
            </li>
          </ul>
          <UiBadge v-if="viewing === item.change.snapshotId" tone="accent">{{
            $t('characters.builds.viewing')
          }}</UiBadge>
          <button
            v-else-if="viewable"
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-accent-text hover:bg-surface-overlay"
            :title="$t('characters.builds.viewTitle')"
            @click="emit('view', item.change.snapshotId)"
          >
            <Eye class="size-3.5" aria-hidden="true" />{{ $t('characters.builds.view') }}
          </button>
        </div>

        <!-- One day's gear changes, folded -->
        <div v-else class="min-w-0 flex-1">
          <button
            type="button"
            class="flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border bg-surface-overlay/40 px-2.5 py-1.5 text-left text-sm hover:border-border-strong"
            :class="[
              open.has(item.day.at) ? 'border-accent/60' : 'border-border-default',
              item.day.sameEnd ? 'text-text-secondary' : '',
            ]"
            :aria-expanded="open.has(item.day.at)"
            @click="toggle(item.day)"
          >
            <ArrowLeftRight class="size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <span class="font-medium">{{ dayTitle(item.day) }}</span>
            <span
              class="tabular font-mono text-text-muted"
              :title="$t('characters.builds.count', { n: item.day.steps.length })"
              >×{{ item.day.steps.length }}</span
            >
            <span v-if="item.day.sameEnd" class="text-text-muted">{{
              $t('characters.builds.sameEnd')
            }}</span>
            <span v-else-if="item.day.slots.length" class="min-w-0 truncate text-text-secondary">{{
              slotsText(item.day)
            }}</span>
            <span
              v-if="!item.day.sameEnd && item.day.cvFrom !== item.day.cvTo"
              class="tabular ml-auto font-mono text-xs text-text-muted"
              >CV {{ item.day.cvFrom.toFixed(1) }} → {{ item.day.cvTo.toFixed(1) }}</span
            >
            <ChevronDown
              class="size-4 shrink-0 text-text-muted transition-transform"
              :class="[
                open.has(item.day.at) ? 'rotate-180' : '',
                item.day.sameEnd || item.day.cvFrom === item.day.cvTo ? 'ml-auto' : '',
              ]"
              aria-hidden="true"
            />
          </button>
          <ol
            v-if="open.has(item.day.at)"
            class="mt-2 divide-y divide-border-default overflow-hidden rounded-lg border border-border-default"
          >
            <li
              v-for="step in item.day.steps"
              :key="step.snapshotId"
              class="flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2"
              :class="
                viewing === step.snapshotId
                  ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--accent)]'
                  : ''
              "
            >
              <span class="flex w-16 shrink-0 flex-col">
                <span class="tabular text-sm font-medium">{{ formatTime(step.at) }}</span>
                <span v-if="captureLabel(step.capture)" class="truncate text-xs text-text-muted">{{
                  captureLabel(step.capture)
                }}</span>
              </span>
              <span class="flex shrink-0 gap-1">
                <span
                  v-for="s in slotsOf(step)"
                  :key="s.slot"
                  class="rounded-md"
                  :class="s.ring ? `ring-2 ${s.ring} ring-offset-1 ring-offset-surface-raised` : ''"
                  :title="SLOT_LABELS[s.slot]"
                >
                  <GameIcon
                    v-if="s.piece"
                    :src="artifactIcon(s.piece.setKey, s.piece.slotKey)"
                    :name="formatSetName(s.piece.setKey)"
                    :rarity="s.piece.rarity"
                    size="xs"
                  />
                  <span
                    v-else
                    class="block size-7 rounded-md border border-dashed border-border-default"
                  />
                </span>
              </span>
              <span class="flex min-w-36 flex-[1_1_9rem] flex-wrap gap-1.5">
                <span
                  v-if="weaponText(step)"
                  class="max-w-full truncate rounded-md bg-surface-overlay px-2 py-0.5 text-xs"
                  ><span class="text-text-muted">{{ $t('game.weapon') }}</span>
                  {{ weaponText(step) }}</span
                >
                <span
                  v-for="change in step.pieces"
                  :key="change.slot"
                  class="max-w-full truncate rounded-md bg-surface-overlay px-2 py-0.5 text-xs"
                  :class="change.kind === 'levelled' ? 'text-talent-boost' : ''"
                  >{{ pieceText(change) }}</span
                >
              </span>
              <span class="flex min-w-0 flex-col text-xs sm:w-44">
                <span class="truncate text-success-text">{{ setsText(step) }}</span>
                <span class="tabular font-mono text-text-muted">CV {{ step.cv.toFixed(1) }}</span>
              </span>
              <UiBadge v-if="viewing === step.snapshotId" tone="accent" class="ml-auto">{{
                $t('characters.builds.viewing')
              }}</UiBadge>
              <UiButton
                v-else
                size="sm"
                class="ml-auto"
                :title="$t('characters.builds.viewTitle')"
                @click="emit('view', step.snapshotId)"
                >{{ $t('characters.builds.view') }}</UiButton
              >
            </li>
          </ol>
        </div>
      </li>
    </ol>
    <div v-if="items.length > PREVIEW">
      <UiButton variant="ghost" size="sm" @click="showAll = !showAll">
        {{
          showAll
            ? $t('characters.timeline.less')
            : $t('characters.timeline.all', { n: items.length })
        }}
      </UiButton>
    </div>
  </div>
</template>
