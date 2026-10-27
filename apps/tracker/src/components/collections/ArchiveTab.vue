<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ARCHIVE_TABS, type ArchiveTab } from '@gdt/shared'
import IdGrid from './IdGrid.vue'
import NotCaptured from './NotCaptured.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { archiveName, nameOr } from '@/data/collection-names'
import { readStorage, writeStorage } from '@/lib/storage'
import { t } from '@/i18n'

/** The Archive: unlocked entries per tab (the game's own tabs), the chosen tab's entries. */
const props = defineProps<{ captured: CapturedCollections }>()

const archive = computed(() => props.captured.archive?.value ?? null)
const total = computed(() =>
  archive.value
    ? ARCHIVE_TABS.reduce((sum, tab) => sum + (archive.value![tab]?.length ?? 0), 0)
    : 0,
)

const KEY = 'collections:archive'
const stored = readStorage(KEY)
const chosen = ref<ArchiveTab>(
  (ARCHIVE_TABS as readonly string[]).includes(stored ?? '') ? (stored as ArchiveTab) : 'quests',
)
watch(chosen, (value) => writeStorage(KEY, value === 'quests' ? null : value))

const options = computed(() =>
  ARCHIVE_TABS.map((tab) => ({
    tab,
    label: t(`collections.archive.tabs.${tab}`),
    count: archive.value?.[tab]?.length,
  })),
)
const label = computed(() => t(`collections.archive.tabs.${chosen.value}`))
const entries = computed(() =>
  (archive.value?.[chosen.value] ?? []).map((id) => ({
    id,
    name: nameOr(archiveName(chosen.value, id), id),
  })),
)
</script>

<template>
  <NotCaptured v-if="!archive" :title="$t('collections.tabs.archive')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.archive.unlocked')"
          :value="total"
          exact
          :hint="$t('collections.archive.unlockedHint')"
        />
      </li>
    </ul>

    <UiPanel flush>
      <template #header>
        <div
          class="scroll-hide scroll-fade-x -mx-5 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:scroll-fade-none"
          role="radiogroup"
          :aria-label="$t('collections.archive.pick')"
        >
          <FilterChip
            v-for="option in options"
            :key="option.tab"
            radio
            :pressed="chosen === option.tab"
            :count="option.count ?? 0"
            @toggle="chosen = option.tab"
            >{{ option.label }}</FilterChip
          >
        </div>
      </template>
      <div class="flex flex-col gap-3 p-3 sm:p-5">
        <p class="text-sm text-text-muted">{{ $t('collections.namesSoon') }}</p>
        <IdGrid v-if="entries.length > 0" :entries="entries" :label="label" />
        <p v-else class="py-6 text-center text-sm text-text-muted">
          {{ $t('collections.archive.none') }}
        </p>
      </div>
    </UiPanel>
  </div>
</template>
