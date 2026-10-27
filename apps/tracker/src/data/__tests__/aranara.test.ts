import { describe, expect, it } from 'vitest'
import { aranaraEntries } from '../aranara'

describe('aranaraEntries', () => {
  it('lists every entry the game data has, the captured state or not found, then newer ids', () => {
    const rows = [1, 2, 3].map((id) => ({ id }))
    expect(aranaraEntries(rows, { '1': { '2': 'finished', '9': 'collectable' } })).toEqual([
      { id: 1, state: 'none' },
      { id: 2, state: 'finished' },
      { id: 3, state: 'none' },
      { id: 9, state: 'collectable' },
    ])
  })
})
