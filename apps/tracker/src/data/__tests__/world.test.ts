import { describe, expect, it } from 'vitest'
import type { CollectionCatalog } from '../collection-names'
import { TEYVAT_SCENE, worldModel } from '../world'

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
      { id: 500001, scene: 5, point: 1, kind: 'waypoint', area: 200, gadget: 0 },
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
  }),
  english: texts({ cities: [], areas: [], offerings: [] }),
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
        domains: { have: 1, total: 1 },
        areas: { have: 1, total: 3 },
      },
    ])
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
  })
})
