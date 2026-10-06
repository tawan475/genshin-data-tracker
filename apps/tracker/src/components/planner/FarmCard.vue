<script setup lang="ts">
import { computed } from 'vue'
import { Lock, TriangleAlert } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import type { FarmCard } from './farm-today'
import { bracketText, statusTitle } from './farm-format'
import GoalAvatars from './GoalAvatars.vue'
import MaterialCell from './MaterialCell.vue'

/**
 * One place to farm (Seelie's farm card): its name, the runs, resin,
 * Condensed Resin and days it takes, the materials still missing (each
 * opens the inventory editor) and who needs them (a tap opens the goal, a
 * long press pauses it). Up to two materials sit beside the text, more go
 * under it. A card the account can't farm yet is greyed with what it lacks.
 */
const props = defineProps<{ card: FarmCard }>()

const side = computed(() => props.card.lines.length <= 2)
const run = computed(() => props.card.run)
const locked = computed(() => props.card.lock !== null)

const plural = (n: number, one: string) => `${formatNumber(n)} ${one}${n === 1 ? '' : 's'}`

const runTitle = computed(() => {
  const r = run.value
  if (!r) return ''
  const parts = [
    r.weekly ? `${plural(r.runs, 'claim')}, one a week` : plural(r.runs, 'run'),
    r.weekly && r.resinMax !== r.resin
      ? `${formatNumber(r.resin)}–${formatNumber(r.resinMax)} resin`
      : `${formatNumber(r.resin)} resin`,
    `${formatNumber(r.condensed)} condensed`,
    r.weekly ? plural(r.days, 'week') : plural(r.days, 'day'),
  ]
  if (r.bracket) parts.push(bracketText(r.bracket))
  return parts.join(' · ')
})

const lockTitle = computed(() => {
  const lock = props.card.lock
  if (!lock) return ''
  return `Not yet: needs ${lock.replace(/^AR /, 'Adventure Rank ').replace(/^WL /, 'World Level ')}`
})
const title = computed(() =>
  [
    props.card.name,
    props.card.detail,
    props.card.domain === 'talent'
      ? 'Talent books'
      : props.card.domain === 'weapon'
        ? 'Weapon materials'
        : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
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
    class="flex min-w-0 gap-2 rounded-xl border border-border-default bg-surface-raised p-2 shadow-sm"
    :class="[side ? 'flex-row items-start' : 'flex-col', locked ? 'opacity-60' : '']"
  >
    <div v-if="side" class="flex shrink-0 gap-1">
      <MaterialCell v-for="line in card.lines" :key="line.material.key" :line="line" size="xs" />
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
        <span v-if="card.detail" class="font-sans text-text-muted" :title="title">{{
          card.detail
        }}</span>
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
    </div>
  </article>
</template>
