import { describe, expect, it } from 'vitest'
import type { CharacterView } from '@/data/characters'
import {
  MAX_PICKS,
  ROW_COLUMNS,
  ROW_COLUMN_GAP,
  ROW_PAD,
  TEAM_CARD_WIDTH,
  TEAM_PAD_X,
  TEAM_ROW,
  teamCardHeight,
  teamFileName,
  teamMembers,
  teamRowTop,
  togglePick,
} from '../team-card'

const char = (key: string): CharacterView => ({ key, name: key }) as CharacterView

describe('teamCardHeight', () => {
  it('makes two rows the build card frame', () => {
    expect(teamCardHeight(2)).toBe(1080)
  })

  it('grows by a row and its gap', () => {
    expect(teamCardHeight(3)).toBe(1542)
    expect(teamCardHeight(4)).toBe(2004)
  })

  it('puts the last row above the bottom padding', () => {
    for (const n of [2, 3, 4]) expect(teamRowTop(n - 1) + TEAM_ROW + 40).toBe(teamCardHeight(n))
  })
})

describe('row columns', () => {
  it('fill the row inside its padding', () => {
    const inner = TEAM_CARD_WIDTH - 2 * TEAM_PAD_X - 2 * ROW_PAD
    expect(ROW_COLUMNS.who + ROW_COLUMNS.middle + ROW_COLUMNS.pieces + 2 * ROW_COLUMN_GAP).toBe(
      inner,
    )
  })
})

describe('togglePick', () => {
  it('adds at the end and drops in place', () => {
    expect(togglePick([], 'A')).toEqual(['A'])
    expect(togglePick(['A', 'B', 'C'], 'B')).toEqual(['A', 'C'])
  })

  it('stops at the maximum', () => {
    const full = ['A', 'B', 'C', 'D']
    expect(full).toHaveLength(MAX_PICKS)
    expect(togglePick(full, 'E')).toEqual(full)
    expect(togglePick(full, 'A')).toEqual(['B', 'C', 'D'])
  })
})

describe('teamMembers', () => {
  const roster = [char('HuTao'), char('Yelan'), char('TravelerAnemo'), char('Zhongli')]

  it('keeps the team order and skips who the roster lacks', () => {
    expect(teamMembers(['Yelan', 'Nobody', 'HuTao', ''], roster).map((c) => c.key)).toEqual([
      'Yelan',
      'HuTao',
    ])
  })

  it('finds the Traveler by any element', () => {
    expect(teamMembers(['TravelerGeo'], roster).map((c) => c.key)).toEqual(['TravelerAnemo'])
  })

  it('lists nobody twice and four at most', () => {
    const keys = ['HuTao', 'HuTao', 'Yelan', 'TravelerAnemo', 'Zhongli', 'TravelerGeo']
    expect(teamMembers(keys, roster).map((c) => c.key)).toEqual([
      'HuTao',
      'Yelan',
      'TravelerAnemo',
      'Zhongli',
    ])
  })
})

describe('teamFileName', () => {
  it('names a team card after the team', () => {
    expect(teamFileName('Vape Squad ♡', ['HuTao'])).toBe('team-vape-squad-teyvat-me.png')
  })

  it('falls back to the characters', () => {
    expect(teamFileName(null, ['HuTao', 'Yelan'])).toBe('HuTao-Yelan-teyvat-me.png')
    expect(teamFileName('♡♡', ['HuTao'])).toBe('HuTao-teyvat-me.png')
  })
})
