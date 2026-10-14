<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { DropRates } from '@gdt/game-data/drops'
import type { FarmingData } from '@gdt/game-data/farming'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import type { FarmPlan } from '@gdt/game-data/planner-estimate'
import type { PlanTotals } from '@gdt/game-data/planner-math'
import { computed, ref, watch } from 'vue'
import {
  CalendarDays,
  CalendarOff,
  ChevronDown,
  Clock,
  Flower2,
  Info,
  Lock,
  PartyPopper,
} from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import { materialIcon } from '@/lib/assets'
import { t } from '@/i18n'
import { formatCompact, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { materialName } from '@/utils/materials'
import CraftCard from './CraftCard.vue'
import type { CraftRow } from './crafting'
import FarmCard from './FarmCard.vue'
import FarmPeople from './FarmPeople.vue'
import ResinGlyph from './ResinGlyph.vue'
import {
  FARM_TABS,
  cardsFor,
  farmPeople,
  groupCards,
  isFarmTab,
  shownTab,
  type FarmTab,
} from './farm-groups'
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
  SECTION_RESIN,
  clampRefreshes,
  farmHeadline,
  resinDays,
  scheduleDays,
  todaySections,
  type ArtifactWant,
  type FarmCard as FarmCardData,
  type FarmDay,
  type FarmInput,
  type FarmSection,
  type FarmSectionKey,
} from './farm-today'

/**
 * What to farm (farm-today.ts): one headline (resin and days for domains,
 * normal bosses and ley lines at the account's daily resin, Condensed
 * Resin, weeks of weekly bosses), then
 * - a strip of everyone the plan is for (a tap narrows the cards to one);
 * - tabs (farm-groups.ts): Today (every section), one per resin cost,
 *   Artifacts, Schedule; an empty one is disabled;
 * - Today: what can be farmed on the server's day, by what a run costs
 *   (nothing, 20, 40, 30/60), each a bar that folds (per device), with the
 *   crafting checklist first among the no-resin cards (its steps record
 *   into the bag: `crafted`), then the artifact domains of the sets the
 *   goals want; inside a section the cards sit under type labels (Ley Line
 *   Outcrop, Domain of Mastery, Domain of Forgery, …);
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
  /** The goals in priority order (the strip of who the plan is for follows it). */
  order?: readonly GoalEntry[]
}>()
const view = defineModel<'today' | 'schedule'>('view', { required: true })
const forge = defineModel<boolean>('forge', { required: true })
const noWeekly = defineModel<boolean>('noWeekly', { required: true })
const emit = defineEmits<{ settings: []; crafted: [rows: CraftRow[]]; hideCrafting: [] }>()

/** No weekly boss is on and leaves no goal. */
const noneLeft = computed(() => props.planFor !== null && props.planFor.length === 0)

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
/** The day the domains follow: Sunday while an event opens them all. */
const domainDay = computed(() => props.day.domainDay)
/** Cards equal to the last ones keep their objects: only the cards that changed re-render. */
let lastCards = new Map<string, FarmCardData>()
const sections = computed(() => {
  const next = new Map<string, FarmCardData>()
  const list = todaySections(input.value, domainDay.value).map((s) => ({
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
const schedule = computed(() => scheduleDays(input.value, domainDay.value))
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
    domainDay.value === 0
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

// ------------------------------------------------------------ who it is for

/** Everyone today's cards and the schedule's are for, in priority order. */
const people = computed(() =>
  farmPeople(
    [...sections.value.flatMap((s) => s.cards), ...schedule.value.flatMap((p) => p.cards)],
    props.order?.map((e) => e.id),
  ),
)
/** The one the cards are narrowed to (a `goalSlot`), or null for everyone. */
const person = ref<string | null>(null)
watch(people, (list) => {
  if (person.value !== null && !list.some((p) => p.slot === person.value)) person.value = null
})

// ------------------------------------------------------------ sections

const sectionLabel = (key: FarmSectionKey) => t(`farm.sections.${key}`)

/**
 * Today's sections narrowed to `person`, their cards under type labels,
 * with a no-resin one (first) for the crafting card when nothing else
 * needs it. The crafting checklist is the whole plan's: hidden while
 * narrowed to one person.
 */
const shown = computed(() => {
  const craft = props.crafting && props.steps.length > 0 && person.value === null
  const list: FarmSection[] = sections.value.map((s) => ({
    ...s,
    cards: cardsFor(s.cards, person.value),
  }))
  if (craft && !list.some((s) => s.key === 'free')) {
    list.unshift({ key: 'free', resin: SECTION_RESIN.free, label: sectionLabel('free'), cards: [] })
  }
  return list
    .filter((s) => s.cards.length > 0 || (s.key === 'free' && craft))
    .map((s) => {
      const withCraft = s.key === 'free' && craft
      return {
        ...s,
        groups: groupCards(s.key, s.cards),
        craft: withCraft,
        /** Cards in it (the crafting checklist counts as one). */
        count: s.cards.length + (withCraft ? 1 : 0),
      }
    })
})
const scheduleShown = computed(() =>
  schedule.value.map((pair) => ({ ...pair, cards: cardsFor(pair.cards, person.value) })),
)

// ------------------------------------------------------------ tabs

/** Cards per tab (an empty tab is disabled). */
const counts = computed(() => {
  const c: Partial<Record<FarmTab, number>> = {}
  for (const s of shown.value) c[s.key] = s.count
  c.all = shown.value.reduce((n, s) => n + s.count, 0)
  c.schedule = scheduleShown.value.reduce((n, p) => n + p.cards.length, 0)
  return c
})

/** The Today tab chosen last on this device ('all' or a section). */
const TAB_KEY = 'planner:farm-tab'
const storedTab = readStorage(TAB_KEY)
const todayTab = ref<FarmTab>(isFarmTab(storedTab) && storedTab !== 'schedule' ? storedTab : 'all')
/** Schedule is the page's `view`; the others are Today narrowed to one section. */
const tab = computed<FarmTab>({
  get: () => (view.value === 'schedule' ? 'schedule' : shownTab(todayTab.value, counts.value)),
  set: (value) => {
    if (value === 'schedule') {
      view.value = 'schedule'
      return
    }
    view.value = 'today'
    todayTab.value = value
    writeStorage(TAB_KEY, value === 'all' ? null : value)
  },
})
const TABS = computed<SegmentedOption<FarmTab>[]>(() =>
  FARM_TABS.map((value): SegmentedOption<FarmTab> => {
    if (value === 'all') return { value, label: t('farm.panel.today') }
    if (value === 'schedule') return { value, label: t('farm.panel.schedule'), icon: CalendarDays }
    const disabled = !counts.value[value]
    if (value === 'artifact') return { value, label: sectionLabel(value), icon: Flower2, disabled }
    return {
      value,
      label: SECTION_RESIN[value],
      icon: ResinGlyph,
      disabled,
      title: t('farm.panel.sectionLabel', {
        label: sectionLabel(value),
        resin: SECTION_RESIN[value],
      }),
    }
  }),
)
/** The sections the tab shows. */
const inTab = computed(() =>
  tab.value === 'all' ? shown.value : shown.value.filter((s) => s.key === tab.value),
)
const nothing = computed(() => inTab.value.length === 0)

/** Today's resin sections folded to their bar (per device), like the Materials bag's tabs. */
const FOLDED_KEY = 'planner:farm-folded'
const folded = ref(new Set((readStorage(FOLDED_KEY) ?? '').split(',').filter(Boolean)))
function toggleFold(key: string) {
  const next = new Set(folded.value)
  if (!next.delete(key)) next.add(key)
  folded.value = next
  writeStorage(FOLDED_KEY, next.size ? [...next].join(',') : null)
}
/** A section's cards show: on its own tab always, under Today unless folded. */
const open = (key: string) => tab.value !== 'all' || !folded.value.has(key)

/**
 * Cards mounted so far, the first ones at once and the rest over the next
 * frames (many goals make many cards); a section shows once its first card does.
 */
const progressive = useProgressive(
  computed(() => inTab.value.reduce((n, s) => n + s.cards.length + 1, 0)),
)
const visible = computed(() => {
  let budget = progressive.shown.value
  return inTab.value.flatMap((s) => {
    if (budget <= 0) return []
    budget -= 1
    const groups = []
    for (const g of s.groups) {
      if (budget <= 0) break
      groups.push({ ...g, cards: g.cards.slice(0, budget) })
      budget -= g.cards.length
    }
    return [{ ...s, groups }]
  })
})
watch([view, () => tab.value, person], ([value]) => {
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

    <FarmPeople v-if="!noneLeft" v-model="person" :people="people" />

    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div
        class="scroll-hide scroll-fade-x -mx-1 max-w-full min-w-0 overflow-x-auto px-1 whitespace-nowrap"
      >
        <UiSegmented v-model="tab" :options="TABS" :label="$t('farm.panel.view')" />
      </div>
      <span class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FilterChip
          :pressed="noWeekly"
          :count="noWeeklyCount"
          :title="$t('farm.panel.noWeeklyTitle')"
          @toggle="noWeekly = !noWeekly"
        >
          <CalendarOff class="size-4" aria-hidden="true" />
          {{ $t('farm.panel.noWeekly') }}
        </FilterChip>
        <span
          class="tabular inline-flex items-center gap-1 font-mono text-sm text-text-secondary"
          :title="dayTitle"
        >
          <Clock class="size-4" aria-hidden="true" />
          <span class="font-sans font-medium text-text-primary">{{ weekdayShort(weekday) }}</span>
          {{ formatCountdown(day.msUntilReset) }}
          <span class="sr-only">{{ dayTitle }}</span>
        </span>
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
        class="flex flex-col gap-2"
        :aria-label="$t('farm.panel.sectionLabel', { label: s.label, resin: s.resin })"
      >
        <h2 v-if="tab === 'all'" class="text-sm font-semibold">
          <button
            type="button"
            class="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg bg-accent/10 px-3 text-left transition-colors hover:bg-accent/15"
            :aria-expanded="!folded.has(s.key)"
            :title="folded.has(s.key) ? $t('farm.panel.show') : $t('farm.craft.fold')"
            @click="toggleFold(s.key)"
          >
            <ChevronDown
              class="size-4 shrink-0 text-text-secondary transition-transform"
              :class="folded.has(s.key) ? '-rotate-90' : ''"
              aria-hidden="true"
            />
            <ResinGlyph class="size-5 shrink-0" />
            <span class="tabular font-mono">{{ s.resin }}</span>
            <span class="min-w-0 truncate font-normal text-text-secondary">{{ s.label }}</span>
            <span
              class="tabular ml-auto shrink-0 rounded-md bg-surface-raised px-1.5 font-mono text-xs font-normal text-text-secondary"
              :title="$t('farm.panel.cards', { n: s.count }, s.count)"
              >{{ s.count }}</span
            >
          </button>
        </h2>
        <template v-if="open(s.key)">
          <CraftCard
            v-if="s.craft"
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
          <div v-for="g in s.groups" :key="g.key" class="flex flex-col gap-1.5">
            <h3 v-if="g.labelled" class="flex">
              <UiBadge tone="accent">{{ $t(`farm.groups.${g.key}`) }}</UiBadge>
            </h3>
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3">
              <FarmCard v-for="card in g.cards" :key="card.id" :card="card">
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
          </div>
        </template>
      </section>
    </template>

    <div v-else-if="!noneLeft" class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section
        v-for="pair in scheduleShown"
        :key="pair.days.join()"
        class="flex min-w-0 flex-col gap-2"
        :aria-label="dayLabel(pair.days)"
      >
        <h2 class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm font-semibold">
          {{ dayLabel(pair.days) }}
          <span
            v-if="pair.run && person === null"
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
