import {
  COLLECTION_SECTIONS,
  collectionText,
  loadCollections,
  type CollectionTopic,
} from '@gdt/game-data/collections'
import type { CollectionCatalog } from '@/data/collection-names'
import { useResource, type Resource } from '@/data/use-resource'
import { loadGameIcons } from '@/lib/assets'
import { locale } from '@/i18n/locale'

/**
 * The game data's collections in the language on screen (and English), with
 * the icons' hosts: only the `topics` a page reads (each a chunk of its own,
 * cached by the loader). A section of a topic not asked for is empty.
 */
export type TopicCatalog = CollectionCatalog & {
  /** Which topics it holds (sorted, comma-separated): a page checks it holds its own. */
  topics: string
}

export const topicsKey = (topics: readonly CollectionTopic[]) => [...topics].sort().join(',')

export function useCollectionCatalog(
  topics: () => readonly CollectionTopic[],
  /** Names too (the hub's figures need none: it skips the text, the larger half). */
  named: () => boolean = () => true,
): Resource<TopicCatalog> {
  return useResource(
    () => `${locale.value}|${topicsKey(topics())}|${named() ? 'text' : ''}`,
    async (key) => {
      const [lang, list, withText] = key.split('|') as [typeof locale.value, string, string]
      const wanted = list ? (list.split(',') as CollectionTopic[]) : []
      const [data, text, english] = await Promise.all([
        loadCollections(wanted),
        withText ? collectionText(lang, wanted) : {},
        withText && lang !== 'en' ? collectionText('en', wanted) : undefined,
        loadGameIcons(),
      ])
      const full = (part: object, empty: () => unknown) =>
        Object.fromEntries(
          COLLECTION_SECTIONS.map((s) => [s, (part as Record<string, unknown>)[s] ?? empty()]),
        )
      const texts = (part: object) => full(part, () => new Map())
      return {
        data: full(data, () => []),
        text: texts(text),
        english: texts(english ?? text),
        topics: list,
      } as unknown as TopicCatalog
    },
  )
}
