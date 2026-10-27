import {
  encodeCollections,
  encodeCollections2,
  encodeWardrobe,
  type BundleSnapshot,
  type GiCollections,
} from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { capturedCollections } from '../collection-parts'

const snapshot = (id: number, keys: Partial<BundleSnapshot>): BundleSnapshot =>
  ({ id, takenAt: id * 1_000, lastSeenAt: id * 1_000, ...keys }) as BundleSnapshot

describe('capturedCollections', () => {
  it('takes each part from the newest snapshot that has it', () => {
    const older: GiCollections = {
      spincrystals: [141_001],
      archive: { quests: [10_000_001] },
      defeats: { '20010001': { defeated: 3 } },
    }
    const newer: GiCollections = { spincrystals: [141_001, 141_002] }
    const texts = new Map<string, string>([
      ['c1', JSON.stringify(encodeCollections(older))],
      ['p1', JSON.stringify(encodeCollections2(older))],
      ['c2', JSON.stringify(encodeCollections(newer))],
      ['w2', JSON.stringify(encodeWardrobe({ currentTeam: 2 }))],
    ])
    const captured = capturedCollections({
      snapshots: [
        snapshot(1, { collections: 'c1', collections2: 'p1' }),
        snapshot(2, { collections: 'c2', wardrobe: 'w2' }),
        snapshot(3, {}),
      ],
      texts,
    })
    expect(captured.spincrystals).toEqual({ value: [141_001, 141_002], takenAt: 2_000 })
    expect(captured.archive).toEqual({ value: { quests: [10_000_001] }, takenAt: 1_000 })
    expect(captured.defeats?.value).toEqual({ '20010001': { defeated: 3 } })
    expect(captured.wardrobe).toEqual({ value: { currentTeam: 2 }, takenAt: 2_000 })
    expect(captured.handbook).toBeUndefined()
  })

  it('is empty for a bundle without collections', () => {
    expect(capturedCollections({ snapshots: [snapshot(1, {})], texts: new Map() })).toEqual({})
  })
})
