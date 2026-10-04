<script setup lang="ts">
import { computed } from 'vue'
import { Check, ExternalLink, EyeOff, Hand } from 'lucide-vue-next'
import type { AchievementTexts } from '@gdt/game-data'
import {
  doneSource,
  markThrough,
  stardbAchievementUrl,
  unmarkFrom,
  type AchievementEntry,
  type DoneSource,
  type DoneState,
} from '@gdt/game-data/achievement-progress'
import { formatDate, formatNumber } from '@/lib/format'

/**
 * One achievement, or a stage chain as one row with a dot per tier. The
 * round button marks it done by hand; captured ones (green) come from a
 * snapshot and stay done. Dates and details live in tooltips.
 */
const props = defineProps<{
  entry: AchievementEntry
  text: AchievementTexts
  state: DoneState
  firstSeen: ReadonlyMap<number, number>
  /** When achievements were first captured: ids seen then were done by that date. */
  firstTakenAt: number | null
}>()
const emit = defineEmits<{ mark: [ids: number[]]; unmark: [ids: number[]] }>()

const tiers = computed(() =>
  props.entry.tiers.map((tier) => ({ tier, source: doneSource(props.state, tier.id) })),
)
const doneCount = computed(() => tiers.value.filter((t) => t.source).length)
const complete = computed(() => doneCount.value === tiers.value.length)
const chain = computed(() => tiers.value.length > 1)
/** The tier to describe: the first one left, or the last. */
const current = computed(() => {
  const index = tiers.value.findIndex((t) => !t.source)
  return tiers.value[index < 0 ? tiers.value.length - 1 : index]!.tier
})
const words = computed(
  () =>
    props.text.achievements.get(current.value.id) ?? {
      title: `#${current.value.id}`,
      description: '',
    },
)

const state = computed<DoneSource | null>(() => {
  if (!complete.value) return null
  return tiers.value.every((t) => t.source === 'captured') ? 'captured' : 'marked'
})
const unmarkable = computed(() => unmarkFrom(props.entry, 0, props.state))
const anyMarked = computed(() => tiers.value.some((t) => t.source === 'marked'))

function doneOn(id: number): string {
  const at = props.firstSeen.get(id)
  if (at === undefined) return 'Captured'
  return `Completed ${at === props.firstTakenAt ? 'by ' : ''}${formatDate(at)}`
}

function status(id: number, source: DoneSource | null): string {
  if (source === 'captured') return `${doneOn(id)} · in a snapshot, can't be unmarked`
  if (source === 'marked') return 'Marked by hand · click to unmark'
  return 'Click to mark done'
}

const mainTitle = computed(() => {
  if (!complete.value) return chain.value ? 'Mark every tier done' : 'Mark done'
  if (state.value === 'captured') return status(props.entry.tiers.at(-1)!.id, 'captured')
  return chain.value && unmarkable.value.length < tiers.value.length
    ? 'Click to unmark the tiers marked by hand'
    : 'Marked by hand · click to unmark'
})

function toggle() {
  if (!complete.value) emit('mark', markThrough(props.entry, tiers.value.length - 1, props.state))
  else if (unmarkable.value.length) emit('unmark', unmarkable.value)
}

function toggleTier(index: number) {
  const source = tiers.value[index]!.source
  if (!source) emit('mark', markThrough(props.entry, index, props.state))
  else if (source === 'marked') emit('unmark', unmarkFrom(props.entry, index, props.state))
}

function tierTitle(index: number): string {
  const { tier, source } = tiers.value[index]!
  const description = props.text.achievements.get(tier.id)?.description ?? ''
  return [`Tier ${index + 1} · ${tier.primogems} primogems`, description, status(tier.id, source)]
    .filter(Boolean)
    .join('\n')
}

const rewardTitle = computed(() =>
  chain.value
    ? `${tiers.value.map((t) => t.tier.primogems).join(' + ')} primogems`
    : `${props.entry.primogems} primogems`,
)

const FILL: Record<DoneSource, string> = {
  captured: 'bg-success-text text-surface-raised',
  marked: 'bg-accent text-accent-ink',
}
</script>

<template>
  <li class="flex items-start gap-3 px-3 py-3 sm:gap-4 sm:px-5">
    <button
      type="button"
      class="group -m-0.5 flex size-11 shrink-0 items-center justify-center rounded-full"
      :aria-pressed="complete"
      :aria-disabled="complete && unmarkable.length === 0 ? 'true' : undefined"
      :aria-label="`${words.title}: ${state === 'captured' ? 'captured' : state === 'marked' ? 'marked by hand' : 'not done'}`"
      :title="mainTitle"
      @click="toggle"
    >
      <span
        class="flex size-7 items-center justify-center rounded-full transition-colors"
        :class="
          state
            ? FILL[state]
            : 'border-2 border-border-strong text-transparent group-hover:border-accent group-hover:text-accent-text'
        "
      >
        <Check class="size-4" stroke-width="3" aria-hidden="true" />
      </span>
    </button>

    <div class="min-w-0 flex-1">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <p class="leading-snug font-medium">{{ words.title }}</p>
          <p class="mt-0.5 text-sm text-text-secondary">{{ words.description }}</p>
        </div>
        <span
          class="tabular mt-0.5 flex shrink-0 items-center gap-1 font-mono text-sm font-medium"
          :class="complete ? 'text-text-muted' : 'text-text-primary'"
          :title="rewardTitle"
        >
          <img src="/img/Item_Primogem.webp" alt="" class="size-5" loading="lazy" />
          {{ formatNumber(entry.primogems) }}
          <span class="sr-only">primogems</span>
        </span>
      </div>

      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <span v-if="chain" class="-my-1 -ml-1.5 flex items-center" role="group" aria-label="Tiers">
          <button
            v-for="(t, index) in tiers"
            :key="t.tier.id"
            type="button"
            class="flex size-7 items-center justify-center rounded-full hover:bg-surface-overlay"
            :aria-pressed="t.source !== null"
            :aria-disabled="t.source === 'captured' ? 'true' : undefined"
            :aria-label="`Tier ${index + 1}`"
            :title="tierTitle(index)"
            @click="toggleTier(index)"
          >
            <span
              class="size-2.5 rounded-full"
              :class="
                t.source === 'captured'
                  ? 'bg-success-text'
                  : t.source === 'marked'
                    ? 'bg-accent'
                    : 'ring-1 ring-border-strong ring-inset'
              "
            />
          </button>
          <span class="tabular ml-1 font-mono">{{ doneCount }}/{{ tiers.length }}</span>
        </span>
        <span v-if="entry.version" class="tabular font-mono" :title="`Added in ${entry.version}`"
          >v{{ entry.version }}</span
        >
        <span v-if="entry.hidden" class="flex items-center gap-1" title="Hidden achievement">
          <EyeOff class="size-3.5" aria-hidden="true" />
          Hidden
        </span>
        <span v-if="anyMarked" class="flex items-center text-accent-text" title="Marked by hand">
          <Hand class="size-3.5" aria-hidden="true" />
          <span class="sr-only">Marked by hand</span>
        </span>
        <a
          :href="stardbAchievementUrl(entry.tiers.at(-1)!.id)"
          target="_blank"
          rel="noopener noreferrer"
          class="-my-1 ml-auto inline-flex min-h-7 items-center gap-1 rounded px-1 hover:text-text-primary"
          title="Guide on stardb.gg"
        >
          <ExternalLink class="size-3.5" aria-hidden="true" />
          <span class="sr-only">Guide on stardb.gg</span>
        </a>
      </div>
    </div>
  </li>
</template>
