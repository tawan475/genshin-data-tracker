<script setup lang="ts">
import CritValue from '@/components/ui/CritValue.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import { SLOT_KEYS, type SetSummary, type SlotKey } from '@/data/artifacts'
import { artifactSetIcon } from '@/lib/assets'
import { isCritCirclet } from '@/lib/crit-tiers'
import { formatNumber } from '@/lib/format'
import { formatCv, formatSlotName, formatStatShort } from '@/utils/artifact-stats'
import { SLOT_ICONS } from './styles'

/**
 * "Which sets do I have good pieces for": every set among the matches with
 * its best CV per slot. A set opens its pieces; a slot cell opens that slot.
 * On a phone the name takes its own line above the five slots.
 */
defineProps<{ sets: readonly SetSummary[] }>()
const emit = defineEmits<{ pick: [setKey: string, slot?: SlotKey] }>()

const GRID =
  'grid grid-cols-[repeat(5,minmax(0,1fr))_3.5rem] sm:grid-cols-[minmax(0,1fr)_3rem_repeat(5,4.25rem)_4.25rem] items-center gap-x-1.5 sm:gap-x-2'

function cellTitle(set: SetSummary, index: number): string {
  const slot = formatSlotName(SLOT_KEYS[index]!)
  const best = set.best[index]
  if (!best) return `${slot}: none`
  const main = formatStatShort(best.artifact.mainStatKey)
  return `${slot} · ${formatNumber(set.slotCounts[index] ?? 0)} · best ${main} +${best.artifact.level}, CV ${formatCv(best.cv)}`
}
</script>

<template>
  <div class="rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <div
      :class="GRID"
      class="border-b border-border-default bg-surface-overlay/50 px-3 py-2 text-sm font-medium text-text-secondary"
      aria-hidden="true"
    >
      <span class="hidden sm:block">Set</span>
      <span class="tabular hidden text-right font-mono sm:block" title="Pieces">#</span>
      <span
        v-for="slot in SLOT_KEYS"
        :key="slot"
        class="flex justify-center"
        :title="`${formatSlotName(slot)}: best CV`"
      >
        <component :is="SLOT_ICONS[slot]" class="size-4" />
      </span>
      <span class="text-right" title="Best CV per slot, added up">Σ CV</span>
    </div>

    <ul class="divide-y divide-border-subtle" aria-label="Sets">
      <li v-for="set in sets" :key="set.key" :class="GRID" class="gap-y-1 px-3 py-2">
        <button
          type="button"
          class="col-span-6 flex min-h-9 min-w-0 items-center gap-2.5 rounded-lg text-left hover:text-accent-text sm:col-span-1"
          :title="set.name"
          @click="emit('pick', set.key)"
        >
          <GameIcon :src="artifactSetIcon(set.key)" :name="set.name" size="sm" aria-hidden="true" />
          <span class="min-w-0 truncate font-medium">{{ set.name }}</span>
          <span class="tabular ml-auto font-mono text-sm text-text-muted sm:hidden">
            {{ formatNumber(set.count) }}
          </span>
        </button>
        <span class="tabular hidden text-right font-mono text-sm text-text-muted sm:block">
          {{ formatNumber(set.count) }}
        </span>
        <button
          v-for="(best, index) in set.best"
          :key="index"
          type="button"
          class="tabular flex min-h-9 items-center justify-center rounded-lg font-mono text-sm transition-colors hover:bg-surface-overlay disabled:cursor-default disabled:hover:bg-transparent"
          :class="best ? '' : 'text-text-muted'"
          :disabled="!best"
          :title="cellTitle(set, index)"
          :aria-label="cellTitle(set, index)"
          @click="emit('pick', set.key, SLOT_KEYS[index])"
        >
          <CritValue
            v-if="best"
            :value="best.cv"
            :crit-circlet="isCritCirclet(best.artifact.slotKey, best.artifact.mainStatKey)"
          />
          <template v-else>—</template>
        </button>
        <CritValue
          :value="set.score"
          scope="build"
          class="text-right text-sm font-semibold"
          detail="Best CV per slot, added up"
        />
      </li>
    </ul>
  </div>
</template>
