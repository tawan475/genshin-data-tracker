<script setup lang="ts">
import { computed } from 'vue'
import { FlaskConical, Lock, Sparkle } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import type { ArtifactRow } from '@/data/artifacts'
import { artifactIcon, characterIcon } from '@/lib/assets'
import { keyToName } from '@/lib/format'
import {
  formatCv,
  formatSlotName,
  formatStatName,
  formatStatShort,
  formatStatValue,
} from '@/utils/artifact-stats'
import ArtifactRollBars from './ArtifactRollBars.vue'

/**
 * One artifact in the grid, visual only: words live in the tooltip and the
 * detail dialog. A transparent button covers the card, so the whole card is
 * one click target and its focus ring outlines the card.
 */
const props = defineProps<{ row: ArtifactRow }>()
const emit = defineEmits<{ open: [id: number] }>()

const artifact = computed(() => props.row.artifact)
const owner = computed(() => (artifact.value.location ? keyToName(artifact.value.location) : ''))
const inactive = computed(() => artifact.value.unactivatedSubstats ?? [])
const label = computed(() => {
  const a = artifact.value
  return [
    props.row.setName,
    `${formatSlotName(a.slotKey)} +${a.level}`,
    formatStatName(a.mainStatKey),
    `CV ${formatCv(props.row.cv)}`,
    `RV ${props.row.rv}%`,
    owner.value,
    a.lock ? 'locked' : '',
    a.astralMark ? 'astral mark' : '',
  ]
    .filter(Boolean)
    .join(', ')
})
</script>

<template>
  <article
    class="relative flex min-w-0 flex-col rounded-xl border border-border-default bg-surface-raised shadow-card transition-colors hover:border-border-strong"
  >
    <div class="flex items-start gap-3 p-3">
      <GameIcon
        :src="artifactIcon(artifact.setKey, artifact.slotKey)"
        :name="row.setName"
        :rarity="artifact.rarity"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">{{ formatStatName(artifact.mainStatKey) }}</p>
        <p class="mt-0.5 flex items-center gap-2">
          <RarityStars :rarity="artifact.rarity" />
          <span class="tabular font-mono text-sm">+{{ artifact.level }}</span>
        </p>
      </div>
      <span class="flex shrink-0 items-center gap-1.5 text-text-muted" aria-hidden="true">
        <FlaskConical v-if="artifact.elixerCrafted" class="size-4" />
        <Sparkle v-if="artifact.astralMark" class="size-4 fill-current text-rarity-5" />
        <Lock v-if="artifact.lock" class="size-4" />
      </span>
    </div>

    <ul class="flex flex-1 flex-col gap-1 px-3 pb-3 text-sm" aria-hidden="true">
      <li
        v-for="(substat, index) in artifact.substats"
        :key="substat.key"
        class="flex items-center gap-2"
      >
        <span class="min-w-0 flex-1 truncate text-text-secondary">
          {{ formatStatShort(substat.key) }}
        </span>
        <span class="tabular font-mono">{{ formatStatValue(substat.key, substat.value) }}</span>
        <ArtifactRollBars :rolls="row.rolls[index] ?? []" />
      </li>
      <li
        v-for="substat in inactive"
        :key="`inactive-${substat.key}`"
        class="flex items-center gap-2 text-text-muted opacity-60"
      >
        <span class="min-w-0 flex-1 truncate">{{ formatStatShort(substat.key) }}</span>
        <span class="tabular font-mono">{{ formatStatValue(substat.key, substat.value) }}</span>
        <span class="h-4 w-12 shrink-0 rounded-sm border border-dashed border-border-strong" />
      </li>
    </ul>

    <div
      class="flex min-h-13 items-center gap-3 border-t border-border-subtle px-3 py-2 text-sm"
      aria-hidden="true"
    >
      <span class="tabular font-mono">
        <span class="text-text-muted">CV</span> {{ formatCv(row.cv) }}
      </span>
      <span class="tabular font-mono"> <span class="text-text-muted">RV</span> {{ row.rv }}% </span>
      <GameIcon
        v-if="owner"
        :src="characterIcon(artifact.location)"
        :name="owner"
        size="sm"
        class="ml-auto"
      />
    </div>

    <button
      type="button"
      class="absolute inset-0 rounded-xl"
      :title="owner ? `${row.setName} · ${owner}` : row.setName"
      :aria-label="label"
      aria-haspopup="dialog"
      @click="emit('open', row.id)"
    />
  </article>
</template>
