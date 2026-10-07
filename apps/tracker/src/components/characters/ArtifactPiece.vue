<script setup lang="ts">
import { computed } from 'vue'
import CritValue from '@/components/ui/CritValue.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import RollValue from '@/components/ui/RollValue.vue'
import RollBars from '@/components/ui/RollBars.vue'
import { SLOT_LABELS, type EquippedArtifact, type SlotKey } from '@/data/characters'
import { artifactIcon } from '@/lib/assets'
import { isCritCirclet } from '@/lib/crit-tiers'
import { ROLL_QUALITY_LABEL, inferArtifactRolls, maxLevel } from '@/utils/artifact-rolls'
import {
  formatRollValue,
  formatSetName,
  formatStatShort,
  formatStatValue,
} from '@/utils/artifact-stats'
import { RARITY_TEXT } from './tokens'

/** One equipped artifact (or its empty slot) in the character details, rolls included. */
const props = defineProps<{ slotKey: SlotKey; piece: EquippedArtifact | null }>()

const rolls = computed(() => (props.piece ? inferArtifactRolls(props.piece) : []))
const rollCount = computed(() => {
  const p = props.piece
  if (!p) return 0
  if (p.totalRolls && p.totalRolls > 0) return p.totalRolls
  return rolls.value.reduce((sum, r) => sum + r.length, 0)
})

function rollTitle(index: number, key: string): string {
  const list = rolls.value[index] ?? []
  if (!list.length) return ''
  return list
    .map((r) => `${formatRollValue(key, r.value)} (${ROLL_QUALITY_LABEL[r.quality]})`)
    .join(' + ')
}
</script>

<template>
  <article
    v-if="piece"
    class="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-3"
  >
    <header class="flex items-center gap-2.5">
      <GameIcon
        :src="artifactIcon(piece.setKey, piece.slotKey)"
        :name="formatSetName(piece.setKey)"
        :rarity="piece.rarity"
      />
      <div class="min-w-0 flex-1">
        <p class="flex items-baseline gap-1.5 text-sm">
          <span class="text-text-secondary">{{ SLOT_LABELS[slotKey] }}</span>
          <span
            class="tabular font-mono"
            :class="piece.maxed ? 'text-text-secondary' : 'text-warning-text'"
            :title="`+${piece.level} of ${maxLevel(piece.rarity)} · ${piece.rarity}★`"
            >+{{ piece.level }}</span
          >
          <span class="text-xs" :class="RARITY_TEXT[piece.rarity]" aria-hidden="true">{{
            '★'.repeat(piece.rarity)
          }}</span>
          <span class="sr-only">{{ piece.rarity }} star</span>
        </p>
        <p class="truncate text-sm font-medium" :title="formatSetName(piece.setKey)">
          {{ formatSetName(piece.setKey) }}
        </p>
      </div>
    </header>

    <div
      class="flex items-baseline justify-between gap-2 rounded-lg bg-surface-overlay/60 px-2.5 py-1.5"
    >
      <span class="truncate font-medium">{{ formatStatShort(piece.mainStatKey) }}</span>
      <span class="tabular font-mono font-medium">
        {{
          piece.mainStatValue === null
            ? '—'
            : formatStatValue(piece.mainStatKey, piece.mainStatValue)
        }}
      </span>
    </div>

    <ul class="flex flex-col gap-1 px-1 text-sm" aria-label="Substats">
      <li
        v-for="(sub, index) in piece.substats"
        :key="sub.key"
        class="flex items-center gap-2"
        :title="rollTitle(index, sub.key)"
      >
        <span class="min-w-0 flex-1 truncate text-text-secondary">{{
          formatStatShort(sub.key)
        }}</span>
        <span class="tabular font-mono">{{ formatStatValue(sub.key, sub.value) }}</span>
        <RollBars :rolls="rolls[index] ?? []" />
      </li>
      <li
        v-for="sub in piece.unactivatedSubstats ?? []"
        :key="`inactive-${sub.key}`"
        class="flex items-center gap-2 text-text-muted"
        title="Activates at +4"
      >
        <span class="min-w-0 flex-1 truncate"
          >{{ formatStatShort(sub.key) }}<span class="sr-only"> (inactive)</span></span
        >
        <span class="tabular font-mono">{{ formatStatValue(sub.key, sub.value) }}</span>
        <span class="w-12 shrink-0" />
      </li>
    </ul>

    <p
      class="mt-auto flex items-center gap-3 border-t border-border-subtle px-1 pt-2 text-sm text-text-secondary"
    >
      <CritValue
        :value="piece.cv"
        :crit-circlet="isCritCirclet(piece.slotKey, piece.mainStatKey)"
        :plain="piece.rarity < 5"
        label
      />
      <RollValue :value="piece.rv" :plain="piece.rarity < 5" label />
      <span class="ml-auto" title="Rolls"
        ><span class="tabular font-mono">{{ rollCount }}</span> rolls</span
      >
    </p>
  </article>

  <div
    v-else
    class="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border-strong p-3 text-sm text-text-muted"
  >
    {{ SLOT_LABELS[slotKey] }}<span class="sr-only">: empty</span>
  </div>
</template>
