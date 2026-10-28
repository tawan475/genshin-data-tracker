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

/** DungeonEntry types as the game data writes them. */
const EVENT_ENTRY = 'dungeon_entry_type_activity'
const TROUNCE_ENTRY = 'dungeon_entry_type_trial'

/** What a domain is for, by its DungeonEntry type; the rest (one-off domains, challenges) is `other`. */
export type DomainKind = 'blessing' | 'mastery' | 'forgery' | 'trounce' | 'other'
const DOMAIN_KINDS: Readonly<Record<string, DomainKind>> = {
  reliquary: 'blessing',
  avatar_talent: 'mastery',
  weapon_promote: 'forgery',
  [TROUNCE_ENTRY]: 'trounce',
}
const KIND_ORDER: readonly DomainKind[] = ['blessing', 'mastery', 'forgery', 'trounce', 'other']

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

/** A domain entrance (DungeonEntry), with its region. */
export interface DomainRow {
  id: number
  name: string
  kind: DomainKind
  scene: number
  /** The region its map point lies in; 0 (and '') when the game data places it nowhere. */
  city: number
  region: string
  have: boolean
}

export interface WorldModel {
  statues: StatueRow[]
  reputation: ReputationRow[]
  offerings: OfferingRow[]
  maps: SceneMap[]
  exploration: ExploreCity[]
  /** The domains the map shows (unlocked = the capture has their point); empty without scenes. */
  domains: DomainRow[]
  /**
   * Domains cleared once: the game reports only Trounce Domains (7.1), so the total is those
   * plus any other entrance a capture names. null when the capture lacks the list.
   */
  cleared: DomainRow[] | null
}

const n = (value: unknown): number => (typeof value === 'number' ? value : 0)
const ids = (value: unknown): number[] => (Array.isArray(value) ? (value as number[]) : [])
const byId = <T>(record: Record<string, T> | undefined) =>
  Object.entries(record ?? {}).map(([id, value]) => [Number(id), value] as const)

function nameIn(
  catalog: CollectionCatalog,
  section: 'cities' | 'areas' | 'offerings' | 'domainEntries',
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
  const { cities, areas, offerings, scenePoints, domainEntries } = catalog.data
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

  // Only the offerings the game data lists: the capture also carries ended events' ones (the
  // Michiae Casket, 4), which the data leaves out and the game no longer shows.
  const offeringLevels = new Map(byId(exploration.offerings))
  const offeringRows: OfferingRow[] = exploration.offerings
    ? offerings.map((o) => ({
        id: o.id,
        // The older offerings have no name in the game text: their "… Offering(s) Available" line.
        name: nameIn(catalog, 'offerings', o.id) || nameIn(catalog, 'offerings', o.id, 'available'),
        level: offeringLevels.get(o.id) ?? 0,
        max: n(o.maxLevel),
      }))
    : []

  // Domain entrances. The scene point class "domain" also holds quest, event and minigame
  // instances the map never shows (209 of Teyvat's 312 in 7.1): an entrance counts when a
  // DungeonEntry names it, it is no event's, and the map shows its point (`onMap`, game data
  // v7.1.21; older data: any domain point).
  const pointRows = new Map(scenePoints.map((p) => [p.id, p]))
  const captured = new Map(byId(exploration.scenes))
  type EntryRow = (typeof domainEntries)[number]
  const regionOf = (scene: number, point: number) =>
    topAreas.get(n(pointRows.get(scene * 100000 + point)?.area))?.city ?? 0
  const domainRow = (row: EntryRow, have: boolean): DomainRow => {
    const scene = n(row.scene)
    const city = regionOf(scene, n(row.point))
    return {
      id: row.id,
      name: nameIn(catalog, 'domainEntries', row.id) || idLabel(row.id),
      kind: DOMAIN_KINDS[String(row.type)] ?? 'other',
      scene,
      city,
      region: city ? cityName(city) : '',
      have,
    }
  }
  const byRegion = (a: DomainRow, b: DomainRow) =>
    (a.city || Infinity) - (b.city || Infinity) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    a.id - b.id
  const onMap = (row: EntryRow) => {
    const shown = (row as { onMap?: number }).onMap
    if (shown !== undefined) return shown === 1
    return pointRows.get(n(row.scene) * 100000 + n(row.point))?.kind === 'domain'
  }
  const domains: DomainRow[] = exploration.scenes
    ? domainEntries
        .filter((row) => row.type !== EVENT_ENTRY && onMap(row))
        .map((row) =>
          domainRow(row, (captured.get(n(row.scene))?.points ?? []).includes(n(row.point))),
        )
        .sort(byRegion)
    : []
  const clearedIds = exploration.domainsCleared ? new Set(exploration.domainsCleared) : null
  const cleared: DomainRow[] | null = clearedIds
    ? [
        ...domainEntries
          .filter((row) => row.type === TROUNCE_ENTRY || clearedIds.has(row.id))
          .map((row) => domainRow(row, clearedIds.has(row.id))),
        ...[...clearedIds]
          .filter((id) => !domainEntries.some((row) => row.id === id))
          .map((id) => ({
            id,
            name: idLabel(id),
            kind: 'other' as const,
            scene: 0,
            city: 0,
            region: '',
            have: true,
          })),
      ].sort(byRegion)
    : null

  // Each scene's map: waypoints, domains and areas revealed, of what the scene has.
  const maps: SceneMap[] = []
  if (exploration.scenes) {
    const waypointsOf = new Map<number, Set<number>>()
    for (const p of scenePoints) {
      if (p.kind !== 'waypoint') continue
      const scene = n(p.scene)
      waypointsOf.set(scene, (waypointsOf.get(scene) ?? new Set()).add(n(p.point)))
    }
    const areasOf = new Map<number, number[]>()
    for (const [area1, top] of topAreas) {
      areasOf.set(top.scene, [...(areasOf.get(top.scene) ?? []), area1])
    }
    const scenes = [
      ...new Set([...waypointsOf.keys(), ...domains.map((d) => d.scene), ...captured.keys()]),
    ]
    for (const scene of scenes) {
      const got = captured.get(scene)
      const points = new Set(got?.points ?? [])
      const revealed = new Set(got?.areas ?? [])
      const waypoints = waypointsOf.get(scene) ?? new Set<number>()
      const sceneDomains = domains.filter((d) => d.scene === scene)
      const sceneAreas = areasOf.get(scene) ?? []
      const count = (set: Set<number>, held: Set<number>) =>
        [...set].filter((id) => held.has(id)).length
      const map: SceneMap = {
        scene,
        name: scene === TEYVAT_SCENE ? null : sceneName(sceneAreas),
        waypoints: { have: count(waypoints, points), total: waypoints.size },
        domains: {
          have: sceneDomains.filter((d) => d.have).length,
          total: sceneDomains.length,
        },
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

  return {
    statues,
    reputation,
    offerings: offeringRows,
    maps,
    exploration: exploreRows,
    domains,
    cleared,
  }
}

export interface NpcRow {
  id: number
  name: string
  /** The game's title for them, '' for none. */
  title: string
  have: boolean
}

/** NPCs met (Capture 1.11.0) against the game data's list, in its order; unknown ids last. Pure. */
export function npcRows(met: readonly number[], catalog: CollectionCatalog): NpcRow[] {
  const held = new Set(met)
  const text = (id: number, column: string) => {
    const pick = (texts: CollectionCatalog['text']) =>
      (texts.npcsMet.get(id) as Record<string, string> | undefined)?.[column] || ''
    return pick(catalog.text) || pick(catalog.english)
  }
  const known = new Set(catalog.data.npcsMet.map((r) => r.id))
  return [
    ...catalog.data.npcsMet.map((r) => ({
      id: r.id,
      name: text(r.id, 'name') || idLabel(r.id),
      title: text(r.id, 'title'),
      have: held.has(r.id),
    })),
    ...met
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: idLabel(id), title: '', have: true })),
  ]
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

/**
 * The hub's World figure: the average exploration percent of the areas the
 * capture lists (those with a total in the game data); null without any.
 */
export function explorationPercent(model: WorldModel): number | null {
  const percents = model.exploration.flatMap((city) =>
    city.areas.flatMap((area) => (area.percent === null ? [] : [area.percent])),
  )
  if (percents.length === 0) return null
  return Math.floor((percents.reduce((sum, p) => sum + p, 0) / percents.length) * 10) / 10
}
