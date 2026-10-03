<script setup lang="ts">
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import { SLOT_LABELS, itemName, type EquippedArtifact, type SlotKey } from '@/data/characters'
import { artifactIcon } from '@/lib/assets'
import { formatStatName, formatStatValue } from '@/utils/artifact-stats'

/** One equipped artifact (or its empty slot) in the character details. */
defineProps<{ slotKey: SlotKey; piece: EquippedArtifact | null }>()
</script>

<template>
  <article
    v-if="piece"
    class="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-base p-3"
  >
    <header class="flex items-start gap-3">
      <GameIcon
        :src="artifactIcon(piece.setKey, piece.slotKey)"
        :name="itemName(piece.setKey)"
        :rarity="piece.rarity"
      />
      <div class="min-w-0 flex-1">
        <h4 class="truncate font-medium" :title="itemName(piece.setKey)">
          {{ itemName(piece.setKey) }}
        </h4>
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
          <span>{{ SLOT_LABELS[slotKey] }}</span>
          <span class="tabular font-mono">+{{ piece.level }}</span>
          <RarityStars :rarity="piece.rarity" />
        </p>
      </div>
    </header>

    <div class="flex items-baseline justify-between gap-2 border-b border-border-subtle pb-2">
      <span class="font-medium">{{ formatStatName(piece.mainStatKey) }}</span>
      <span class="tabular font-mono font-medium">
        {{
          piece.mainStatValue === null
            ? '—'
            : formatStatValue(piece.mainStatKey, piece.mainStatValue)
        }}
      </span>
    </div>

    <ul class="flex flex-col gap-1 text-sm" aria-label="Substats">
      <li
        v-for="sub in piece.substats"
        :key="sub.key"
        class="flex items-baseline justify-between gap-2"
      >
        <span class="text-text-secondary">{{ formatStatName(sub.key) }}</span>
        <span class="tabular font-mono">{{ formatStatValue(sub.key, sub.value) }}</span>
      </li>
      <li
        v-for="sub in piece.unactivatedSubstats ?? []"
        :key="`inactive-${sub.key}`"
        class="flex items-baseline justify-between gap-2 text-text-muted"
      >
        <span title="Inactive"
          >{{ formatStatName(sub.key) }}<span class="sr-only"> (inactive)</span></span
        >
        <span class="tabular font-mono">{{ formatStatValue(sub.key, sub.value) }}</span>
      </li>
    </ul>

    <p class="mt-auto flex justify-between text-sm text-text-secondary">
      <span title="Crit value">CV</span>
      <span class="tabular font-mono text-text-primary">{{ piece.cv.toFixed(1) }}</span>
    </p>
  </article>

  <div
    v-else
    class="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border-default p-3 text-sm text-text-muted"
  >
    {{ SLOT_LABELS[slotKey] }}<span class="sr-only">: empty</span>
  </div>
</template>
