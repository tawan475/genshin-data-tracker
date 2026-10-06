<script setup lang="ts">
import { computed } from 'vue'
import { Lock, TriangleAlert } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import { artifactSetIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { formatSetName } from '@/utils/artifact-stats'
import { ELSEWHERE, type FarmCard } from './farm-today'
import { bracketText, statusTitle } from './farm-format'
import GoalAvatars from './GoalAvatars.vue'
import MaterialCell from './MaterialCell.vue'

/**
 * One place to farm (Seelie's farm card): its name (a boss, an enemy, a
 * region, a domain) with the other places underneath, the runs, resin,
 * Condensed Resin and days it takes ("at most" where the estimate is an
 * upper bound), the materials still missing (each opens the inventory
 * editor) or the artifact sets wanted, and who needs them (a tap opens the
 * goal, a long press pauses it). Up to two items sit beside the text, more
 * go under it. A card the account can't farm yet is greyed with what it
 * lacks.
 */
const props = defineProps<{ card: FarmCard }>()

const side = computed(() => props.card.lines.length + props.card.sets.length <= 2)
const run = computed(() => props.card.run)
const locked = computed(() => props.card.lock !== null)

const plural = (n: number, one: string) => `${formatNumber(n)} ${one}${n === 1 ? '' : 's'}`

const runTitle = computed(() => {
  const r = run.value
  if (!r) return ''
  const parts = [
    r.weekly
      ? `${plural(r.runs, 'claim')}, one a week`
      : `${r.upperBound ? 'at most ' : ''}${plural(r.runs, 'run')}`,
    r.weekly && r.resinMax !== r.resin
      ? `${formatNumber(r.resin)}–${formatNumber(r.resinMax)} resin`
      : `${formatNumber(r.resin)} resin`,
    `${formatNumber(r.condensed)} condensed`,
    r.weekly ? plural(r.days, 'week') : plural(r.days, 'day'),
  ]
  if (r.bracket) parts.push(bracketText(r.bracket))
  if (r.upperBound) parts.push('the drop rate is a guaranteed minimum')
  return parts.join(' · ')
})

const lockTitle = computed(() => {
  const lock = props.card.lock
  if (!lock) return ''
  return `Not yet: needs ${lock.replace(/^AR /, 'Adventure Rank ').replace(/^WL /, 'World Level ')}`
})
const KIND_TITLE: Partial<Record<FarmCard['kind'], string>> = {
  boss: 'Boss',
  gem: 'Bosses dropping it',
  common: 'Enemies dropping it',
  elite: 'Enemies dropping it',
  local: 'Grows in',
  artifact: 'Artifact domain',
}
const title = computed(() => {
  const c = props.card
  if (c.kind === 'artifact' && c.name === ELSEWHERE) return 'No domain drops these sets'
  return [
    c.name,
    c.detail,
    c.domain === 'talent'
      ? 'Talent books'
      : c.domain === 'weapon'
        ? 'Weapon materials'
        : (KIND_TITLE[c.kind] ?? ''),
  ]
    .filter(Boolean)
    .join(' · ')
})
const meta = computed(
  () =>
    !!props.card.detail ||
    locked.value ||
    !!run.value ||
    props.card.status === 'no-rate' ||
    props.card.paid > 0 ||
    props.card.blocked > 0,
)
</script>

<template>
  <article
    class="flex min-w-0 gap-2 rounded-xl border border-border-default bg-surface-raised p-2 shadow-sm [contain-intrinsic-size:auto_6rem] [content-visibility:auto]"
    :class="[side ? 'flex-row items-start' : 'flex-col', locked ? 'opacity-60' : '']"
  >
    <div v-if="side" class="flex shrink-0 gap-1">
      <MaterialCell v-for="line in card.lines" :key="line.material.key" :line="line" size="xs" />
      <GameIcon
        v-for="set in card.sets"
        :key="set"
        :src="artifactSetIcon(set)"
        :name="formatSetName(set)"
        :title="formatSetName(set)"
        :rarity="5"
        size="sm"
      />
    </div>

    <div class="flex min-w-0 flex-col gap-0.5" :class="side ? 'flex-1' : ''">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="min-w-0 flex-1 truncate text-sm leading-7 font-semibold" :title="title">
          {{ card.name }}
        </h3>
        <GoalAvatars class="shrink-0" :goals="card.goals" :max="side ? 3 : 5" />
      </div>

      <p
        v-if="meta"
        class="tabular flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-xs leading-5 text-text-secondary"
      >
        <span
          v-if="card.detail"
          class="max-w-full min-w-0 truncate font-sans text-text-muted"
          :title="title"
          >{{ card.detail }}</span
        >
        <span
          v-if="locked"
          class="inline-flex items-center gap-1 font-sans font-medium text-warning-text"
          :title="lockTitle"
        >
          <Lock class="size-3.5" aria-hidden="true" />
          {{ card.lock }}<span class="sr-only">: {{ lockTitle }}</span>
        </span>
        <template v-else-if="run">
          <span :title="runTitle"
            ><span v-if="run.upperBound" class="font-sans">at most </span
            >{{ formatNumber(run.runs) }} {{ run.weekly ? 'claims' : 'runs'
            }}<span class="sr-only"> ({{ runTitle }})</span></span
          >
          <span class="inline-flex items-center gap-0.5" :title="runTitle" aria-hidden="true">
            <span class="size-4 shrink-0">
              <MaterialIcon :src="materialIcon('OriginalResin')" name="Original Resin" />
            </span>
            {{ formatCompact(run.resin) }}
          </span>
          <span
            v-if="run.condensed"
            class="inline-flex items-center gap-0.5"
            :title="`${formatNumber(run.condensed)} Condensed Resin`"
            aria-hidden="true"
          >
            <span class="size-4 shrink-0">
              <MaterialIcon :src="materialIcon('CondensedResin')" name="Condensed Resin" />
            </span>
            {{ formatNumber(run.condensed) }}
          </span>
          <span :title="runTitle" aria-hidden="true">{{
            run.weekly ? plural(run.days, 'week') : plural(run.days, 'day')
          }}</span>
        </template>
        <span
          v-else-if="card.status === 'no-rate'"
          class="font-sans text-text-muted"
          :title="statusTitle('no-rate')"
          >No rate</span
        >
        <span
          v-if="card.paid"
          class="text-text-muted"
          :title="`The planned domain runs pay ${formatNumber(card.paid)} Mora`"
          >+{{ formatCompact(card.paid) }} from domains</span
        >
        <span
          v-if="card.blocked"
          class="inline-flex items-center gap-1 font-sans text-warning-text"
          :title="`${formatNumber(card.blocked)} conversions need more Dream Solvent`"
        >
          <TriangleAlert class="size-3.5" aria-hidden="true" />
          {{ formatNumber(card.blocked) }} blocked<span class="sr-only"
            >: need more Dream Solvent</span
          >
        </span>
      </p>
      <slot />
    </div>

    <div v-if="!side" class="flex flex-wrap gap-1">
      <MaterialCell v-for="line in card.lines" :key="line.material.key" :line="line" size="xs" />
      <GameIcon
        v-for="set in card.sets"
        :key="set"
        :src="artifactSetIcon(set)"
        :name="formatSetName(set)"
        :title="formatSetName(set)"
        :rarity="5"
        size="sm"
      />
    </div>
  </article>
</template>
