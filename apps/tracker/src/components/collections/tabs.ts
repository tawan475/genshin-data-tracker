import { defineAsyncComponent, type Component } from 'vue'
import {
  Archive,
  BookMarked,
  BookOpen,
  CalendarDays,
  CookingPot,
  Hammer,
  Disc3,
  HeartHandshake,
  Layers,
  Map as MapIcon,
  Music,
  PawPrint,
  Shirt,
  Sofa,
  Sprout,
} from 'lucide-vue-next'
import type { CollectionTopic } from '@gdt/game-data/collections'
import type { CapturedCollections } from '@/data/collections'

/** The collections, in the hub's order; the slug is the URL's last segment (`/collections/archive`). */
export const COLLECTION_TABS = [
  'world',
  'events',
  'spincrystals',
  'anecdotes',
  'archive',
  'handbook',
  'living-beings',
  'tcg',
  'recipes',
  'crafting',
  'wardrobe',
  'hangouts',
  'blueprints',
  'music',
  'aranara',
] as const
export type CollectionTab = (typeof COLLECTION_TABS)[number]

export const isCollectionTab = (value: unknown): value is CollectionTab =>
  typeof value === 'string' && (COLLECTION_TABS as readonly string[]).includes(value)

/** A tab's label: `collections.tabs.<key>`. */
export const TAB_LABEL = {
  world: 'world',
  events: 'events',
  spincrystals: 'spincrystals',
  anecdotes: 'anecdotes',
  archive: 'archive',
  handbook: 'handbook',
  'living-beings': 'livingBeings',
  tcg: 'tcg',
  recipes: 'recipes',
  crafting: 'crafting',
  wardrobe: 'wardrobe',
  hangouts: 'hangouts',
  blueprints: 'blueprints',
  music: 'music',
  aranara: 'aranara',
} as const satisfies Record<CollectionTab, string>

/** The captured part a tab shows (its capture time is the tab's), null for Anecdotes. */
export const TAB_PART: Readonly<Record<CollectionTab, keyof CapturedCollections | null>> = {
  world: 'exploration',
  events: 'events',
  spincrystals: 'spincrystals',
  anecdotes: null,
  archive: 'archive',
  handbook: 'handbook',
  'living-beings': 'defeats',
  tcg: 'tcg',
  recipes: 'recipes',
  crafting: 'crafting',
  wardrobe: 'wardrobe',
  hangouts: 'hangouts',
  blueprints: 'blueprints',
  music: 'musicGame',
  aranara: 'aranara',
}

/** Tabs that list the game data's collections (names, totals): they wait for it. */
export const NEEDS_CATALOG: ReadonlySet<CollectionTab> = new Set([
  'world',
  'events',
  'archive',
  'handbook',
  'living-beings',
  'tcg',
  'recipes',
  'crafting',
  'wardrobe',
  'hangouts',
  'blueprints',
  'music',
  'aranara',
])

/** Each tab's component, loaded when the tab is first shown. */
export const TAB_COMPONENTS: Readonly<Record<CollectionTab, Component>> = {
  world: defineAsyncComponent(() => import('./WorldTab.vue')),
  events: defineAsyncComponent(() => import('./EventsTab.vue')),
  spincrystals: defineAsyncComponent(() => import('./SpincrystalsTab.vue')),
  anecdotes: defineAsyncComponent(() => import('./AnecdotesTab.vue')),
  archive: defineAsyncComponent(() => import('./ArchiveTab.vue')),
  handbook: defineAsyncComponent(() => import('./HandbookTab.vue')),
  'living-beings': defineAsyncComponent(() => import('./LivingBeingsTab.vue')),
  tcg: defineAsyncComponent(() => import('./TcgTab.vue')),
  recipes: defineAsyncComponent(() => import('./RecipesTab.vue')),
  crafting: defineAsyncComponent(() => import('./CraftingTab.vue')),
  wardrobe: defineAsyncComponent(() => import('./WardrobeTab.vue')),
  hangouts: defineAsyncComponent(() => import('./HangoutsTab.vue')),
  blueprints: defineAsyncComponent(() => import('./BlueprintsTab.vue')),
  music: defineAsyncComponent(() => import('./MusicTab.vue')),
  aranara: defineAsyncComponent(() => import('./AranaraTab.vue')),
}

/** Each collection's card icon. */
export const TAB_ICON: Readonly<Record<CollectionTab, Component>> = {
  world: MapIcon,
  events: CalendarDays,
  spincrystals: Disc3,
  anecdotes: BookOpen,
  archive: Archive,
  handbook: BookMarked,
  'living-beings': PawPrint,
  tcg: Layers,
  recipes: CookingPot,
  crafting: Hammer,
  wardrobe: Shirt,
  hangouts: HeartHandshake,
  blueprints: Sofa,
  music: Music,
  aranara: Sprout,
}

/** The game data topics each collection's page reads (its chunks only). */
export const TAB_TOPICS: Readonly<Record<CollectionTab, readonly CollectionTopic[]>> = {
  world: ['world', 'domains', 'npcs', 'natlan'],
  events: ['events'],
  spincrystals: [],
  anecdotes: [],
  archive: ['archive'],
  handbook: ['handbook'],
  'living-beings': ['archive'],
  tcg: ['tcg'],
  recipes: ['recipes'],
  crafting: ['crafting'],
  wardrobe: ['wardrobe'],
  hangouts: ['hangouts'],
  blueprints: ['home'],
  music: ['music'],
  aranara: ['aranara'],
}

/** What the hub's card figures count against (collection-summary.ts). */
export const HUB_TOPICS: readonly CollectionTopic[] = [
  'world',
  'archive',
  'tcg',
  'recipes',
  'crafting',
  'wardrobe',
  'home',
  'music',
  'aranara',
]
