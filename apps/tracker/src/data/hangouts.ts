import type { GiCollections, GiEndingState, GiHangoutState } from '@gdt/shared'
import { idLabel, type CollectionCatalog } from './collection-names'

/**
 * Hangout Events (Capture 1.7.0's `gi_collections.hangouts`) against the game
 * data's chapters and endings (`hangouts`, `hangoutCgs`, which carry each
 * ending's name under the id the capture sends: chapter × 100 + n). Pure.
 */

export interface HangoutEnding {
  id: number
  name: string
  state: GiEndingState
}

export interface HangoutChapter {
  id: number
  name: string
  title: string
  icon: string
  state: GiHangoutState | null
  endings: HangoutEnding[]
  /** Endings done (reward claimed or waiting). */
  endingsDone: number
  pictures: { have: number; total: number }
}

const textOf = (
  catalog: CollectionCatalog,
  section: 'hangouts' | 'hangoutCgs',
  id: number,
  column: 'name' | 'title' = 'name',
) => {
  const pick = (texts: CollectionCatalog['text']) =>
    (texts[section].get(id) as Record<string, string> | undefined)?.[column] || ''
  return pick(catalog.text) || pick(catalog.english)
}

export function hangoutChapters(
  hangouts: NonNullable<GiCollections['hangouts']>,
  catalog: CollectionCatalog,
): HangoutChapter[] {
  const known = new Map(catalog.data.hangouts.map((h) => [h.id, h]))
  const order = (id: number) => {
    const row = known.get(id)
    return typeof row?.order === 'number' ? row.order : Infinity
  }
  return Object.entries(hangouts)
    .map(([key, h]) => {
      const id = Number(key)
      const endings = Object.entries(h.endings)
        .map(([e, state]) => ({
          id: Number(e),
          name: textOf(catalog, 'hangoutCgs', Number(e)) || idLabel(Number(e)),
          state,
        }))
        .sort((a, b) => a.id - b.id)
      const row = known.get(id)
      return {
        id,
        name: textOf(catalog, 'hangouts', id) || idLabel(id),
        title: textOf(catalog, 'hangouts', id, 'title'),
        icon: typeof row?.icon === 'string' ? row.icon : '',
        state: h.state ?? null,
        endings,
        endingsDone: endings.filter((e) => e.state !== 'locked').length,
        pictures: { have: h.pictures.length, total: h.picturesTotal },
      }
    })
    .sort((a, b) => order(a.id) - order(b.id) || a.id - b.id)
}
