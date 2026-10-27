<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import CaptureTime from '@/components/collections/CaptureTime.vue'
import CollectionsHub from '@/components/collections/CollectionsHub.vue'
import {
  NEEDS_CATALOG,
  TAB_COMPONENTS,
  TAB_LABEL,
  TAB_PART,
  isCollectionTab,
} from '@/components/collections/tabs'
import { useCollectionCatalog } from '@/components/collections/use-catalog'
import { useCapturedCollections } from '@/components/collections/use-captured'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useAccount } from './context'
import { t } from '@/i18n'

/**
 * Collections: a bare `/collections` is the hub, a card per collection the
 * captures carry (Teyvat.me Capture's `gi_collections` and `gi_wardrobe`,
 * the Anecdotes book, and a link to Achievements); `/collections/<slug>`
 * is that collection's page, from the newest snapshot that has it.
 * Read-only but for Anecdotes' hand marks, so viewers of a shared account
 * see what the owner sees.
 */
const route = useRoute()
const account = useAccount()

const tab = computed(() => (isCollectionTab(route.params.tab) ? route.params.tab : null))
const title = computed(() =>
  tab.value ? t(`collections.tabs.${TAB_LABEL[tab.value]}`) : t('collections.title'),
)

const { captured, resource } = useCapturedCollections()
const catalog = useCollectionCatalog()
const needsCatalog = computed(() => !!tab.value && NEEDS_CATALOG.has(tab.value))
const ready = computed(() => !!captured.value && (!needsCatalog.value || !!catalog.data.value))
const loadError = computed(
  () => resource.error.value ?? (needsCatalog.value ? catalog.error.value : undefined),
)
function retry() {
  if (resource.error.value) void resource.reload()
  if (catalog.error.value) void catalog.reload()
}
const part = computed(() => {
  const key = tab.value ? TAB_PART[tab.value] : null
  return key ? captured.value?.[key] : undefined
})
</script>

<template>
  <div>
    <PageHeader :title="title" />

    <template v-if="tab">
      <div class="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <UiIconButton
          :label="$t('collections.title')"
          :to="{ name: 'account-collections', params: { accountId: account.id } }"
        >
          <ArrowLeft class="size-5" aria-hidden="true" />
        </UiIconButton>
        <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ title }}</h2>
        <CaptureTime v-if="tab !== 'anecdotes' && ready" :taken-at="part?.takenAt" />
      </div>

      <component :is="TAB_COMPONENTS.anecdotes" v-if="tab === 'anecdotes'" />
      <UiError
        v-else-if="loadError && !ready"
        :title="$t('collections.loadFailed')"
        :error="loadError"
        @retry="retry"
      />
      <component
        :is="TAB_COMPONENTS[tab]"
        v-else-if="ready && captured"
        :key="tab"
        :captured="captured"
        v-bind="needsCatalog ? { catalog: catalog.data.value } : {}"
      />
      <div v-else aria-busy="true" :aria-label="$t('collections.loading')">
        <div class="mb-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:mb-6">
          <UiSkeleton v-for="n in 2" :key="n" class="h-16 sm:h-[4.5rem]" />
        </div>
        <UiSkeleton class="h-96 w-full" />
      </div>
    </template>

    <template v-else>
      <UiError
        v-if="resource.error.value && !captured"
        :title="$t('collections.loadFailed')"
        :error="resource.error.value"
        @retry="retry"
      />
      <CollectionsHub
        v-else-if="captured"
        :captured="captured"
        :catalog="catalog.data.value ?? null"
      />
      <div
        v-else
        class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-3"
        aria-busy="true"
        :aria-label="$t('collections.loading')"
      >
        <UiSkeleton v-for="n in 10" :key="n" class="h-32 sm:h-36" />
      </div>
    </template>
  </div>
</template>
