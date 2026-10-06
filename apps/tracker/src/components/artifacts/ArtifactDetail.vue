<script setup lang="ts">
import { computed } from 'vue'
import { Backpack, FlaskConical, Lock, LockOpen, Sparkle } from 'lucide-vue-next'
import CritValue from '@/components/ui/CritValue.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import RollValue from '@/components/ui/RollValue.vue'
import { upgradesLeft, type ArtifactRow } from '@/data/artifacts'
import { artifactIcon, characterIcon } from '@/lib/assets'
import { isCritCirclet } from '@/lib/crit-tiers'
import { formatNumber, keyToName } from '@/lib/format'
import { ROLL_QUALITY_LABEL, ROLL_QUALITY_TEXT, maxLevel } from '@/utils/artifact-rolls'
import {
  formatRollValue,
  formatSlotFullName,
  formatSlotName,
  formatStatName,
  formatStatValue,
} from '@/utils/artifact-stats'
import ArtifactRollBars from './ArtifactRollBars.vue'

/** One artifact: stats, rank, who wears it, and every roll coloured by tier. */
const props = defineProps<{
  row: ArtifactRow
  /** CV position among pieces of the same slot and rarity. */
  rank?: { position: number; of: number }
}>()

const artifact = computed(() => props.row.artifact)
const owner = computed(() => (artifact.value.location ? keyToName(artifact.value.location) : ''))
const inactive = computed(() => artifact.value.unactivatedSubstats ?? [])
const left = computed(() => upgradesLeft(artifact.value))
const rollsTitle = computed(() => {
  const source = (artifact.value.totalRolls ?? 0) > 0 ? 'From the game' : 'Inferred from the level'
  return left.value > 0 ? `${source} · ${left.value} upgrades to come` : source
})
const rankTitle = computed(() =>
  props.rank
    ? `CV rank among ${formatNumber(props.rank.of)} ${artifact.value.rarity}★ ${formatSlotName(artifact.value.slotKey).toLowerCase()}s`
    : '',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-start gap-4">
      <GameIcon
        :src="artifactIcon(artifact.setKey, artifact.slotKey)"
        :name="row.setName"
        :rarity="artifact.rarity"
        size="lg"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-text-secondary">{{ formatSlotFullName(artifact.slotKey) }}</p>
        <p class="font-display text-lg font-bold">{{ formatStatName(artifact.mainStatKey) }}</p>
        <p class="mt-0.5 flex items-center gap-2">
          <RarityStars :rarity="artifact.rarity" />
          <span class="tabular font-mono text-sm">
            +{{ artifact.level
            }}<span class="text-text-muted">/{{ maxLevel(artifact.rarity) }}</span>
          </span>
        </p>
      </div>
    </div>

    <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rounded-xl border border-border-default px-3 py-2">
        <dt class="text-sm text-text-secondary">CV</dt>
        <dd class="text-xl font-semibold">
          <CritValue
            :value="row.cv"
            :crit-circlet="isCritCirclet(artifact.slotKey, artifact.mainStatKey)"
          />
        </dd>
      </div>
      <div class="rounded-xl border border-border-default px-3 py-2">
        <dt class="text-sm text-text-secondary">RV</dt>
        <dd class="text-xl"><RollValue :value="row.rv" /></dd>
      </div>
      <div class="rounded-xl border border-border-default px-3 py-2" :title="rollsTitle">
        <dt class="text-sm text-text-secondary">Rolls</dt>
        <dd class="tabular font-mono text-xl">
          {{ row.rollCount }}
          <span v-if="left > 0" class="text-base text-text-muted">+{{ left }}</span>
        </dd>
      </div>
      <div v-if="rank" class="rounded-xl border border-border-default px-3 py-2" :title="rankTitle">
        <dt class="text-sm text-text-secondary">Rank</dt>
        <dd class="tabular font-mono text-xl">
          #{{ formatNumber(rank.position)
          }}<span class="text-base text-text-muted"> / {{ formatNumber(rank.of) }}</span>
        </dd>
      </div>
    </dl>

    <ul class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
      <li class="flex items-center gap-2">
        <template v-if="owner">
          <GameIcon
            :src="characterIcon(artifact.location)"
            :name="owner"
            size="sm"
            aria-hidden="true"
          />
          <span class="font-medium text-text-primary">{{ owner }}</span>
        </template>
        <template v-else>
          <Backpack class="size-4" aria-hidden="true" />
          Unequipped
        </template>
      </li>
      <li class="flex items-center gap-1.5">
        <Lock v-if="artifact.lock" class="size-4" aria-hidden="true" />
        <LockOpen v-else class="size-4" aria-hidden="true" />
        {{ artifact.lock ? 'Locked' : 'Unlocked' }}
      </li>
      <li v-if="artifact.astralMark" class="flex items-center gap-1.5">
        <Sparkle class="size-4 fill-current text-rarity-5" aria-hidden="true" />
        Astral
      </li>
      <li
        v-if="artifact.elixerCrafted"
        class="flex items-center gap-1.5"
        title="Sanctifying Elixir"
      >
        <FlaskConical class="size-4" aria-hidden="true" />
        Elixir
      </li>
    </ul>

    <ul
      class="divide-y divide-border-subtle rounded-xl border border-border-default"
      aria-label="Substats"
    >
      <li
        v-for="(substat, index) in artifact.substats"
        :key="substat.key"
        class="flex flex-col gap-1 px-3 py-2.5"
      >
        <div class="flex items-center gap-3">
          <span class="min-w-0 flex-1">{{ formatStatName(substat.key) }}</span>
          <ArtifactRollBars :rolls="row.rolls[index] ?? []" size="lg" />
          <span class="tabular w-16 text-right font-mono font-medium">
            {{ formatStatValue(substat.key, substat.value) }}
          </span>
        </div>
        <div
          v-if="row.rolls[index]?.length"
          class="tabular flex flex-wrap gap-x-3 font-mono text-sm"
          :aria-label="`${row.rolls[index]!.length} rolls`"
        >
          <span
            v-for="(roll, n) in row.rolls[index]"
            :key="n"
            :class="ROLL_QUALITY_TEXT[roll.quality]"
            :title="`${ROLL_QUALITY_LABEL[roll.quality]} roll`"
          >
            {{ formatRollValue(substat.key, roll.value) }}
          </span>
        </div>
      </li>
      <li
        v-for="substat in inactive"
        :key="`inactive-${substat.key}`"
        class="flex items-center gap-3 px-3 py-2.5 text-text-muted"
        title="Activates at +4"
      >
        <span class="min-w-0 flex-1">{{ formatStatName(substat.key) }}</span>
        <span class="text-sm">Inactive</span>
        <span class="tabular w-16 text-right font-mono">
          {{ formatStatValue(substat.key, substat.value) }}
        </span>
      </li>
    </ul>
  </div>
</template>
