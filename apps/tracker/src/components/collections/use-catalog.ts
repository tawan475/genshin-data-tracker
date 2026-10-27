import { collectionText, loadCollections } from '@gdt/game-data/collections'
import type { CollectionCatalog } from '@/data/collection-names'
import { useResource, type Resource } from '@/data/use-resource'
import { loadGameIcons } from '@/lib/assets'
import { locale } from '@/i18n/locale'

/** The game data's collections in the language on screen (and English), with the icons' hosts. */
export function useCollectionCatalog(): Resource<CollectionCatalog> {
  return useResource(
    () => locale.value,
    async (lang) => {
      const [data, text, english] = await Promise.all([
        loadCollections(),
        collectionText(lang),
        lang === 'en' ? undefined : collectionText('en'),
        loadGameIcons(),
      ])
      return { data, text, english: english ?? text }
    },
  )
}
