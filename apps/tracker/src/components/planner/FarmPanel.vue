<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { DropRates } from '@gdt/game-data/drops'
import type { FarmingData } from '@gdt/game-data/farming'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import type { FarmPlan } from '@gdt/game-data/planner-estimate'
import type { PlanTotals } from '@gdt/game-data/planner-math'
import { computed, ref, watch } from 'vue'
import { CalendarOff, ChevronDown, Clock, Info, Lock, PartyPopper } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { materialIcon } from '@/lib/assets'
import { t } from '@/i18n'
import { formatCompact, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { materialName } from '@/utils/materials'
import CraftCard from './CraftCard.vue'
import type { CraftRow } from './crafting'
import FarmCard from './FarmCard.vue'
import {
  daysText,
  formatCountdown,
  formatSeconds,
  weekdayLong,
  weekdayShort,
  weeksText,
} from './farm-format'
import { sameValue } from './keep-unchanged'
import type { GoalEntry } from './model'
import { useProgressive } from './use-progressive'
import {
  REFRESH_RESIN,
  clampRefreshes,
  farmHeadline,
  resinDays,
  scheduleDays,
  todaySections,
  type ArtifactWant,
  type FarmCard as FarmCardData,
  type FarmDay,
  type FarmInput,
} from './farm-today'

/**
 * What to farm (farm-today.ts): one headline (resin and days for domains,
 * normal bosses and ley lines at the account's daily resin, Condensed
 * Resin, weeks of weekly bosses), then
 * - Today: what can be farmed on the server's day, by what a run costs
 *   (nothing, 20, 40, 30/60), with the crafting checklist first among the
 *   no-resin cards (its steps record into the bag: `crafted`), then the
 *   artifact domains of the sets the goals want;
 * - Schedule: the other day pairs' domains.
 * Every card lists what is still missing and who needs it.
 *
 * "No weekly boss" (beside Today / Schedule; the Goals toolbar's toggle,
 * one value) narrows all of it to the goals still to farm without a weekly
 * boss (`planFor`; the page hands their share in `totals` and `plan`): the
 * cards below show only what those goals need; with none, an empty state
 * turns it off.
 */
const props = defineProps<{
  planner: PlannerData
  totals: PlanTotals
  plan: FarmPlan
  steps: readonly PlanStep[]
  /** The planner's bag (what the crafting steps can use now). */
  bag: Readonly<Record<string, number>>
  drops: DropRates | null
  ar: number | null
  wl: number | null
  refreshes: number
  day: FarmDay
  /** Original Resin now plus what the bag holds in items (null: not known). */
  resinHeld: number | null
  /** Bosses, enemies, regions and artifact domains (null: cards without places). */
  farming: FarmingData | null
  /** Artifact sets the counted goals still want. */
  artifacts: readonly ArtifactWant[]
  /** Show the Crafting checklist (a planner setting). */
  crafting: boolean
  /** Counted goals still to farm without a weekly boss. */
  noWeeklyCount: number
  /** With No weekly boss on, the cards the plan is for (priority order); null when off. */
  planFor: readonly GoalEntry[] | null
}>()
const view = defineModel<'today' | 'schedule'>('view', { required: true })
const forge = defineModel<boolean>('forge', { required: true })
const noWeekly = defineModel<boolean>('noWeekly', { required: true })
const emit = defineEmits<{ settings: []; crafted: [rows: CraftRow[]]; hideCrafting: [] }>()

/** No weekly boss is on and leaves no goal. */
const noneLeft = computed(() => props.planFor !== null && props.planFor.length === 0)

const VIEWS = computed(() => [
  { value: 'today' as const, label: t('farm.panel.today') },
  { value: 'schedule' as const, label: t('farm.panel.schedule') },
])

const input = computed<FarmInput>(() => ({
  planner: props.planner,
  plan: props.plan,
  totals: props.totals,
  drops: props.drops,
  ar: props.ar,
  wl: props.wl,
  refreshes: clampRefreshes(props.refreshes),
  farming: props.farming,
  artifacts: props.artifacts,
}))
const weekday = computed(() => props.day.weekday)
/** Cards equal to the last ones keep their objects: only the cards that changed re-render. */
let lastCards = new Map<string, FarmCardData>()
const sections = computed(() => {
  const next = new Map<string, FarmCardData>()
  const list = todaySections(input.value, weekday.value).map((s) => ({
    ...s,
    cards: s.cards.map((card) => {
      const old = lastCards.get(card.id)
      const kept = old && sameValue(old, card) ? old : card
      next.set(card.id, kept)
      return kept
    }),
  }))
  lastCards = next
  return list
})
const schedule = computed(() => scheduleDays(input.value, weekday.value))
const headline = computed(() => farmHeadline(props.plan, input.value.refreshes))

// ------------------------------------------------------------ headline

const runsText = (n: number) => t('farm.card.runs', { n: formatNumber(n) }, n)

const resinTitle = computed(() => {
  const h = headline.value
  const r = input.value.refreshes
  const runs = h.upperBound ? t('farm.card.atMost', { runs: runsText(h.runs) }) : runsText(h.runs)
  const parts = [
    t('farm.panel.runsLine', {
      runs,
      resin: formatNumber(h.resin),
      condensed: formatNumber(h.condensed),
      days: daysText(h.days),
    }),
    t('farm.panel.sources'),
    r
      ? t('farm.panel.dailyRefresh', { n: formatNumber(h.daily), r, per: REFRESH_RESIN })
      : t('farm.panel.daily', { n: formatNumber(h.daily) }),
  ]
  if (props.resinHeld !== null && h.resin > 0) {
    const left = Math.max(0, h.resin - props.resinHeld)
    parts.push(t('farm.panel.withHeld', { days: daysText(resinDays(left, r)) }))
  }
  if (h.gems.runs > 0) {
    parts.push(
      t('farm.panel.gems', { runs: runsText(h.gems.runs), resin: formatNumber(h.gems.resin) }),
    )
  }
  if (h.partial) parts.push(t('farm.panel.partial'))
  if (h.upperBound) parts.push(t('farm.panel.upperBound'))
  return parts.join(' · ')
})
const weeklyTitle = computed(() => {
  const w = headline.value.weekly
  return [
    t('farm.panel.weeklyClaims', {
      claims: t('farm.card.claims', { n: formatNumber(w.claims) }, w.claims),
      weeks: weeksText(w.weeks),
    }),
    t('farm.panel.weeklyResin', {
      resin: formatNumber(w.resin),
      max: formatNumber(w.resinMax),
    }),
    w.partial ? t('farm.panel.weeklyPartial') : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

const dayTitle = computed(() =>
  [
    weekday.value === 0
      ? t('farm.panel.serverDaySunday', { day: weekdayLong(weekday.value) })
      : t('farm.panel.serverDay', { day: weekdayLong(weekday.value) }),
    t('farm.panel.resetIn', { time: formatCountdown(props.day.msUntilReset) }),
  ].join(' · '),
)

// ------------------------------------------------------------ forging

/** Weapon EXP is short (offer forging ore from chunks), or forging is on. */
const oreCard = computed(() => sections.value.flatMap((s) => s.cards).find((c) => c.kind === 'ore'))
const forgeTitle = computed(() => {
  const f = props.totals.forge
  if (!forge.value || !f) return t('farm.panel.forgeOff')
  const line = t('farm.panel.forgeLine', {
    item: t('farm.craft.item', { count: formatNumber(f.count), name: f.ore.name }),
    mora: formatNumber(f.mora),
    time: formatSeconds(f.seconds),
  })
  return f.short ? `${line} · ${t('farm.panel.stillShort', { n: formatNumber(f.short) })}` : line
})

const dayLabel = (days: readonly number[]) => days.map(weekdayShort).join(' · ')
/** Today's sections, with a no-resin one (first) for the crafting card when nothing else needs it. */
const shown = computed(() => {
  const list = sections.value
  if (props.steps.length === 0 || list.some((s) => s.key === 'free')) return list
  return [{ key: 'free' as const, resin: '0', label: t('farm.sections.free'), cards: [] }, ...list]
})
const nothing = computed(() => shown.value.length === 0)

/** Today's resin groups folded to their heading (per device), like the Materials bag's tabs. */
const FOLDED_KEY = 'planner:farm-folded'
const folded = ref(new Set((readStorage(FOLDED_KEY) ?? '').split(',').filter(Boolean)))
function toggleFold(key: string) {
  const next = new Set(folded.value)
  if (!next.delete(key)) next.add(key)
  folded.value = next
  writeStorage(FOLDED_KEY, next.size ? [...next].join(',') : null)
}
/** The cards a folded group hides (the crafting checklist counts as one). */
const hiddenCount = (key: string) => {
  const s = shown.value.find((x) => x.key === key)
  const craft = key === 'free' && props.crafting && props.steps.length ? 1 : 0
  return (s?.cards.length ?? 0) + craft
}

/**
 * Cards mounted so far, the first ones at once and the rest over the next
 * frames (many goals make many cards); a section shows once its first card does.
 */
const progressive = useProgressive(
  computed(() => shown.value.reduce((n, s) => n + s.cards.length + 1, 0)),
)
const visible = computed(() => {
  let budget = progressive.shown.value
  return shown.value.flatMap((s) => {
    if (budget <= 0) return []
    const cards = s.cards.slice(0, Math.max(0, budget - 1))
    budget -= s.cards.length + 1
    return [{ ...s, cards }]
  })
})
watch(view, (value) => {
  if (value === 'today') progressive.restart()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <section
      v-if="!noneLeft"
      class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border-default bg-surface-raised px-3 py-2.5 shadow-sm"
      :aria-label="$t('farm.panel.totals')"
    >
      <p class="flex items-center gap-2" :title="resinTitle">
        <span class="size-7 shrink-0">
          <MaterialIcon
            :src="materialIcon('OriginalResin')"
            :name="materialName('OriginalResin')"
          />
        </span>
        <span class="tabular font-mono text-lg leading-7 font-semibold"
          ><span v-if="headline.upperBound && headline.resin > 0" aria-hidden="true">≤</span
          >{{ headline.resin > 0 ? formatNumber(headline.resin) : '–'
          }}{{ headline.partial ? '+' : '' }}</span
        >
        <span class="text-sm text-text-secondary">{{ $t('farm.panel.resin') }}</span>
        <template v-if="headline.days">
          <span class="text-text-muted" aria-hidden="true">·</span>
          <span class="tabular font-mono text-lg leading-7 font-semibold">{{
            formatNumber(headline.days)
          }}</span>
          <span class="text-sm text-text-secondary">{{
            $t('farm.panel.dayUnit', headline.days)
          }}</span>
        </template>
        <span class="sr-only">{{ resinTitle }}</span>
      </p>
      <p
        class="tabular flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-text-secondary"
      >
        <span
          v-if="headline.condensed"
          class="inline-flex items-center gap-1"
          :title="$t('farm.card.condensedTitle', { n: formatNumber(headline.condensed) })"
        >
          <span class="size-5 shrink-0">
            <MaterialIcon
              :src="materialIcon('CondensedResin')"
              :name="materialName('CondensedResin')"
            />
          </span>
          {{ formatNumber(headline.condensed) }}
          <span class="sr-only">{{ materialName('CondensedResin') }}</span>
        </span>
        <span
          v-if="input.refreshes"
          class="font-sans"
          :title="
            $t(
              'farm.panel.refreshTitle',
              { r: input.refreshes, daily: formatNumber(headline.daily) },
              input.refreshes,
            )
          "
          >{{ $t('farm.panel.perDay', { n: formatNumber(headline.daily) }) }}</span
        >
        <span v-if="headline.weekly.weeks" class="font-sans" :title="weeklyTitle"
          >{{ $t('farm.panel.weekly') }}
          <span class="font-mono"
            >{{ formatNumber(headline.weekly.weeks) }}{{ headline.weekly.partial ? '+' : '' }}</span
          >
          {{ $t('farm.panel.weekUnit', headline.weekly.weeks)
          }}<span class="sr-only">: {{ weeklyTitle }}</span></span
        >
        <span
          v-if="headline.locked"
          class="inline-flex items-center gap-1 text-warning-text"
          :title="
            $t('farm.panel.lockedTitle', { n: formatNumber(headline.locked) }, headline.locked)
          "
        >
          <Lock class="size-3.5" aria-hidden="true" />
          {{ formatNumber(headline.locked) }}
          <span class="sr-only">{{ $t('farm.panel.locked') }}</span>
        </span>
      </p>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span class="flex flex-wrap items-center gap-2">
        <UiSegmented v-model="view" :options="VIEWS" :label="$t('farm.panel.view')" />
        <FilterChip
          :pressed="noWeekly"
          :count="noWeeklyCount"
          :title="$t('farm.panel.noWeeklyTitle')"
          @toggle="noWeekly = !noWeekly"
        >
          <CalendarOff class="size-4" aria-hidden="true" />
          {{ $t('farm.panel.noWeekly') }}
        </FilterChip>
      </span>
      <span
        class="tabular inline-flex items-center gap-1 font-mono text-sm text-text-secondary"
        :title="dayTitle"
      >
        <Clock class="size-4" aria-hidden="true" />
        <span class="font-sans font-medium text-text-primary">{{ weekdayShort(weekday) }}</span>
        {{ formatCountdown(day.msUntilReset) }}
        <span class="sr-only">{{ dayTitle }}</span>
      </span>
    </div>

    <div
      v-if="noneLeft"
      class="rounded-xl border border-border-default bg-surface-raised shadow-sm"
    >
      <UiEmpty :title="$t('farm.panel.noneLeft')">
        <template #icon><CalendarOff aria-hidden="true" /></template>
        <UiButton @click="noWeekly = false">{{ $t('farm.panel.showAll') }}</UiButton>
      </UiEmpty>
    </div>

    <p
      v-else-if="plan.assumed.ar || plan.assumed.wl"
      class="-mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted"
    >
      <Info class="size-4" aria-hidden="true" />
      {{ $t('farm.panel.assumed') }}
      <UiButton variant="ghost" size="sm" @click="emit('settings')">{{
        $t('farm.panel.set')
      }}</UiButton>
    </p>

    <template v-if="!noneLeft && view === 'today'">
      <p v-if="nothing" class="flex items-center justify-center gap-2 py-8 text-text-secondary">
        <PartyPopper class="size-5" aria-hidden="true" />
        {{ $t('farm.panel.nothing') }}
      </p>

      <section
        v-for="s in visible"
        :key="s.key"
        class="mt-1 flex flex-col gap-1.5"
        :aria-label="$t('farm.panel.sectionLabel', { label: s.label, resin: s.resin })"
      >
        <h2 class="text-sm font-semibold">
          <button
            type="button"
            class="-mx-1 flex min-h-8 w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-surface-overlay"
            :aria-expanded="!folded.has(s.key)"
            :title="folded.has(s.key) ? $t('farm.panel.show') : $t('farm.craft.fold')"
            @click="toggleFold(s.key)"
          >
            <ChevronDown
              class="size-4 shrink-0 text-text-muted transition-transform"
              :class="folded.has(s.key) ? '-rotate-90' : ''"
              aria-hidden="true"
            />
            <span class="size-5 shrink-0">
              <MaterialIcon
                :src="materialIcon('OriginalResin')"
                :name="materialName('OriginalResin')"
              />
            </span>
            <span class="tabular font-mono">{{ s.resin }}</span>
            <span class="font-normal text-text-muted">{{ s.label }}</span>
            <span
              v-if="folded.has(s.key)"
              class="tabular rounded-md bg-surface-overlay px-1.5 font-mono text-xs font-normal text-text-secondary"
              :title="$t('farm.panel.hidden', { n: hiddenCount(s.key) })"
              >{{ hiddenCount(s.key) }}</span
            >
          </button>
        </h2>
        <div
          v-if="!folded.has(s.key)"
          class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3"
        >
          <CraftCard
            v-if="s.key === 'free' && crafting && steps.length"
            class="col-span-full"
            :planner="planner"
            :steps="steps"
            :bag="bag"
            @done="(rows) => emit('crafted', rows)"
            @hide="emit('hideCrafting')"
          >
            <button
              v-if="forge && !oreCard"
              type="button"
              class="min-h-8 rounded-lg border border-accent-text px-2 text-xs font-medium text-accent-text"
              aria-pressed="true"
              :title="forgeTitle"
              @click="forge = false"
            >
              {{ $t('farm.panel.forge') }}
            </button>
          </CraftCard>
          <FarmCard v-for="card in s.cards" :key="card.id" :card="card">
            <button
              v-if="card.kind === 'ore'"
              type="button"
              class="self-start rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
              :class="
                forge
                  ? 'border-accent-text text-accent-text'
                  : 'border-border-default text-text-secondary hover:text-text-primary'
              "
              :aria-pressed="forge"
              :title="forgeTitle"
              @click="forge = !forge"
            >
              {{ $t('farm.panel.forge') }}
            </button>
          </FarmCard>
        </div>
      </section>
    </template>

    <div v-else-if="!noneLeft" class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section
        v-for="pair in schedule"
        :key="pair.days.join()"
        class="flex min-w-0 flex-col gap-2"
        :aria-label="dayLabel(pair.days)"
      >
        <h2 class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm font-semibold">
          {{ dayLabel(pair.days) }}
          <span
            v-if="pair.run"
            class="tabular inline-flex items-center gap-0.5 font-mono text-xs font-normal text-text-secondary"
            :title="
              $t('farm.panel.pairTitle', {
                runs: runsText(pair.run.runs),
                resin: formatNumber(pair.run.resin),
                days: daysText(pair.run.days),
              })
            "
          >
            {{ runsText(pair.run.runs) }} ·
            <span class="size-4 shrink-0">
              <MaterialIcon
                :src="materialIcon('OriginalResin')"
                :name="materialName('OriginalResin')"
              />
            </span>
            {{ formatCompact(pair.run.resin) }}
          </span>
        </h2>
        <p v-if="pair.cards.length === 0" class="text-sm text-text-muted">–</p>
        <FarmCard v-for="card in pair.cards" :key="card.id" :card="card" />
      </section>
    </div>
  </div>
</template>
