import { describe, expect, it } from 'vitest'
import type { FarmingData } from '@gdt/game-data/farming'
import type { CollectionCatalog } from '../collection-names'
import { hangoutChapters } from '../hangouts'
import { respawnRows } from '../respawns'

const texts = (entries: Record<string, [number, Record<string, string>][]>) =>
  Object.fromEntries(
    Object.entries(entries).map(([section, rows]) => [section, new Map(rows)]),
  ) as unknown as CollectionCatalog['text']

describe('hangoutChapters', () => {
  const catalog = {
    data: {
      hangouts: [
        { id: 101501, character: 10000015, order: 2, icon: 'UI_ChapterIcon_Kaeya' },
        { id: 101401, character: 10000014, order: 1, icon: 'UI_ChapterIcon_Barbara' },
      ],
    },
    text: texts({
      hangouts: [[101401, { name: 'Wellspring of Healing', title: 'Hangout Event: Barbara' }]],
      hangoutCgs: [[10140101, { name: 'Untimely Enthusiasm' }]],
    }),
    english: texts({ hangouts: [], hangoutCgs: [] }),
  } as unknown as CollectionCatalog

  it('names chapters and endings, in the game data order', () => {
    const chapters = hangoutChapters(
      {
        '101501': { endings: { '10150101': 'locked' }, pictures: [], picturesTotal: 12 },
        '101401': {
          state: 'accepted',
          endings: { '10140102': 'unclaimed', '10140101': 'claimed' },
          pictures: [1, 2],
          picturesTotal: 12,
        },
      },
      catalog,
    )
    expect(chapters.map((c) => c.id)).toEqual([101401, 101501])
    expect(chapters[0]).toMatchObject({
      name: 'Wellspring of Healing',
      title: 'Hangout Event: Barbara',
      icon: 'UI_ChapterIcon_Barbara',
      state: 'accepted',
      endingsDone: 2,
      pictures: { have: 2, total: 12 },
    })
    expect(chapters[0]!.endings).toEqual([
      { id: 10140101, name: 'Untimely Enthusiasm', state: 'claimed' },
      { id: 10140102, name: '#10140102', state: 'unclaimed' },
    ])
    expect(chapters[1]).toMatchObject({ name: '#101501', state: null, endingsDone: 0 })
  })
})

describe('respawnRows', () => {
  const farming = {
    bosses: [{ id: 6, name: 'Electro Hypostasis' }],
    enemies: [{ id: 2, name: 'Abyss Mage' }],
  } as unknown as FarmingData

  it('counts spots up and the next one back, bosses first', () => {
    const now = 1_800_000_000_000
    const rows = respawnRows(
      { '2': [1_799_999_000, 1_800_000_600], '6': [1_800_003_600] },
      farming,
      now,
    )
    expect(rows).toEqual([
      { id: 6, name: 'Electro Hypostasis', kind: 'boss', spots: 1, up: 0, next: 1_800_003_600_000 },
      { id: 2, name: 'Abyss Mage', kind: 'enemy', spots: 2, up: 1, next: 1_800_000_600_000 },
    ])
    expect(respawnRows({ '9': [1] }, null, now)[0]).toMatchObject({ name: '#9', up: 1, next: null })
  })
})
