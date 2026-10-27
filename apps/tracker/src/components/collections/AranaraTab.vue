<script setup lang="ts">
import { computed } from 'vue'
import { ARANARA_STATES, type GiAranaraState } from '@gdt/shared'
import NotCaptured from './NotCaptured.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { aranaraName, nameOr } from '@/data/collection-names'
import { t } from '@/i18n'

/** Aranara collections: each entry's state, by collection type. */
const props = defineProps<{ captured: CapturedCollections }>()

const aranara = computed(() => props.captured.aranara?.value ?? null)
const types = computed(() =>
  Object.entries(aranara.value ?? {})
    .map(([type, entries]) => ({
      type: Number(type),
      entries: Object.entries(entries)
        .map(([id, state]) => ({
          id: Number(id),
          state,
          name: nameOr(aranaraName(Number(type), Number(id)), Number(id)),
        }))
        .sort((a, b) => a.id - b.id),
    }))
    .sort((a, b) => a.type - b.type),
)
const counts = computed(() => {
  const out = Object.fromEntries(ARANARA_STATES.map((s) => [s, 0])) as Record<
    GiAranaraState,
    number
  >
  for (const { entries } of types.value) for (const entry of entries) out[entry.state]++
  return out
})
const TONE = {
  none: 'neutral',
  collectable: 'accent',
  collected: 'success',
  finished: 'success',
} as const
const stateLabel = (state: GiAranaraState) => t(`collections.aranara.states.${state}`)
</script>

<template>
  <NotCaptured v-if="!aranara" :title="$t('collections.tabs.aranara')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li v-for="state in ARANARA_STATES" :key="state" class="flex min-w-0">
        <UiStat :label="stateLabel(state)" :value="counts[state]" exact />
      </li>
    </ul>
    <UiPanel
      v-for="group in types"
      :key="group.type"
      :title="$t('collections.aranara.type', { n: group.type })"
      flush
    >
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-1.5 p-3 sm:p-5">
        <li
          v-for="entry in group.entries"
          :key="entry.id"
          class="flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-border-default bg-surface-sunken px-2.5 text-sm"
          :title="`${entry.name} · ${stateLabel(entry.state)}`"
        >
          <span
            class="min-w-0 truncate text-text-secondary"
            :class="entry.name.startsWith('#') && 'tabular font-mono'"
            >{{ entry.name }}</span
          >
          <UiBadge :tone="TONE[entry.state]">{{ stateLabel(entry.state) }}</UiBadge>
        </li>
      </ul>
    </UiPanel>
    <p class="text-sm text-text-muted">{{ $t('collections.namesSoon') }}</p>
  </div>
</template>
