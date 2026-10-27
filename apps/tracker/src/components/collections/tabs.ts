import { defineAsyncComponent, type Component } from 'vue'
import {
  Archive,
  BookMarked,
  BookOpen,
  CookingPot,
  Disc3,
  Layers,
  Map as MapIcon,
  PawPrint,
  Shirt,
  Sprout,
} from 'lucide-vue-next'
import type { CapturedCollections } from '@/data/collections'

/** The collections, in the hub's order; the slug is the URL's last segment (`/collections/archive`). */
export const COLLECTION_TABS = [
  'world',
  'spincrystals',
  'anecdotes',
  'archive',
  'handbook',
  'living-beings',
  'tcg',
  'recipes',
  'wardrobe',
  'aranara',
] as const
export type CollectionTab = (typeof COLLECTION_TABS)[number]

export const isCollectionTab = (value: unknown): value is CollectionTab =>
  typeof value === 'string' && (COLLECTION_TABS as readonly string[]).includes(value)

/** A tab's label: `collections.tabs.<key>`. */
export const TAB_LABEL = {
  world: 'world',
  spincrystals: 'spincrystals',
  anecdotes: 'anecdotes',
  archive: 'archive',
  handbook: 'handbook',
  'living-beings': 'livingBeings',
  tcg: 'tcg',
  recipes: 'recipes',
  wardrobe: 'wardrobe',
  aranara: 'aranara',
} as const satisfies Record<CollectionTab, string>

/** The captured part a tab shows (its capture time is the tab's), null for Anecdotes. */
export const TAB_PART: Readonly<Record<CollectionTab, keyof CapturedCollections | null>> = {
  world: 'exploration',
  spincrystals: 'spincrystals',
  anecdotes: null,
  archive: 'archive',
  handbook: 'handbook',
  'living-beings': 'defeats',
  tcg: 'tcg',
  recipes: 'recipes',
  wardrobe: 'wardrobe',
  aranara: 'aranara',
}

/** Tabs that list the game data's collections (names, totals): they wait for it. */
export const NEEDS_CATALOG: ReadonlySet<CollectionTab> = new Set([
  'world',
  'archive',
  'handbook',
  'living-beings',
  'tcg',
  'recipes',
  'wardrobe',
  'aranara',
])

/** Each tab's component, loaded when the tab is first shown. */
export const TAB_COMPONENTS: Readonly<Record<CollectionTab, Component>> = {
  world: defineAsyncComponent(() => import('./WorldTab.vue')),
  spincrystals: defineAsyncComponent(() => import('./SpincrystalsTab.vue')),
  anecdotes: defineAsyncComponent(() => import('./AnecdotesTab.vue')),
  archive: defineAsyncComponent(() => import('./ArchiveTab.vue')),
  handbook: defineAsyncComponent(() => import('./HandbookTab.vue')),
  'living-beings': defineAsyncComponent(() => import('./LivingBeingsTab.vue')),
  tcg: defineAsyncComponent(() => import('./TcgTab.vue')),
  recipes: defineAsyncComponent(() => import('./RecipesTab.vue')),
  wardrobe: defineAsyncComponent(() => import('./WardrobeTab.vue')),
  aranara: defineAsyncComponent(() => import('./AranaraTab.vue')),
}

/** Each collection's card icon. */
export const TAB_ICON: Readonly<Record<CollectionTab, Component>> = {
  world: MapIcon,
  spincrystals: Disc3,
  anecdotes: BookOpen,
  archive: Archive,
  handbook: BookMarked,
  'living-beings': PawPrint,
  tcg: Layers,
  recipes: CookingPot,
  wardrobe: Shirt,
  aranara: Sprout,
}
