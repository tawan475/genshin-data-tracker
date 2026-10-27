import { describe, expect, it } from 'vitest'
import type { CollectionCatalog } from '../collection-names'
import { TEYVAT_SCENE, npcRows, tribalRows, worldModel } from '../world'

const texts = (entries: Record<string, [number, Record<string, string>][]>) =>
  Object.fromEntries(
    Object.entries(entries).map(([section, rows]) => [section, new Map(rows)]),
  ) as unknown as CollectionCatalog['text']

const catalog = {
  data: {
    cities: [
      { id: 1, reputationMaxLevel: 8, areas: [1, 2], statueMaxLevel: 10 },
      { id: 9, reputationMaxLevel: 0, areas: [99], statueMaxLevel: 0 },
    ],
    areas: [
      { id: 1100, scene: 3, area1: 1, area2: 0, level: 1, city: 1 },
      { id: 1101, scene: 3, area1: 1, area2: 101, level: 2, city: 1 },
      { id: 1200, scene: 3, area1: 2, area2: 0, level: 1, city: 1, exploreTotal: 200 },
      { id: 1300, scene: 3, area1: 3, area2: 0, level: 1, city: 1, exploreTotal: 100 },
      { id: 9900, scene: 51195, area1: 99, area2: 0, level: 1, city: 9 },
      { id: 20000, scene: 5, area1: 200, area2: 0, level: 1, city: 3 },
    ],
    offerings: [{ id: 1, maxLevel: 12 }],
    scenePoints: [
      { id: 300001, scene: 3, point: 1, kind: 'waypoint', area: 1, gadget: 0 },
      { id: 300002, scene: 3, point: 2, kind: 'waypoint', area: 1, gadget: 0 },
      { id: 300003, scene: 3, point: 3, kind: 'domain', area: 2, gadget: 0 },
      { id: 300004, scene: 3, point: 4, kind: 'mark', area: 2, gadget: 0 },
      { id: 300005, scene: 3, point: 5, kind: 'domain', area: 1, gadget: 0 },
      { id: 300006, scene: 3, point: 6, kind: 'domain', area: 2, gadget: 0 },
      { id: 300007, scene: 3, point: 7, kind: 'domain', area: 2, gadget: 0 },
      { id: 500001, scene: 5, point: 1, kind: 'waypoint', area: 200, gadget: 0 },
    ],
    domainEntries: [
      { id: 1, type: 'reliquary', scene: 3, point: 3, picture: '', onMap: 1 },
      { id: 1006, type: 'dungeon_entry_type_trial', scene: 3, point: 5, picture: '', onMap: 1 },
      // A quest's instance: a domain point the map never shows.
      { id: 1012, type: 'dungeon_entry_type_normal', scene: 3, point: 6, picture: '', onMap: 0 },
      // An event's domain, long gone.
      { id: 1032, type: 'dungeon_entry_type_activity', scene: 3, point: 7, picture: '', onMap: 1 },
      { id: 1016, type: 'dungeon_entry_type_trial', scene: 3, point: 99, picture: '', onMap: 0 },
    ],
  },
  text: texts({
    cities: [
      [1, { name: 'Mondstadt', statue: 'Statues of The Seven - Anemo' }],
      [9, { name: 'Test Scenario', statue: 'Statue of The Seven - Cryo' }],
    ],
    areas: [
      [1100, { name: 'Starfell Valley' }],
      [1200, { name: 'Galesong Hill' }],
      [20000, { name: 'Enkanomiya' }],
    ],
    offerings: [[1, { name: '', available: 'Frostbearing Tree Offering(s) Available' }]],
    domainEntries: [
      [1, { name: 'Midsummer Courtyard' }],
      [1006, { name: 'Confront Stormterror' }],
    ],
  }),
  english: texts({ cities: [], areas: [], offerings: [], domainEntries: [] }),
} as unknown as CollectionCatalog

describe('worldModel', () => {
  it('reads the capture against the game data', () => {
    const world = worldModel(
      {
        statues: { '1': { level: 10, oculi: 0 }, '9': { level: 1, oculi: 0 } },
        offerings: { '1': 5 },
        scenes: { '3': { points: [1, 3, 4], areas: [1] } },
        explore: { '1': 120, '2': 150, '3': 112 },
        reputation: { '1': 8 },
      },
      catalog,
    )
    // City 9's Statue has no levels in the game data: left out.
    expect(world.statues).toEqual([
      {
        city: 1,
        name: 'Mondstadt',
        statue: 'Statues of The Seven - Anemo',
        level: 10,
        max: 10,
        oculi: 0,
      },
    ])
    expect(world.reputation).toEqual([{ city: 1, name: 'Mondstadt', level: 8, max: 8 }])
    expect(world.offerings).toEqual([
      { id: 1, name: 'Frostbearing Tree Offering(s) Available', level: 5, max: 12 },
    ])
    // Teyvat first; Enkanomiya (not in the capture: not visited) stays out.
    expect(world.maps).toEqual([
      {
        scene: TEYVAT_SCENE,
        name: null,
        waypoints: { have: 1, total: 2 },
        domains: { have: 1, total: 2 },
        areas: { have: 1, total: 3 },
      },
    ])
    // Only the entrances the map shows, by region; the quest's and the event's stay out.
    expect(world.domains).toEqual([
      {
        id: 1,
        name: 'Midsummer Courtyard',
        kind: 'blessing',
        scene: 3,
        city: 1,
        region: 'Mondstadt',
        have: true,
      },
      {
        id: 1006,
        name: 'Confront Stormterror',
        kind: 'trounce',
        scene: 3,
        city: 1,
        region: 'Mondstadt',
        have: false,
      },
    ])
    // No list of first clears in this capture.
    expect(world.cleared).toBeNull()
    // Points until the game data has an area's total; then a percentage.
    expect(world.exploration).toEqual([
      {
        city: 1,
        name: 'Mondstadt',
        areas: [
          { area: 1, name: 'Starfell Valley', points: 120, percent: null },
          { area: 2, name: 'Galesong Hill', points: 150, percent: 75 },
          // Fully explored areas run a little past their total: 100%.
          { area: 3, name: '#3', points: 112, percent: 100 },
        ],
      },
    ])
  })

  it('leaves out the parts a capture lacks', () => {
    const world = worldModel({ explore: { '1': 3 } }, catalog)
    expect(world.statues).toEqual([])
    expect(world.reputation).toEqual([])
    expect(world.offerings).toEqual([])
    expect(world.maps).toEqual([])
    expect(world.exploration).toHaveLength(1)
    expect(world.domains).toEqual([])
  })

  it('counts first clears against the Trounce Domains, plus any other entrance named', () => {
    const world = worldModel({ domainsCleared: [1006, 1, 4242] }, catalog)
    expect(world.cleared?.map((d) => [d.id, d.name, d.kind, d.have])).toEqual([
      [1, 'Midsummer Courtyard', 'blessing', true],
      [1006, 'Confront Stormterror', 'trounce', true],
      [1016, '#1016', 'trounce', false],
      [4242, '#4242', 'other', true],
    ])
  })

  it('takes every domain point a DungeonEntry names with game data before onMap', () => {
    const older = {
      ...catalog,
      data: {
        ...catalog.data,
        domainEntries: catalog.data.domainEntries.map((row) => {
          const { onMap: _, ...older } = row as typeof row & { onMap?: number }
          return older
        }),
      },
    } as unknown as CollectionCatalog
    const world = worldModel({ scenes: { '3': { points: [3, 6], areas: [] } } }, older)
    expect(world.domains.map((d) => [d.id, d.have])).toEqual([
      [1, true],
      [1006, false],
      [1012, true],
    ])
  })
})

describe('npcRows', () => {
  it('lists the game data NPCs with the ones met, unknown ids last', () => {
    const npcs = {
      data: {
        npcsMet: [
          { id: 2, character: 0 },
          { id: 3, character: 0 },
        ],
      },
      text: texts({ npcsMet: [[2, { name: 'Paimon', title: 'Traveling Companion' }]] }),
      english: texts({ npcsMet: [[3, { name: 'Katheryne', title: '' }]] }),
    } as unknown as CollectionCatalog
    expect(npcRows([3, 9], npcs)).toEqual([
      { id: 2, name: 'Paimon', title: 'Traveling Companion', have: false },
      { id: 3, name: 'Katheryne', title: '', have: true },
      { id: 9, name: '#9', title: '', have: true },
    ])
  })
})

describe('tribalRows', () => {
  it('groups the game data chapters by tribe, with the captured states', () => {
    const natlan = {
      data: {
        tribalChapters: [
          { id: 2, tribe: 1, chapter: 2053, quest: 0 },
          { id: 1, tribe: 1, chapter: 2052, quest: 0 },
          { id: 3, tribe: 2, chapter: 2054, quest: 0 },
        ],
      },
      text: texts({
        tribalChapters: [[1, { number: "Yupanqui's Turnfire: Act I", name: 'A Visitor' }]],
        tribes: [[1, { name: 'Scions of the Canopy', title: '' }]],
      }),
      english: texts({ tribalChapters: [], tribes: [] }),
    } as unknown as CollectionCatalog
    const rows = tribalRows(
      { '1': { state: 'finished', startedAt: 1 }, '2': { state: 'open' } },
      natlan,
    )
    expect(rows.map((r) => [r.name, r.finished, r.chapters.map((c) => c.state)])).toEqual([
      ['Scions of the Canopy', 1, ['finished', 'open']],
      ['#2', 0, ['notOpen']],
    ])
    expect(rows[0]!.chapters[0]).toMatchObject({
      number: "Yupanqui's Turnfire: Act I",
      name: 'A Visitor',
    })
  })
})
