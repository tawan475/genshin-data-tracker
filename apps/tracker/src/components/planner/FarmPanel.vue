<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { DropRates } from '@gdt/game-data/drops'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import type { FarmPlan, ResinNow } from '@gdt/game-data/planner-estimate'
import { WEEKDAY_LABELS, type PlanTotals } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { Clock, Info, Lock, PartyPopper } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { materialIcon } from '@/lib/assets'
import { formatCompact, formatDateTime, formatNumber, formatTime } from '@/lib/format'
import CraftCard from './CraftCard.vue'
import FarmCard from './FarmCard.vue'
import { formatCountdown, formatSeconds } from './farm-format'
import {
  REFRESH_RESIN,
  clampRefreshes,
  farmHeadline,
  resinDays,
  scheduleDays,
  todaySections,
  type FarmDay,
  type FarmInput,
} from './farm-today'

/**
 * What to farm (farm-today.ts): one headline (resin and days for domains,
 * normal bosses and ley lines at the account's daily resin, Condensed
 * Resin, weeks of weekly bosses), then
 * - Today: what can be farmed on the server's day, by what a run costs
 *   (nothing, 20, 40, 30/60), with crafting among the no-resin cards;
 * - Schedule: the other day pairs' domains.
 * Every card lists what is still missing and who needs it.
 */
const props = defineProps<{
  planner: PlannerData
  totals: PlanTotals
  plan: FarmPlan
  steps: readonly PlanStep[]
  drops: DropRates | null
  ar: number | null
  wl: number | null
  refreshes: number
  day: FarmDay
  resin: ResinNow | null
}>()
const view = defineModel<'today' | 'schedule'>('view', { required: true })
const forge = defineModel<boolean>('forge', { required: true })
const emit = defineEmits<{ settings: [] }>()

const VIEWS = [
  { value: 'today' as const, label: 'Today' },
  { value: 'schedule' as const, label: 'Schedule' },
]

const input = computed<FarmInput>(() => ({
  planner: props.planner,
  plan: props.plan,
  totals: props.totals,
  drops: props.drops,
  ar: props.ar,
  wl: props.wl,
  refreshes: clampRefreshes(props.refreshes),
}))
const weekday = computed(() => props.day.weekday)
const sections = computed(() => todaySections(input.value, weekday.value))
const schedule = computed(() => scheduleDays(input.value, weekday.value))
const headline = computed(() => farmHeadline(props.plan, input.value.refreshes))

// ------------------------------------------------------------ headline

const plural = (n: number, one: string) => `${formatNumber(n)} ${one}${n === 1 ? '' : 's'}`

const resinTitle = computed(() => {
  const h = headline.value
  const r = input.value.refreshes
  const parts = [
    `${plural(h.runs, 'run')} · ${formatNumber(h.resin)} resin (${formatNumber(h.condensed)} condensed) · ${plural(h.days, 'day')}`,
    'domains, normal bosses and ley lines',
    `${formatNumber(h.daily)} resin a day${r ? ` (180 + ${r} × ${REFRESH_RESIN})` : ''}`,
  ]
  if (props.resin?.known && h.resin > 0) {
    const left = Math.max(0, h.resin - props.resin.total)
    parts.push(`${plural(resinDays(left, r), 'day')} with the resin held`)
  }
  if (h.gems.runs > 0) {
    parts.push(`gems: ${plural(h.gems.runs, 'run')}, ${formatNumber(h.gems.resin)} resin`)
  }
  if (h.partial) parts.push('some sources have no drop rate')
  return parts.join(' · ')
})
const weeklyTitle = computed(() => {
  const w = headline.value.weekly
  return [
    `Weekly bosses: ${plural(w.claims, 'claim')} over ${plural(w.weeks, 'week')}`,
    `${formatNumber(w.resin)} resin with the weekly discount (${formatNumber(w.resinMax)} without)`,
    w.partial ? 'some bosses have no drop rate' : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

const resinNowTitle = computed(() => {
  const r = props.resin
  if (!r) return ''
  const read =
    r.source === 'player'
      ? `${formatNumber(r.atSnapshot)} at login, ${formatDateTime(r.at)}`
      : `${formatNumber(r.atSnapshot)} at the snapshot`
  const parts = [`Original Resin now ~${formatNumber(r.original)}/200 (${read})`]
  if (r.fullAt) parts.push(`full at ${formatTime(r.fullAt)}`)
  if (r.bag > 0) {
    const items = r.items.map((i) => `${formatNumber(i.count)} ${i.key.replace(/Resin$/, '')}`)
    parts.push(`in the bag ${formatNumber(r.bag)} (${items.join(', ')})`)
  }
  return parts.join(' · ')
})
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayTitle = computed(
  () =>
    `Server day: ${DAY_NAMES[weekday.value]}${weekday.value === 0 ? ' (every domain open)' : ''} · the 04:00 reset in ${formatCountdown(props.day.msUntilReset)}`,
)

// ------------------------------------------------------------ forging

/** Weapon EXP is short (offer forging ore from chunks), or forging is on. */
const oreCard = computed(() => sections.value.flatMap((s) => s.cards).find((c) => c.kind === 'ore'))
const forgeTitle = computed(() => {
  const f = props.totals.forge
  if (!forge.value || !f) return 'Count the Mystic ore the chunks held can be forged into'
  return `Forge ${formatNumber(f.count)} ${f.ore.name}: ${formatNumber(f.mora)} Mora, ${formatSeconds(f.seconds)}${f.short ? ` · still short ${formatNumber(f.short)}` : ''}`
})

const dayLabel = (days: readonly number[]) => days.map((d) => WEEKDAY_LABELS[d]).join(' · ')
/** Today's sections, with a no-resin one for the crafting card when nothing else needs it. */
const shown = computed(() => {
  const list = sections.value
  if (props.steps.length === 0 || list.some((s) => s.key === 'free')) return list
  return [{ key: 'free' as const, resin: '0', label: 'No resin', cards: [] }, ...list]
})
const nothing = computed(() => shown.value.length === 0)
</script>

<template>
  <div class="flex flex-col gap-3">
    <section
      class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border-default bg-surface-raised px-3 py-2.5 shadow-sm"
      aria-label="Totals"
    >
      <p class="flex items-center gap-2" :title="resinTitle">
        <span class="size-7 shrink-0">
          <MaterialIcon :src="materialIcon('OriginalResin')" name="Original Resin" />
        </span>
        <span class="tabular font-mono text-lg leading-7 font-semibold"
          >{{ headline.resin > 0 ? formatNumber(headline.resin) : '–'
          }}{{ headline.partial ? '+' : '' }}</span
        >
        <span class="text-sm text-text-secondary">resin</span>
        <template v-if="headline.days">
          <span class="text-text-muted" aria-hidden="true">·</span>
          <span class="tabular font-mono text-lg leading-7 font-semibold">{{
            formatNumber(headline.days)
          }}</span>
          <span class="text-sm text-text-secondary">{{
            headline.days === 1 ? 'day' : 'days'
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
          :title="`${formatNumber(headline.condensed)} Condensed Resin`"
        >
          <span class="size-5 shrink-0">
            <MaterialIcon :src="materialIcon('CondensedResin')" name="Condensed Resin" />
          </span>
          {{ formatNumber(headline.condensed) }}
          <span class="sr-only">Condensed Resin</span>
        </span>
        <span
          v-if="input.refreshes"
          class="font-sans"
          :title="`${input.refreshes} resin ${input.refreshes === 1 ? 'refresh' : 'refreshes'} a day: ${formatNumber(headline.daily)} resin a day`"
          >{{ formatNumber(headline.daily) }}/day</span
        >
        <span v-if="headline.weekly.weeks" class="font-sans" :title="weeklyTitle"
          >Weekly
          <span class="font-mono"
            >{{ formatNumber(headline.weekly.weeks) }}{{ headline.weekly.partial ? '+' : '' }}</span
          >
          {{ headline.weekly.weeks === 1 ? 'week' : 'weeks'
          }}<span class="sr-only">: {{ weeklyTitle }}</span></span
        >
        <span
          v-if="headline.locked"
          class="inline-flex items-center gap-1 text-warning-text"
          :title="`${plural(headline.locked, 'source')} locked by AR/WL`"
        >
          <Lock class="size-3.5" aria-hidden="true" />
          {{ formatNumber(headline.locked) }}
          <span class="sr-only">locked by AR/WL</span>
        </span>
        <span v-if="resin?.known" class="inline-flex items-center gap-1" :title="resinNowTitle">
          <span class="font-sans text-text-muted">Resin now</span>
          ~{{ formatNumber(resin.original) }}
          <template v-if="resin.bag">
            <span class="text-text-muted" aria-hidden="true">·</span>
            +{{ formatCompact(resin.bag) }}
            <span class="font-sans text-text-muted">in bag</span>
          </template>
          <span class="sr-only">{{ resinNowTitle }}</span>
        </span>
      </p>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <UiSegmented v-model="view" :options="VIEWS" label="Farm view" />
      <span
        class="tabular inline-flex items-center gap-1 font-mono text-sm text-text-secondary"
        :title="dayTitle"
      >
        <Clock class="size-4" aria-hidden="true" />
        <span class="font-sans font-medium text-text-primary">{{ WEEKDAY_LABELS[weekday] }}</span>
        {{ formatCountdown(day.msUntilReset) }}
        <span class="sr-only">{{ dayTitle }}</span>
      </span>
    </div>

    <p
      v-if="plan.assumed.ar || plan.assumed.wl"
      class="-mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted"
    >
      <Info class="size-4" aria-hidden="true" />
      AR/WL not set: top bracket assumed
      <UiButton variant="ghost" size="sm" @click="emit('settings')">Set</UiButton>
    </p>

    <template v-if="view === 'today'">
      <p v-if="nothing" class="flex items-center justify-center gap-2 py-8 text-text-secondary">
        <PartyPopper class="size-5" aria-hidden="true" />
        Nothing to farm
      </p>

      <section
        v-for="s in shown"
        :key="s.key"
        class="mt-1 flex flex-col gap-1.5"
        :aria-label="`${s.label}: ${s.resin} resin`"
      >
        <h2 class="flex items-center gap-1.5 text-sm font-semibold">
          <span class="size-5 shrink-0">
            <MaterialIcon :src="materialIcon('OriginalResin')" name="Original Resin" />
          </span>
          <span class="tabular font-mono">{{ s.resin }}</span>
          <span class="font-normal text-text-muted">{{ s.label }}</span>
        </h2>
        <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3">
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
              Forge from chunks
            </button>
          </FarmCard>
          <CraftCard v-if="s.key === 'free' && steps.length" :planner="planner" :steps="steps">
            <button
              v-if="forge && !oreCard"
              type="button"
              class="rounded-md border border-accent-text px-2 py-0.5 text-xs font-medium text-accent-text"
              aria-pressed="true"
              :title="forgeTitle"
              @click="forge = false"
            >
              Forge from chunks
            </button>
          </CraftCard>
        </div>
      </section>
    </template>

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            :title="`${plural(pair.run.runs, 'run')} · ${formatNumber(pair.run.resin)} resin · ${plural(pair.run.days, 'day')}`"
          >
            {{ plural(pair.run.runs, 'run') }} ·
            <span class="size-4 shrink-0">
              <MaterialIcon :src="materialIcon('OriginalResin')" name="Original Resin" />
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
