<script setup lang="ts">
import type { DomainKind, PlannerData } from '@gdt/game-data'
import type { PlanStep } from '@gdt/game-data/planner-convert'
import type {
  DaySchedule,
  FarmGroup,
  FarmLeyLine,
  FarmPlan,
  ResinNow,
  TodayPlan,
} from '@gdt/game-data/planner-estimate'
import { WEEKDAY_LABELS, type PlanTotals, type SourceKind } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { Info, PartyPopper } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import CraftList from './CraftList.vue'
import DomainCard from './DomainCard.vue'
import FarmTiles from './FarmTiles.vue'
import RunBadge from './RunBadge.vue'
import SourceCard from './SourceCard.vue'
import TodayPanel from './TodayPanel.vue'
import WeeklyCard from './WeeklyCard.vue'
import { formatSeconds } from './farm-format'

/**
 * "What to farm": the headline (resin, weeks, Mora, EXP, conversion
 * currencies), today's domains, then one of three views:
 * - Sources: domain entrances (open today first), weekly bosses with their
 *   Dream Solvent conversions, normal bosses, gems (Dust of Azoth), ley
 *   lines, and what has no resin source;
 * - Schedule: the domains by day pair (Mon/Thu, Tue/Fri, Wed/Sat);
 * - Craft: what the totals assume you craft, convert and forge first.
 */
const props = defineProps<{
  planner: PlannerData
  totals: PlanTotals
  plan: FarmPlan
  steps: readonly PlanStep[]
  schedule: readonly DaySchedule[]
  today: TodayPlan
  resin: ResinNow | null
  /** Weapon EXP is short (offer forging ore from chunks). */
  oreShort: boolean
}>()
const missingOnly = defineModel<boolean>('missingOnly', { required: true })
const view = defineModel<'sources' | 'schedule' | 'craft'>('view', { required: true })
const forge = defineModel<boolean>('forge', { required: true })
const emit = defineEmits<{ settings: [] }>()

const VIEWS = computed(() => [
  { value: 'sources' as const, label: 'Sources' },
  { value: 'schedule' as const, label: 'Schedule' },
  {
    value: 'craft' as const,
    label: props.steps.length ? `Craft ${props.steps.length}` : 'Craft',
  },
])

const weekday = computed(() => props.today.weekday)
const solvent = computed(
  () => props.planner.materialsByKey.get(props.planner.items.dreamSolvent) ?? null,
)
const dust = computed(() => props.planner.materialsByKey.get(props.planner.items.dustOfAzoth))

const shown = <T extends { missing: number }>(list: readonly T[]) =>
  missingOnly.value ? list.filter((x) => x.missing > 0) : [...list]

// ---------------------------------------------------------------- sources

const DOMAIN_SECTIONS: { kind: DomainKind; label: string }[] = [
  { kind: 'talent', label: 'Talent books' },
  { kind: 'weapon', label: 'Weapon materials' },
]

const domainSections = computed(() =>
  DOMAIN_SECTIONS.map((s) => {
    const all = props.plan.domains.filter((d) => d.entry.kind === s.kind)
    const openToday = (d: (typeof all)[number]) =>
      d.groups.some((g) => g.missing > 0 && g.weekdays.includes(weekday.value))
    const list = all
      .filter((d) => !missingOnly.value || d.status !== 'done')
      .map((d) => ({
        ...d,
        groups: missingOnly.value ? d.groups.filter((g) => g.missing > 0) : d.groups,
      }))
      .sort((a, b) => Number(openToday(b)) - Number(openToday(a)))
    return { ...s, list, missing: all.filter((d) => d.status !== 'done').length }
  }).filter((s) => s.list.length > 0),
)

const weekly = computed(() => shown(props.plan.weekly))

const GROUP_SECTIONS: { kind: SourceKind; label: string; compact: boolean }[] = [
  { kind: 'boss', label: 'Bosses', compact: true },
  { kind: 'gem', label: 'Gems', compact: false },
  { kind: 'local', label: 'Specialties', compact: true },
  { kind: 'enemy', label: 'Enemy drops', compact: false },
  { kind: 'crown', label: 'Crowns', compact: true },
]

const groupSections = computed(() => {
  const byKind = (kind: SourceKind) => props.plan.groups.filter((g) => g.kind === kind)
  return GROUP_SECTIONS.map((s) => {
    const all = byKind(s.kind)
    return { ...s, list: shown(all), missing: all.filter((g) => g.missing > 0).length }
  })
})
const before = computed(() => groupSections.value.slice(0, 2).filter((s) => s.list.length))
const after = computed(() => groupSections.value.slice(2).filter((s) => s.list.length))

const gemConversions = (g: FarmGroup) =>
  props.totals.azoth?.conversions.filter((c) => c.to.family?.key === g.key) ?? []

interface LeyCard {
  line: FarmLeyLine
  name: string
  icon: string
  missing: string
  title: string
}
const leyLines = computed<LeyCard[]>(() => {
  const { exp, mora } = props.plan.leyLines
  const book = props.planner.expItems.character.at(-1)
  const list: LeyCard[] = [
    {
      line: exp,
      name: 'Blossom of Revelation',
      icon: book ? gameIcon(book.material.icon) : '',
      missing: `${formatCompact(exp.missing)} EXP`,
      title: `Character EXP missing ${formatNumber(exp.missing)}`,
    },
    {
      line: mora,
      name: 'Blossom of Wealth',
      icon: materialIcon('Mora'),
      missing: formatCompact(Math.max(0, mora.missing - mora.fromDomains)),
      title: `Mora missing ${formatNumber(mora.missing)} · the planned domain runs pay ${formatNumber(mora.fromDomains)}`,
    },
  ]
  return list.filter((c) => !missingOnly.value || c.line.status !== 'done')
})

const anyMissing = computed(
  () =>
    props.plan.domains.some((d) => d.status !== 'done') ||
    props.plan.weekly.some((w) => w.missing > 0) ||
    props.plan.groups.some((g) => g.missing > 0) ||
    props.plan.leyLines.exp.status !== 'done' ||
    props.plan.leyLines.mora.status !== 'done',
)

// ---------------------------------------------------------------- schedule

const days = computed(() =>
  props.schedule.map((day) => {
    const domains = day.domains
      .map((d) => ({
        ...d,
        groups: missingOnly.value ? d.groups.filter((g) => g.missing > 0) : d.groups,
      }))
      .filter((d) => d.groups.length > 0)
    return {
      ...day,
      domains,
      label: day.days.map((d) => WEEKDAY_LABELS[d]).join(' · '),
      today: day.days.includes(weekday.value),
    }
  }),
)

const forgeTitle = computed(() => {
  const f = props.totals.forge
  if (!forge.value || !f) return 'Count the Mystic ore the chunks held can be forged into'
  return `Forge ${formatNumber(f.count)} ${f.ore.name}: ${formatNumber(f.mora)} Mora, ${formatSeconds(f.seconds)}${f.short ? ` · still short ${formatNumber(f.short)}` : ''}`
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <FarmTiles :planner="planner" :totals="totals" :plan="plan" :resin="resin" />

    <p
      v-if="plan.assumed.ar || plan.assumed.wl"
      class="-mt-3 flex flex-wrap items-center gap-2 text-sm text-text-muted"
    >
      <Info class="size-4" aria-hidden="true" />
      AR/WL not set: top bracket assumed
      <UiButton variant="ghost" size="sm" @click="emit('settings')">Set</UiButton>
    </p>

    <TodayPanel :today="today" :resin="resin" />

    <div class="flex flex-wrap items-center justify-between gap-2">
      <UiSegmented v-model="view" :options="VIEWS" label="Farm view" />
      <div class="flex flex-wrap gap-2">
        <span v-if="oreShort || forge" :title="forgeTitle">
          <FilterChip :pressed="forge" @toggle="forge = !forge">Forge</FilterChip>
        </span>
        <FilterChip
          v-if="view !== 'craft'"
          :pressed="missingOnly"
          @toggle="missingOnly = !missingOnly"
          >Missing</FilterChip
        >
      </div>
    </div>

    <template v-if="view === 'sources'">
      <p
        v-if="!anyMissing && missingOnly"
        class="flex items-center justify-center gap-2 py-8 text-text-secondary"
      >
        <PartyPopper class="size-5" aria-hidden="true" />
        Nothing missing
      </p>

      <section v-for="s in domainSections" :key="s.kind" :aria-label="s.label">
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold">
          {{ s.label }}
          <span class="tabular font-mono text-sm font-normal text-text-muted">{{ s.missing }}</span>
        </h2>
        <div class="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DomainCard
            v-for="d in s.list"
            :key="d.id"
            :entry="d.entry"
            :groups="d.groups"
            :run="d.run"
            :status="d.status"
            :goals="d.goals"
            :today="weekday"
          />
        </div>
      </section>

      <section v-if="weekly.length" aria-label="Weekly bosses">
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold">
          Weekly bosses
          <span class="tabular font-mono text-sm font-normal text-text-muted">{{
            plan.weekly.filter((w) => w.missing > 0).length
          }}</span>
        </h2>
        <div class="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
          <WeeklyCard v-for="w in weekly" :key="w.id" :weekly="w" :solvent="solvent" />
        </div>
      </section>

      <section v-for="s in before" :key="s.kind" :aria-label="s.label">
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold">
          {{ s.label }}
          <span class="tabular font-mono text-sm font-normal text-text-muted">{{ s.missing }}</span>
          <span
            v-if="s.kind === 'gem' && plan.total.gems.runs"
            class="tabular ml-auto font-mono text-xs font-normal text-text-secondary"
            :title="`Normal boss runs for gems: ${formatNumber(plan.total.gems.runs)}, ${formatNumber(plan.total.gems.resin)} resin (not in the headline)`"
            >×{{ formatNumber(plan.total.gems.runs) }} ·
            {{ formatCompact(plan.total.gems.resin) }}</span
          >
        </h2>
        <div
          class="grid gap-2 sm:gap-3"
          :class="
            s.compact
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          "
        >
          <SourceCard
            v-for="g in s.list"
            :key="g.id"
            :group="g"
            :compact="s.compact"
            :conversions="s.kind === 'gem' ? gemConversions(g) : undefined"
            :via="dust"
          />
        </div>
      </section>

      <section v-if="leyLines.length" aria-label="Ley lines">
        <h2 class="mb-2 text-base font-semibold">Ley lines</h2>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-4">
          <article
            v-for="c in leyLines"
            :key="c.line.kind"
            class="flex items-center gap-2.5 rounded-xl border border-border-default bg-surface-raised p-2.5 shadow-sm"
            :title="c.title"
          >
            <span class="size-12 shrink-0 overflow-hidden rounded-lg bg-surface-sunken text-xs">
              <MaterialIcon :src="c.icon" :name="c.name" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <h3 class="truncate text-sm font-medium">{{ c.name }}</h3>
              <span
                class="tabular font-mono text-xs"
                :class="c.line.status === 'done' ? 'text-success-text' : 'text-warning-text'"
                >{{ c.line.status === 'done' ? '✓' : c.missing }}</span
              >
              <RunBadge :run="c.line.run" :status="c.line.status" />
            </span>
            <span class="sr-only">{{ c.title }}</span>
          </article>
        </div>
      </section>

      <section v-for="s in after" :key="s.kind" :aria-label="s.label">
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold">
          {{ s.label }}
          <span class="tabular font-mono text-sm font-normal text-text-muted">{{ s.missing }}</span>
        </h2>
        <div
          class="grid gap-2 sm:gap-3"
          :class="
            s.compact
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          "
        >
          <SourceCard v-for="g in s.list" :key="g.id" :group="g" :compact="s.compact" />
        </div>
      </section>
    </template>

    <div v-else-if="view === 'schedule'" class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section
        v-for="day in days"
        :key="day.label"
        class="flex flex-col gap-2"
        :aria-label="day.label"
      >
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <span
            class="rounded-md px-2 py-0.5"
            :class="day.today && weekday !== 0 ? 'bg-accent text-accent-ink' : ''"
            >{{ day.label }}</span
          >
          <span class="ml-auto font-normal">
            <RunBadge :run="day.run" :status="day.run ? 'ok' : 'done'" />
          </span>
        </h2>
        <p v-if="day.domains.length === 0" class="text-sm text-text-muted">–</p>
        <DomainCard
          v-for="d in day.domains"
          :key="d.domain.id"
          :entry="d.domain.entry"
          :groups="d.groups"
          :run="d.run"
          :status="d.run ? 'ok' : d.domain.status"
          :goals="d.domain.goals"
          :today="weekday"
          compact
        />
      </section>
    </div>

    <CraftList v-else :planner="planner" :steps="steps" />
  </div>
</template>
