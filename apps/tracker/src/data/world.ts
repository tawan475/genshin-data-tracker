import type { GiExploration, GiTribalState } from '@gdt/shared'
import { idLabel, type CollectionCatalog } from './collection-names'

/**
 * The World page (Teyvat.me Capture's `gi_exploration`) against the game
 * data's cities, map areas, offerings and scene points
 * (`@gdt/game-data/collections` from v7.1.17). Pure.
 *
 * Exploration comes as raw points per area; the percentage is points over
 * the area's `exploreTotal`, capped at 100 (a fully explored area has a few
 * points more than its total, as in game). An area without a total shows
 * its points.
 */

/** Teyvat, the overworld scene: named by the page (the game names it nowhere). */
export const TEYVAT_SCENE = 3

export interface Progress {
  have: number
  total: number
}

export interface StatueRow {
  city: number
  name: string
  statue: string
  level: number
  /** The Statue's top level. */
  max: number
  oculi: number
}

export interface ReputationRow {
  city: number
  name: string
  level: number
  max: number
}

export interface OfferingRow {
  id: number
  name: string
  level: number
  max: number
}

export interface SceneMap {
  scene: number
  /** null for Teyvat (the page names it). */
  name: string | null
  waypoints: Progress
  domains: Progress
  areas: Progress
}

export interface ExploreArea {
  area: number
  name: string
  points: number
  /** Percent explored, when the game data has the area's total. */
  percent: number | null
}

export interface ExploreCity {
  city: number
  name: string
  areas: ExploreArea[]
}

export interface WorldModel {
  statues: StatueRow[]
  reputation: ReputationRow[]
  offerings: OfferingRow[]
  maps: SceneMap[]
  exploration: ExploreCity[]
}

const n = (value: unknown): number => (typeof value === 'number' ? value : 0)
const ids = (value: unknown): number[] => (Array.isArray(value) ? (value as number[]) : [])
const byId = <T>(record: Record<string, T> | undefined) =>
  Object.entries(record ?? {}).map(([id, value]) => [Number(id), value] as const)

function nameIn(
  catalog: CollectionCatalog,
  section: 'cities' | 'areas' | 'offerings',
  id: number,
  column = 'name',
) {
  const pick = (texts: CollectionCatalog['text']) =>
    (texts[section].get(id) as Record<string, string> | undefined)?.[column] || ''
  return pick(catalog.text) || pick(catalog.english)
}
function statueName(catalog: CollectionCatalog, city: number) {
  const pick = (texts: CollectionCatalog['text']) =>
    (texts.cities.get(city) as { statue?: string } | undefined)?.statue || ''
  return pick(catalog.text) || pick(catalog.english)
}

export function worldModel(exploration: GiExploration, catalog: CollectionCatalog): WorldModel {
  const { cities, areas, offerings, scenePoints } = catalog.data
  // Level-1 areas by the id the exploration messages send (area1).
  const topAreas = new Map<number, { row: (typeof areas)[number]; scene: number; city: number }>()
  for (const row of areas) {
    if (n(row.level) !== 1) continue
    topAreas.set(n(row.area1), { row, scene: n(row.scene), city: n(row.city) })
  }
  const cityName = (city: number) => nameIn(catalog, 'cities', city) || idLabel(city)
  const areaName = (area1: number) => {
    const top = topAreas.get(area1)
    return (top && nameIn(catalog, 'areas', top.row.id)) || idLabel(area1)
  }
  // Statues of The Seven: the cities whose Statue has levels (the game data's top level).
  const statueMax = new Map(cities.map((c) => [c.id, n(c.statueMaxLevel)]))
  const statues: StatueRow[] = byId(exploration.statues)
    .filter(([city]) => (statueMax.get(city) ?? 0) > 0)
    .map(([city, s]) => ({
      city,
      name: cityName(city),
      statue: statueName(catalog, city),
      level: s.level,
      max: statueMax.get(city)!,
      oculi: s.oculi,
    }))
    .sort((a, b) => a.city - b.city)

  const reputationLevels = new Map(byId(exploration.reputation))
  const reputation: ReputationRow[] = exploration.reputation
    ? cities
        .filter((c) => n(c.reputationMaxLevel) > 0)
        .map((c) => ({
          city: c.id,
          name: cityName(c.id),
          level: reputationLevels.get(c.id) ?? 0,
          max: n(c.reputationMaxLevel),
        }))
    : []

  const offeringLevels = new Map(byId(exploration.offerings))
  const offeringRows: OfferingRow[] = exploration.offerings
    ? [
        ...offerings.map((o) => ({
          id: o.id,
          // The older offerings have no name in the game text: their "… Offering(s) Available" line.
          name:
            nameIn(catalog, 'offerings', o.id) || nameIn(catalog, 'offerings', o.id, 'available'),
          level: offeringLevels.get(o.id) ?? 0,
          max: n(o.maxLevel),
        })),
        ...[...offeringLevels]
          .filter(([id]) => !offerings.some((o) => o.id === id))
          .map(([id, level]) => ({ id, name: '', level, max: 0 })),
      ]
    : []

  // Each scene's map: waypoints, domains and areas revealed, of what the scene has.
  const maps: SceneMap[] = []
  if (exploration.scenes) {
    const pointsOf = new Map<number, { waypoints: Set<number>; domains: Set<number> }>()
    for (const p of scenePoints) {
      const scene = n(p.scene)
      const entry = pointsOf.get(scene) ?? { waypoints: new Set(), domains: new Set() }
      if (p.kind === 'waypoint') entry.waypoints.add(n(p.point))
      else if (p.kind === 'domain') entry.domains.add(n(p.point))
      pointsOf.set(scene, entry)
    }
    const areasOf = new Map<number, number[]>()
    for (const [area1, top] of topAreas) {
      areasOf.set(top.scene, [...(areasOf.get(top.scene) ?? []), area1])
    }
    const captured = new Map(byId(exploration.scenes))
    const scenes = [...new Set([...pointsOf.keys(), ...captured.keys()])]
    for (const scene of scenes) {
      const got = captured.get(scene)
      const points = new Set(got?.points ?? [])
      const revealed = new Set(got?.areas ?? [])
      const known = pointsOf.get(scene) ?? {
        waypoints: new Set<number>(),
        domains: new Set<number>(),
      }
      const sceneAreas = areasOf.get(scene) ?? []
      const count = (set: Set<number>, held: Set<number>) =>
        [...set].filter((id) => held.has(id)).length
      const map: SceneMap = {
        scene,
        name: scene === TEYVAT_SCENE ? null : sceneName(sceneAreas),
        waypoints: { have: count(known.waypoints, points), total: known.waypoints.size },
        domains: { have: count(known.domains, points), total: known.domains.size },
        areas: { have: sceneAreas.filter((a) => revealed.has(a)).length, total: sceneAreas.length },
      }
      // Only the scenes the player has been to (event islands long gone stay out), and Teyvat.
      if (!got && scene !== TEYVAT_SCENE) continue
      maps.push(map)
    }
    maps.sort((a, b) =>
      a.scene === TEYVAT_SCENE ? -1 : b.scene === TEYVAT_SCENE ? 1 : a.scene - b.scene,
    )
  }
  /** A scene of one area is named after it; one of several areas after their region. */
  function sceneName(sceneAreas: number[]): string {
    const names = new Set(sceneAreas.map(areaName))
    if (names.size === 1) return [...names][0]!
    const cityIds = new Set(sceneAreas.map((a) => topAreas.get(a)!.city))
    return cityIds.size === 1 ? cityName([...cityIds][0]!) : ([...names][0] ?? '')
  }

  // Exploration by region, areas in the game data's order.
  const exploreByCity = new Map<number, ExploreArea[]>()
  for (const [area, points] of byId(exploration.explore)) {
    const top = topAreas.get(area)
    const total = top ? n(top.row.exploreTotal) : 0
    const city = top?.city ?? 0
    exploreByCity.set(city, [
      ...(exploreByCity.get(city) ?? []),
      {
        area,
        name: areaName(area),
        points,
        percent: total > 0 ? Math.min(100, Math.floor((points / total) * 1000) / 10) : null,
      },
    ])
  }
  const exploreRows: ExploreCity[] = [...exploreByCity]
    .map(([city, list]) => ({
      city,
      name: city ? cityName(city) : '',
      areas: list.sort((a, b) => a.area - b.area),
    }))
    .sort((a, b) => (a.city || Infinity) - (b.city || Infinity))

  return { statues, reputation, offerings: offeringRows, maps, exploration: exploreRows }
}

export interface TribalChapter {
  id: number
  /** "Yupanqui's Turnfire: Act I" */
  number: string
  name: string
  state: GiTribalState
}

export interface TribeRow {
  tribe: number
  name: string
  chapters: TribalChapter[]
  finished: number
}

/**
 * Natlan's tribal chapters (Capture 1.11.0) by tribe, in the game data's
 * order; chapters the capture lacks count as not open. Pure.
 */
export function tribalRows(
  chapters: NonNullable<GiExploration['tribalChapters']>,
  catalog: CollectionCatalog,
): TribeRow[] {
  const text = (section: 'tribalChapters' | 'tribes', id: number, column: string) => {
    const pick = (texts: CollectionCatalog['text']) =>
      (texts[section].get(id) as Record<string, string> | undefined)?.[column] || ''
    return pick(catalog.text) || pick(catalog.english)
  }
  const byTribe = new Map<number, TribalChapter[]>()
  for (const row of catalog.data.tribalChapters) {
    const tribe = n(row.tribe)
    byTribe.set(tribe, [
      ...(byTribe.get(tribe) ?? []),
      {
        id: row.id,
        number: text('tribalChapters', row.id, 'number'),
        name: text('tribalChapters', row.id, 'name') || idLabel(row.id),
        state: chapters[String(row.id)]?.state ?? 'notOpen',
      },
    ])
  }
  return [...byTribe]
    .map(([tribe, list]) => ({
      tribe,
      name: text('tribes', tribe, 'name') || idLabel(tribe),
      chapters: list.sort((a, b) => a.id - b.id),
      finished: list.filter((c) => c.state === 'finished').length,
    }))
    .sort((a, b) => a.tribe - b.tribe)
}
