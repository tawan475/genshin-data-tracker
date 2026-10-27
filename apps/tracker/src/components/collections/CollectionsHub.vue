<script setup lang="ts">
import { computed } from 'vue'
import { Trophy } from 'lucide-vue-next'
import CollectionCard from './CollectionCard.vue'
import { COLLECTION_TABS, TAB_ICON, TAB_LABEL, TAB_PART } from './tabs'
import type { CollectionCatalog } from '@/data/collection-names'
import { collectionFigures } from '@/data/collection-summary'
import type { CapturedCollections } from '@/data/collections'
import { loadSpincrystals } from '@/data/spincrystals'
import { useResource } from '@/data/use-resource'
import { useAccount } from '@/views/account/context'
import { t } from '@/i18n'

/**
 * The Collections hub: a card per collection (Achievements first, which
 * keeps its own page), each with its figure and capture time, opening the
 * collection's page. Figures wait for the game data; the cards don't.
 */
const props = defineProps<{ captured: CapturedCollections; catalog: CollectionCatalog | null }>()

const account = useAccount()
const to = (name: string, tab?: string) => ({
  name,
  params: { accountId: account.value.id, ...(tab ? { tab } : {}) },
})
const spincrystals = useResource(
  () => 0,
  () => loadSpincrystals(),
)
const figures = computed(() =>
  collectionFigures(props.captured, props.catalog, spincrystals.data.value ?? null),
)

const cards = computed(() =>
  COLLECTION_TABS.map((tab) => {
    const part = TAB_PART[tab]
    return {
      tab,
      title: t(`collections.tabs.${TAB_LABEL[tab]}`),
      icon: TAB_ICON[tab],
      to: to('account-collections', tab),
      figure: tab === 'anecdotes' ? undefined : figures.value[tab],
      takenAt: part ? (props.captured[part]?.takenAt ?? null) : null,
    }
  }),
)
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-3">
    <CollectionCard
      :to="to('account-achievements')"
      :title="$t('achievements.title')"
      :icon="Trophy"
    />
    <CollectionCard
      v-for="card in cards"
      :key="card.tab"
      :to="card.to"
      :title="card.title"
      :icon="card.icon"
      :figure="card.figure"
      :count-label="$t('collections.defeats.kinds')"
      :taken-at="card.takenAt"
    />
  </div>
</template>
