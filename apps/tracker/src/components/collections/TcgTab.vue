<script setup lang="ts">
import { computed } from 'vue'
import { Layers } from 'lucide-vue-next'
import NotCaptured from './NotCaptured.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { formatNumber } from '@/lib/format'

/**
 * Genius Invokation TCG: cards owned (character cards have ids below 10000)
 * and the saved decks, by the names the player gave them. Card names wait
 * for the game data, so the cards are counted, not listed.
 */
const props = defineProps<{ captured: CapturedCollections }>()

const tcg = computed(() => props.captured.tcg?.value ?? null)
const cards = computed(() =>
  Object.entries(tcg.value?.cards ?? {}).map(([id, card]) => ({ id: Number(id), ...card })),
)
const stats = computed(() => ({
  characters: cards.value.filter((c) => c.id < 10_000).length,
  actions: cards.value.filter((c) => c.id >= 10_000).length,
  copies: cards.value.reduce((sum, c) => sum + c.count, 0),
}))
const decks = computed(() =>
  Object.entries(tcg.value?.decks ?? {})
    .map(([id, deck]) => ({ id: Number(id), ...deck }))
    .sort((a, b) => a.id - b.id),
)
</script>

<template>
  <NotCaptured v-if="!tcg" :title="$t('collections.tabs.tcg')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.tcg.cards')" :value="cards.length" exact />
      </li>
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.tcg.characterCards')" :value="stats.characters" exact />
      </li>
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.tcg.actionCards')" :value="stats.actions" exact />
      </li>
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.tcg.copies')"
          :value="stats.copies"
          exact
          :hint="$t('collections.tcg.copiesHint')"
        />
      </li>
    </ul>

    <UiPanel :title="$t('collections.tcg.decks')" flush>
      <ul v-if="decks.length > 0" class="divide-y divide-border-subtle">
        <li
          v-for="deck in decks"
          :key="deck.id"
          class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
        >
          <span class="min-w-0 flex-[999_1_12rem] truncate font-medium" :title="deck.name">{{
            deck.name || '—'
          }}</span>
          <span class="flex shrink-0 items-center gap-2">
            <UiBadge v-if="deck.id === tcg.currentDeck" tone="accent">{{
              $t('collections.tcg.inUse')
            }}</UiBadge>
            <UiBadge
              v-if="!deck.valid"
              tone="warning"
              :title="$t('collections.tcg.invalidTitle')"
              >{{ $t('collections.tcg.invalid') }}</UiBadge
            >
            <span
              class="tabular font-mono text-sm text-text-secondary"
              :title="
                $t('collections.tcg.deckTitle', {
                  characters: formatNumber(deck.characters.length),
                  cards: formatNumber(deck.cards.length),
                })
              "
              >{{ formatNumber(deck.characters.length) }} +
              {{ formatNumber(deck.cards.length) }}</span
            >
          </span>
        </li>
      </ul>
      <UiEmpty v-else :title="$t('collections.tcg.noDecks')" />
    </UiPanel>

    <UiPanel :title="$t('collections.tcg.cards')" flush>
      <UiEmpty :title="$t('collections.namesComing')" :body="$t('collections.namesComingBody')">
        <template #icon><Layers aria-hidden="true" /></template>
      </UiEmpty>
    </UiPanel>
  </div>
</template>
