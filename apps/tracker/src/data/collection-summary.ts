import { ARCHIVE_TABS, WARDROBE_KINDS } from '@gdt/shared'
import {
  archiveEntries,
  recipeEntries,
  tcgEntries,
  wardrobeEntries,
  aranaraTotal,
  type CollectionCatalog,
} from './collection-names'
import type { CapturedCollections } from './collection-parts'
import { recipeRows } from './recipes'
import { spincrystalProgress, type Spincrystal } from './spincrystals'
import { TEYVAT_SCENE, worldModel } from './world'

/**
 * One figure per Collections card, counted the way its page counts: `have`
 * of `total` the game data lists, or a bare `count` where the game has no
 * total (Living Beings). Null when no capture has that part. Pure.
 */
export type CollectionFigure = { have: number; total: number } | { count: number }

export interface CollectionFigures {
  /** Teleport Waypoints unlocked in Teyvat. */
  world: CollectionFigure | null
  /** Rewards claimed in the running events. */
  events: CollectionFigure | null
  spincrystals: CollectionFigure | null
  archive: CollectionFigure | null
  handbook: CollectionFigure | null
  'living-beings': CollectionFigure | null
  tcg: CollectionFigure | null
  recipes: CollectionFigure | null
  wardrobe: CollectionFigure | null
  /** Hangout endings reached. */
  hangouts: CollectionFigure | null
  blueprints: CollectionFigure | null
  aranara: CollectionFigure | null
}

const ofSets = (sets: { owned: ReadonlySet<number>; known: readonly { id: number }[] }[]) => ({
  have: sets.reduce((sum, s) => sum + s.known.filter((entry) => s.owned.has(entry.id)).length, 0),
  total: sets.reduce((sum, s) => sum + s.known.length, 0),
})

export function collectionFigures(
  captured: CapturedCollections,
  catalog: CollectionCatalog | null,
  spincrystals: readonly Spincrystal[] | null,
): CollectionFigures {
  const spin = captured.spincrystals?.value
  const archive = captured.archive?.value
  const handbook = captured.handbook?.value
  const defeats = captured.defeats?.value
  const tcg = captured.tcg?.value
  const recipes = captured.recipes?.value
  const wardrobe = captured.wardrobe?.value
  const aranara = captured.aranara?.value
  const exploration = captured.exploration?.value
  const hangouts = captured.hangouts?.value
  const events = captured.events?.value
  const blueprints = captured.blueprints?.value
  const withCatalog = <T>(
    value: T | undefined,
    count: (c: CollectionCatalog, v: T) => CollectionFigure,
  ) => (value !== undefined && catalog ? count(catalog, value) : null)

  return {
    world: withCatalog(exploration, (c, v) => {
      const teyvat = worldModel(v, c).maps.find((m) => m.scene === TEYVAT_SCENE)
      return teyvat ? teyvat.waypoints : { have: 0, total: 0 }
    }),
    events: events
      ? (() => {
          const now = Date.now() / 1000
          const counters = Object.values(events)
            .filter((e) => e.start <= now && now < e.end)
            .flatMap((e) => Object.values(e.progress ?? {}))
          return { have: counters.filter((c) => c.claimed).length, total: counters.length }
        })()
      : null,
    spincrystals:
      spin && spincrystals
        ? (({ have, total }) => ({ have, total }))(spincrystalProgress(spincrystals, spin))
        : null,
    archive: withCatalog(archive, (c, v) =>
      ofSets(
        ARCHIVE_TABS.map((tab) => ({
          owned: new Set(v[tab] ?? []),
          known: archiveEntries(c, tab),
        })),
      ),
    ),
    // Chapters claimed, of the chapters the capture lists.
    handbook: handbook
      ? (() => {
          const chapters = Object.values(handbook.chapters ?? {})
          return {
            have: chapters.filter((ch) => ch.state === 'claimed').length,
            total: chapters.length,
          }
        })()
      : null,
    'living-beings':
      defeats !== undefined
        ? { count: Object.values(defeats).filter((d) => d.defeated > 0).length }
        : null,
    tcg: withCatalog(tcg, (c, v) => {
      const owned = v.cards ?? {}
      const entries = [...tcgEntries(c, 'characters'), ...tcgEntries(c, 'actions')]
      return {
        have: entries.filter((entry) => owned[String(entry.id)]).length,
        total: entries.length,
      }
    }),
    recipes: withCatalog(recipes, (c, v) => {
      const rows = recipeRows(recipeEntries(c), v).filter((row) => !row.unknown)
      return { have: rows.filter((row) => row.state !== 'locked').length, total: rows.length }
    }),
    wardrobe: withCatalog(wardrobe, (c, v) =>
      ofSets(
        WARDROBE_KINDS.map((kind) => ({
          owned: new Set(v[kind]?.owned ?? []),
          known: wardrobeEntries(c, kind),
        })),
      ),
    ),
    hangouts: hangouts
      ? (() => {
          const endings = Object.values(hangouts).flatMap((h) => Object.values(h.endings))
          return {
            have: endings.filter((state) => state !== 'locked').length,
            total: endings.length,
          }
        })()
      : null,
    blueprints: withCatalog(blueprints, (c, v) => {
      const known = new Set(c.data.blueprints.map((b) => b.id))
      return { have: v.filter((id) => known.has(id)).length, total: known.size }
    }),
    aranara: withCatalog(aranara, (c, v) => ({
      have: Object.values(v).reduce(
        (sum, entries) => sum + Object.values(entries).filter((state) => state !== 'none').length,
        0,
      ),
      total: aranaraTotal(c),
    })),
  }
}
