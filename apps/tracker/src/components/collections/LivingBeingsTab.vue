<script setup lang="ts">
import { computed, ref } from 'vue'
import IdGrid from './IdGrid.vue'
import NotCaptured from './NotCaptured.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { livingBeingName, nameOr } from '@/data/collection-names'
import { formatNumber } from '@/lib/format'
import { t } from '@/i18n'

/**
 * Living Beings: enemies defeated and creatures captured per Living Beings
 * entry (only those with a count), most defeated first.
 */
const props = defineProps<{ captured: CapturedCollections }>()

const rows = computed(() =>
  Object.entries(props.captured.defeats?.value ?? {})
    .map(([id, d]) => ({ id: Number(id), defeated: d.defeated, captured: d.captured ?? 0 }))
    .sort((a, b) => b.defeated - a.defeated || a.id - b.id),
)
const totals = computed(() => ({
  defeated: rows.value.reduce((sum, r) => sum + r.defeated, 0),
  captured: rows.value.reduce((sum, r) => sum + r.captured, 0),
  capturedKinds: rows.value.filter((r) => r.captured > 0).length,
}))

const onlyCaptured = ref(false)
const entries = computed(() =>
  rows.value
    .filter((r) => !onlyCaptured.value || r.captured > 0)
    .map((r) => {
      const name = nameOr(livingBeingName(r.id), r.id)
      const counts = [t('collections.defeats.defeatedN', { n: formatNumber(r.defeated) })]
      if (r.captured)
        counts.push(t('collections.defeats.capturedN', { n: formatNumber(r.captured) }))
      return {
        id: r.id,
        name,
        figure: formatNumber(onlyCaptured.value ? r.captured : r.defeated),
        title: [name, ...counts].join(' · '),
      }
    }),
)
</script>

<template>
  <NotCaptured v-if="!captured.defeats" :title="$t('collections.tabs.livingBeings')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.defeats.kinds')"
          :value="rows.length"
          exact
          :hint="$t('collections.defeats.kindsHint')"
        />
      </li>
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.defeats.defeated')" :value="totals.defeated" />
      </li>
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.defeats.captured')"
          :value="totals.captured"
          exact
          :hint="$t('collections.defeats.capturedHint', { n: formatNumber(totals.capturedKinds) })"
        />
      </li>
    </ul>

    <UiPanel flush>
      <template #header>
        <h2 class="text-base font-semibold">{{ $t('collections.tabs.livingBeings') }}</h2>
      </template>
      <template #actions>
        <FilterChip
          :pressed="onlyCaptured"
          :count="totals.capturedKinds"
          @toggle="onlyCaptured = !onlyCaptured"
          >{{ $t('collections.defeats.captured') }}</FilterChip
        >
      </template>
      <div class="flex flex-col gap-3 p-3 sm:p-5">
        <p class="text-sm text-text-muted">{{ $t('collections.namesSoon') }}</p>
        <IdGrid :entries="entries" :label="$t('collections.tabs.livingBeings')" min="10rem" />
      </div>
    </UiPanel>
  </div>
</template>
