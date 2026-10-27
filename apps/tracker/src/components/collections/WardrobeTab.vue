<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCheck } from 'lucide-vue-next'
import { WARDROBE_KINDS, type WardrobeKind } from '@gdt/shared'
import EntryGrid, { type GridEntry } from './EntryGrid.vue'
import HaveFilter, { type HaveFilterValue } from './HaveFilter.vue'
import NotCaptured from './NotCaptured.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { idLabel, wardrobeEntries, type CollectionCatalog } from '@/data/collection-names'
import { characterIcon } from '@/lib/assets'
import { formatDateTime, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { characterName } from '@/i18n/game-names'
import { t } from '@/i18n'

/**
 * The wardrobe: per kind (outfits, gliders, weapon appearances, trails)
 * what is owned of what the game has, who wears what and which trials run
 * out, then the saved teams by the names the player gave them.
 */
const props = defineProps<{ captured: CapturedCollections; catalog: CollectionCatalog }>()

const wardrobe = computed(() => props.captured.wardrobe?.value ?? null)

const KIND_KEY = 'collections:wardrobe-kind'
const FILTER_KEY = 'collections:wardrobe-filter'
const storedKind = readStorage(KIND_KEY)
const kind = ref<WardrobeKind>(
  (WARDROBE_KINDS as readonly string[]).includes(storedKind ?? '')
    ? (storedKind as WardrobeKind)
    : 'outfits',
)
watch(kind, (value) => writeStorage(KIND_KEY, value === 'outfits' ? null : value))
const storedFilter = readStorage(FILTER_KEY) as HaveFilterValue | null
const filter = ref<HaveFilterValue>(
  storedFilter === 'missing' || storedFilter === 'have' ? storedFilter : 'all',
)
watch(filter, (value) => writeStorage(FILTER_KEY, value === 'all' ? null : value))

const kinds = computed(() =>
  WARDROBE_KINDS.map((k) => {
    const value = wardrobe.value?.[k]
    const owned = new Set(value?.owned ?? [])
    const known = wardrobeEntries(props.catalog, k)
    const knownIds = new Set(known.map((entry) => entry.id))
    const wearers = new Map<number, string[]>()
    for (const [key, id] of Object.entries(value?.worn ?? {})) {
      wearers.set(id, [...(wearers.get(id) ?? []), key])
    }
    const entries = [
      ...known.map((entry) => ({ ...entry, have: owned.has(entry.id) })),
      ...[...owned]
        .filter((id) => !knownIds.has(id))
        .map((id) => ({ id, name: idLabel(id), icon: '', order: Infinity, have: true })),
    ]
    return {
      kind: k,
      label: t(`collections.wardrobe.kinds.${k}`),
      captured: !!value,
      entries,
      have: known.filter((entry) => owned.has(entry.id)).length,
      total: known.length,
      wearers,
      expires: value?.expires ?? {},
      worn: value ? Object.keys(value.worn).length : 0,
    }
  }),
)
const current = computed(() => kinds.value.find((k) => k.kind === kind.value)!)

const shown = computed<GridEntry[]>(() => {
  const k = current.value
  return k.entries
    .filter((entry) => filter.value === 'all' || entry.have === (filter.value === 'have'))
    .map((entry) => {
      const wearers = k.wearers.get(entry.id) ?? []
      const until = k.expires[String(entry.id)]
      const notes = [
        until ? t('collections.wardrobe.trialUntil', { time: formatDateTime(until * 1000) }) : '',
        wearers.length ? t('collections.wardrobe.wornBy', { n: formatNumber(wearers.length) }) : '',
      ].filter(Boolean)
      return {
        id: entry.id,
        name: entry.name,
        icon: entry.icon,
        note: notes.join(' · ') || undefined,
        missing: !entry.have,
        title: [entry.name, ...notes, wearers.map(characterName).join(', ')]
          .filter(Boolean)
          .join(' · '),
      }
    })
})

const teams = computed(() =>
  Object.entries(wardrobe.value?.teams ?? {})
    .map(([slot, team]) => ({ slot: Number(slot), ...team }))
    .sort((a, b) => a.slot - b.slot),
)
</script>

<template>
  <NotCaptured v-if="!wardrobe" :title="$t('collections.tabs.wardrobe')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li v-for="k in kinds" :key="k.kind" class="flex min-w-0">
        <UiStat
          :label="k.label"
          :hint="
            k.captured
              ? $t('collections.wardrobe.wornBy', { n: formatNumber(k.worn) })
              : $t('collections.notCapturedPart')
          "
        >
          <template #value>
            <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
              <template v-if="k.captured">{{ formatNumber(k.have) }}</template
              ><template v-else>—</template
              ><span class="text-sm text-text-muted"> / {{ formatNumber(k.total) }}</span>
            </span>
          </template>
        </UiStat>
      </li>
    </ul>

    <UiPanel flush>
      <template #header>
        <div
          class="scroll-hide scroll-fade-x -mx-5 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:scroll-fade-none"
          role="radiogroup"
          :aria-label="$t('collections.wardrobe.items')"
        >
          <FilterChip
            v-for="k in kinds"
            :key="k.kind"
            radio
            :pressed="kind === k.kind"
            @toggle="kind = k.kind"
          >
            {{ k.label }}
            <span class="tabular font-mono text-text-muted"
              >{{ formatNumber(k.have) }}/{{ formatNumber(k.total) }}</span
            >
          </FilterChip>
        </div>
      </template>
      <div class="flex flex-col gap-3 p-3 sm:p-5">
        <template v-if="current.captured">
          <HaveFilter
            v-model="filter"
            :have="current.have"
            :total="current.total"
            :label="$t('collections.archive.show')"
          />
          <EntryGrid v-if="shown.length > 0" :entries="shown" :label="current.label" min="15rem" />
          <UiEmpty
            v-else-if="filter === 'missing'"
            :title="$t('collections.spincrystals.allCollected')"
          >
            <template #icon><CheckCheck class="text-success-text" aria-hidden="true" /></template>
          </UiEmpty>
          <UiEmpty v-else :title="$t('collections.spincrystals.noneCollected')" />
        </template>
        <UiEmpty v-else :title="$t('collections.notCapturedPart')" />
      </div>
    </UiPanel>

    <UiPanel :title="$t('collections.wardrobe.teams')" flush>
      <ul
        v-if="teams.length > 0"
        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-px bg-border-subtle"
      >
        <li
          v-for="team in teams"
          :key="team.slot"
          class="flex min-w-0 flex-col gap-2 bg-surface-raised px-4 py-3"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="tabular shrink-0 font-mono text-xs text-text-muted">{{ team.slot }}</span>
            <span class="min-w-0 flex-1 truncate font-medium" :title="team.name">{{
              team.name || '—'
            }}</span>
            <UiBadge v-if="team.slot === wardrobe.currentTeam" tone="accent">{{
              $t('collections.wardrobe.inUse')
            }}</UiBadge>
          </div>
          <div class="flex gap-1.5">
            <GameIcon
              v-for="(key, i) in team.characters"
              :key="`${key}-${i}`"
              :src="characterIcon(key)"
              :name="characterName(key)"
              :title="characterName(key)"
              size="sm"
            />
          </div>
        </li>
      </ul>
      <UiEmpty v-else :title="$t('collections.wardrobe.noTeams')" />
    </UiPanel>
  </div>
</template>
