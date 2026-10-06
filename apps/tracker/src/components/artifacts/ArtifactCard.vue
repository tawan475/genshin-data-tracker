<script setup lang="ts">
import { computed } from 'vue'
import { FlaskConical, Lock, Sparkle } from 'lucide-vue-next'
import CritValue from '@/components/ui/CritValue.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import RollBars from '@/components/ui/RollBars.vue'
import RollValue from '@/components/ui/RollValue.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { artifactLabel, type ArtifactRow } from '@/data/artifacts'
import { artifactIcon, characterIcon } from '@/lib/assets'
import { isCritCirclet } from '@/lib/crit-tiers'
import { formatStatName, formatStatShort, formatStatValue } from '@/utils/artifact-stats'
import { maxLevel } from '@/utils/artifact-rolls'

/**
 * One artifact in the grid: set and main stat, CV/RV in the corner (tier
 * colours for 5★; plain below, as the tiers are 5★ scales) with the CV it
 * should reach at max under it, substats with roll bars, and who wears it.
 * Words live in tooltips and the detail dialog. A transparent button covers
 * the card, so the whole card is one click target and its focus ring
 * outlines the card.
 */
const props = defineProps<{ row: ArtifactRow; isNew?: boolean }>()
const emit = defineEmits<{ open: [id: number] }>()

const artifact = computed(() => props.row.artifact)
const inactive = computed(() => artifact.value.unactivatedSubstats ?? [])
const plain = computed(() => artifact.value.rarity < 5)
const label = computed(() => artifactLabel(props.row, props.isNew))
const potential = computed(() => props.row.potential)
const potentialTitle = computed(
  () =>
    `Expected at +${maxLevel(artifact.value.rarity)} · best case ${potential.value.bestCv.toFixed(1)}`,
)
</script>

<template>
  <article
    class="relative flex min-w-0 flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm transition-colors hover:border-border-strong"
  >
    <div class="flex items-start gap-3 p-3 pb-2.5" aria-hidden="true">
      <GameIcon
        :src="artifactIcon(artifact.setKey, artifact.slotKey)"
        :name="row.setName"
        :rarity="artifact.rarity"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-text-secondary">{{ row.setName }}</p>
        <p class="truncate leading-snug font-medium">{{ formatStatName(artifact.mainStatKey) }}</p>
        <p class="flex items-center gap-2">
          <RarityStars :rarity="artifact.rarity" />
          <span class="tabular font-mono text-sm text-text-secondary">+{{ artifact.level }}</span>
          <UiBadge v-if="isNew" tone="accent" title="Not in the previous capture">New</UiBadge>
        </p>
      </div>
      <!-- Above the card's button, so the numbers' tooltips show; a click still opens it. -->
      <div
        class="tabular relative z-10 shrink-0 cursor-pointer text-right font-mono leading-tight"
        @click="emit('open', row.id)"
      >
        <CritValue
          :value="row.cv"
          :crit-circlet="isCritCirclet(artifact.slotKey, artifact.mainStatKey)"
          :plain="plain"
          class="block text-lg font-semibold"
        />
        <p class="text-xs text-text-muted">CV</p>
        <RollValue :value="row.rv" :plain="plain" class="mt-0.5 block text-sm" />
        <p
          v-if="potential.left > 0 && potential.expectedCv > row.cv"
          class="mt-0.5 text-xs whitespace-nowrap text-text-muted"
          :title="potentialTitle"
        >
          → ~{{ Math.round(potential.expectedCv) }}
        </p>
      </div>
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
        <RollBars :rolls="row.rolls[index] ?? []" />
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
      class="flex min-h-11 items-center gap-2 border-t border-border-subtle px-3 py-1.5 text-sm"
      aria-hidden="true"
    >
      <template v-if="row.ownerName">
        <GameIcon :src="characterIcon(artifact.location)" :name="row.ownerName" size="xs" />
        <span class="min-w-0 truncate text-text-secondary">{{ row.ownerName }}</span>
      </template>
      <span v-else class="text-text-muted">—</span>
      <span class="ml-auto flex shrink-0 items-center gap-1.5 text-text-muted">
        <FlaskConical v-if="artifact.elixerCrafted" class="size-4" />
        <Sparkle v-if="artifact.astralMark" class="size-4 fill-current text-rarity-5" />
        <Lock v-if="artifact.lock" class="size-4" />
      </span>
    </div>

    <button
      type="button"
      class="absolute inset-0 rounded-xl"
      :title="row.ownerName ? `${row.setName} · ${row.ownerName}` : row.setName"
      :aria-label="label"
      aria-haspopup="dialog"
      @click="emit('open', row.id)"
    />
  </article>
</template>
