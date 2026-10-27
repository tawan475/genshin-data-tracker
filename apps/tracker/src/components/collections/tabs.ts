import { defineAsyncComponent, type Component } from 'vue'
import type { CapturedCollections } from '@/data/collections'

/** The Collections page's tabs, in their order; the slug is the URL's last segment. */
export const COLLECTION_TABS = [
  'spincrystals',
  'anecdotes',
  'archive',
  'handbook',
  'living-beings',
  'tcg',
  'wardrobe',
  'aranara',
] as const
export type CollectionTab = (typeof COLLECTION_TABS)[number]

export const isCollectionTab = (value: unknown): value is CollectionTab =>
  typeof value === 'string' && (COLLECTION_TABS as readonly string[]).includes(value)

/** A tab's label: `collections.tabs.<key>`. */
export const TAB_LABEL = {
  spincrystals: 'spincrystals',
  anecdotes: 'anecdotes',
  archive: 'archive',
  handbook: 'handbook',
  'living-beings': 'livingBeings',
  tcg: 'tcg',
  wardrobe: 'wardrobe',
  aranara: 'aranara',
} as const satisfies Record<CollectionTab, string>

/** The captured part a tab shows (its capture time is the tab's), null for Anecdotes. */
export const TAB_PART: Readonly<Record<CollectionTab, keyof CapturedCollections | null>> = {
  spincrystals: 'spincrystals',
  anecdotes: null,
  archive: 'archive',
  handbook: 'handbook',
  'living-beings': 'defeats',
  tcg: 'tcg',
  wardrobe: 'wardrobe',
  aranara: 'aranara',
}

/** Each tab's component, loaded when the tab is first shown. */
export const TAB_COMPONENTS: Readonly<Record<CollectionTab, Component>> = {
  spincrystals: defineAsyncComponent(() => import('./SpincrystalsTab.vue')),
  anecdotes: defineAsyncComponent(() => import('./AnecdotesTab.vue')),
  archive: defineAsyncComponent(() => import('./ArchiveTab.vue')),
  handbook: defineAsyncComponent(() => import('./HandbookTab.vue')),
  'living-beings': defineAsyncComponent(() => import('./LivingBeingsTab.vue')),
  tcg: defineAsyncComponent(() => import('./TcgTab.vue')),
  wardrobe: defineAsyncComponent(() => import('./WardrobeTab.vue')),
  aranara: defineAsyncComponent(() => import('./AranaraTab.vue')),
}

/** The last tab opened on this device. */
export const LAST_TAB_KEY = 'collections:tab'
