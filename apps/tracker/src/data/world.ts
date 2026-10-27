import type { GiExploration } from '@gdt/shared'
import { idLabel, type CollectionCatalog } from './collection-names'

/**
 * The World page (Teyvat.me Capture's `gi_exploration`) against the game
 * data's cities, map areas, offerings and scene points
 * (`@gdt/game-data/collections` from v7.1.15). Pure.
 *
 * Exploration comes as raw points per area: a percentage needs the area's
 * total, which the game data does not carry yet (`total` on an area once it
 * does); until then the page shows the points.
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

function nameIn(catalog: CollectionCatalog, section: 'cities' | 'areas' | 'offerings', id: number) {
  const pick = (texts: CollectionCatalog['text']) =>
    (texts[section].get(id) as { name?: string } | undefined)?.name || ''
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
  const overworldCities = new Set(
    [...topAreas.values()].filter((a) => a.scene === TEYVAT_SCENE).map((a) => a.city),
  )

  // Statues of The Seven: the cities that have one in the overworld.
  const statues: StatueRow[] = byId(exploration.statues)
    .filter(([city]) => overworldCities.has(city) && statueName(catalog, city))
    .map(([city, s]) => ({
      city,
      name: cityName(city),
      statue: statueName(catalog, city),
      level: s.level,
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
          name: nameIn(catalog, 'offerings', o.id),
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
    const total = top ? n((top.row as Record<string, unknown>).total) : 0
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
