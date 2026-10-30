import type { GiCollections } from '@gdt/shared'
import { nameOf, wikiGuide, type CollectionCatalog } from '@/data/collection-names'
import { t } from '@/i18n'

/** One World Quest as the Archive lists it. */
export interface WorldQuest {
  id: number
  name: string
  /** Its region (a cities id; 0: other) and that region's name. */
  city: number
  region: string
  /** Its series' name, '' for none. */
  series: string
  /** Any of its MainQuest ids finished. */
  done: boolean
  /** Accepted and not finished (none of its ids finished). */
  active: boolean
  href?: string
}

const num = (value: unknown) => (typeof value === 'number' ? value : 0)

/**
 * Every World Quest of the game data (`worldQuests`: the wiki's list by region),
 * regions in the game's order with "other" last, each region in its own order,
 * marked from the capture's parent quests (none done without them).
 */
export function worldQuestList(
  catalog: CollectionCatalog,
  quests: GiCollections['quests'] | null,
): WorldQuest[] {
  const finished = new Set(quests?.finished ?? [])
  const active = new Set(quests?.active ?? [])
  const regionName = (city: number) => {
    if (city === 0) return t('collections.archive.otherRegion')
    const name = nameOf(catalog, 'cities', city)
    return name.startsWith('#') ? t('collections.archive.otherRegion') : name
  }
  return catalog.data.worldQuests
    .map((row) => {
      const ids = Array.isArray(row.quests) ? (row.quests as number[]) : [row.id]
      const chapter = num(row.chapter)
      const series = chapter ? nameOf(catalog, 'chapters', chapter) : ''
      const done = ids.some((id) => finished.has(id))
      return {
        id: row.id,
        name: nameOf(catalog, 'worldQuests', row.id),
        city: num(row.city),
        region: regionName(num(row.city)),
        series: series.startsWith('#') ? '' : series,
        done,
        active: !done && ids.some((id) => active.has(id)),
        href: wikiGuide(catalog, 'worldQuests', row.id),
        order: num(row.order),
      }
    })
    .sort(
      (a, b) =>
        (a.city === 0 ? 1e6 : a.city) - (b.city === 0 ? 1e6 : b.city) ||
        a.order - b.order ||
        a.id - b.id,
    )
    .map(({ order: _, ...quest }) => quest)
}
