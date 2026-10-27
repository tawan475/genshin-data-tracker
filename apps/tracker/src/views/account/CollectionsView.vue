<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CaptureTime from '@/components/collections/CaptureTime.vue'
import {
  COLLECTION_TABS,
  LAST_TAB_KEY,
  NEEDS_CATALOG,
  TAB_COMPONENTS,
  TAB_LABEL,
  TAB_PART,
  isCollectionTab,
  type CollectionTab,
} from '@/components/collections/tabs'
import { useCollectionCatalog } from '@/components/collections/use-catalog'
import { useCapturedCollections } from '@/components/collections/use-captured'
import FilterChip from '@/components/ui/FilterChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { readStorage, writeStorage } from '@/lib/storage'
import { t } from '@/i18n'

/**
 * Collections: one tab per collection the captures carry (Teyvat.me
 * Capture's `gi_collections` and `gi_wardrobe`, and the Anecdotes book),
 * each from the newest snapshot that has it. The tab is the URL's last
 * segment (`/collections/archive`); a bare `/collections` opens the last one
 * used on this device. Read-only but for Anecdotes' hand marks, so viewers
 * of a shared account see what the owner sees.
 */
const route = useRoute()
const router = useRouter()

const stored = (): CollectionTab => {
  const value = readStorage(LAST_TAB_KEY)
  return isCollectionTab(value) ? value : 'spincrystals'
}
const tab = computed<CollectionTab>(() =>
  isCollectionTab(route.params.tab) ? route.params.tab : stored(),
)
watch(tab, (value) => writeStorage(LAST_TAB_KEY, value), { immediate: true })

function open(next: CollectionTab) {
  if (next !== tab.value) void router.push({ name: 'account-collections', params: { tab: next } })
}

const tabs = computed(() =>
  COLLECTION_TABS.map((value) => ({ value, label: t(`collections.tabs.${TAB_LABEL[value]}`) })),
)

const { captured, resource } = useCapturedCollections()
const catalog = useCollectionCatalog()
const needsCatalog = computed(() => NEEDS_CATALOG.has(tab.value))
const ready = computed(() => !!captured.value && (!needsCatalog.value || !!catalog.data.value))
const loadError = computed(
  () => resource.error.value ?? (needsCatalog.value ? catalog.error.value : undefined),
)
function retry() {
  if (resource.error.value) void resource.reload()
  if (catalog.error.value) void catalog.reload()
}
const part = computed(() => {
  const key = TAB_PART[tab.value]
  return key ? captured.value?.[key] : undefined
})
</script>

<template>
  <div>
    <PageHeader :title="$t('collections.title')" />

    <div
      class="scroll-hide scroll-fade-x -mx-3 mb-4 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:scroll-fade-none lg:mb-6"
      role="radiogroup"
      :aria-label="$t('collections.tabsLabel')"
    >
      <FilterChip
        v-for="option in tabs"
        :key="option.value"
        radio
        :pressed="tab === option.value"
        @toggle="open(option.value)"
        >{{ option.label }}</FilterChip
      >
    </div>

    <component :is="TAB_COMPONENTS.anecdotes" v-if="tab === 'anecdotes'" />
    <UiError
      v-else-if="loadError && !ready"
      :title="$t('collections.loadFailed')"
      :error="loadError"
      @retry="retry"
    />
    <template v-else-if="ready && captured">
      <CaptureTime class="mb-4" :taken-at="part?.takenAt" />
      <component
        :is="TAB_COMPONENTS[tab]"
        :key="tab"
        :captured="captured"
        v-bind="needsCatalog ? { catalog: catalog.data.value } : {}"
      />
    </template>
    <div v-else aria-busy="true" :aria-label="$t('collections.loading')">
      <div class="mb-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:mb-6">
        <UiSkeleton v-for="n in 2" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <UiSkeleton class="h-96 w-full" />
    </div>
  </div>
</template>
