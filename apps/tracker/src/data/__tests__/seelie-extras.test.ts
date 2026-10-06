import { describe, expect, it } from 'vitest'
import { mapSeelieResin, mapSeelieSettings, mapSeelieTasks, seelieTaskId } from '../seelie-extras'

/** Tue 2026-10-06 12:00 UTC: 20:00 in Asia, 07:00 in America, 13:00 in Europe. */
const NOW = Date.UTC(2026, 9, 6, 12)

/** Made-up tasks in Seelie's export shape (not anyone's real data). */
const file = {
  tasks: [
    {
      id: 1,
      task: 'Fish in Mondstadt',
      recurring: 3,
      notes: 'rod',
      mode: 'completed',
      next: '2026-10-08',
    },
    { id: 2, task: 'Buy Sea Ganoderma', recurring: 9, notes: null, next: '2026-10-05' },
    { id: 3, task: '   ', recurring: 1, next: '2026-10-05' },
    { id: 4, task: 'Odd day', recurring: 0, next: 'soon' },
    { id: 'abyss', next: '2026-10-16 03:59', done: null },
    { id: 'dt', next: '2026-10-06 03:59', done: null },
    { id: 'trounce', next: '2026-10-12 04:00' },
    { id: 'wish-banner-7', next: '2026-10-20 03:59', done: true },
    { id: 'stygian-def', next: '2026-10-09 04:00' },
    'junk',
  ],
}

describe('Seelie tasks', () => {
  it('reads custom tasks with their rhythm, notes and due day', () => {
    const { custom } = mapSeelieTasks(file, 'ASIA', NOW)
    expect(custom).toEqual([
      {
        id: 'seelie1',
        task: { name: 'Fish in Mondstadt', every: 3, mode: 'completed', note: 'rod' },
        due: '2026-10-08',
        position: 0,
      },
      {
        id: 'seelie2',
        task: { name: 'Buy Sea Ganoderma', every: 9, mode: 'original' },
        due: '2026-10-05',
        position: 1,
      },
      // No day it can read: due today (the server's game day).
      {
        id: 'seelie4',
        task: { name: 'Odd day', every: 1, mode: 'original' },
        due: '2026-10-06',
        position: 2,
      },
    ])
  })

  it('reads permanent tasks in server time, a 03:59 end being the 04:00 reset', () => {
    expect(mapSeelieTasks(file, 'ASIA', NOW).builtin).toEqual([
      { id: 'abyss', next: Date.UTC(2026, 9, 15, 20) },
      { id: 'weekly-bosses', next: Date.UTC(2026, 9, 11, 20) },
    ])
    expect(mapSeelieTasks(file, 'AMERICA', NOW).builtin).toEqual([
      { id: 'abyss', next: Date.UTC(2026, 9, 16, 9) },
      { id: 'weekly-bosses', next: Date.UTC(2026, 9, 12, 9) },
    ])
    expect(mapSeelieTasks(file, 'EUROPE', NOW).builtin).toEqual([
      { id: 'abyss', next: Date.UTC(2026, 9, 16, 3) },
      { id: 'weekly-bosses', next: Date.UTC(2026, 9, 12, 3) },
    ])
  })

  it('leaves out what is due anyway, and names the events it has nothing for', () => {
    const tasks = mapSeelieTasks(file, 'ASIA', NOW)
    // Daily Commissions came back at today's reset already.
    expect(tasks.builtin.map((b) => b.id)).not.toContain('commissions')
    expect(tasks.skipped).toEqual(['stygian-def', 'wish-banner-7'])
  })

  it('reads nothing from a file without tasks', () => {
    expect(mapSeelieTasks({}, 'ASIA', NOW)).toEqual({ custom: [], builtin: [], skipped: [] })
    expect(mapSeelieTasks(null, null, NOW)).toEqual({ custom: [], builtin: [], skipped: [] })
  })

  it('names Seelie task ids so a re-import finds them', () => {
    expect(seelieTaskId(12)).toBe('seelie12')
    expect(seelieTaskId('Abc-1')).toBe('seelieabc1')
    expect(seelieTaskId('')).toBeNull()
    expect(seelieTaskId(null)).toBeNull()
  })
})

describe('Seelie resin', () => {
  it('reads the amount and when it was set', () => {
    expect(
      mapSeelieResin({ resin: { amount: 120, time: 'Tue, 06 Oct 2026 12:00:00 GMT' } }),
    ).toEqual({ value: 120, at: NOW })
    expect(mapSeelieResin({ resin: { amount: 40, time: '2026-10-06T12:00:00.000Z' } })).toEqual({
      value: 40,
      at: NOW,
    })
    expect(mapSeelieResin({ resin: { amount: 3000, time: NOW } })).toEqual({
      value: 2000,
      at: NOW,
    })
  })

  it('reads nothing without a time or a sane amount', () => {
    expect(mapSeelieResin({ resin: { amount: 0, time: null } })).toBeNull()
    expect(mapSeelieResin({ resin: { amount: -5, time: NOW } })).toBeNull()
    expect(mapSeelieResin({ resin: { amount: 10, time: 'not a date' } })).toBeNull()
    expect(mapSeelieResin({})).toBeNull()
  })
})

describe('Seelie account settings', () => {
  it('reads AR, World Level, server and Traveler', () => {
    expect(mapSeelieSettings({ ar: 60, wl: 9, server: 'asia', gender: 'female' })).toEqual({
      ar: 60,
      wl: 9,
      server: 'ASIA',
      traveler: 'F',
    })
    expect(mapSeelieSettings({ server: 'america', gender: 'male' })).toEqual({
      server: 'AMERICA',
      traveler: 'M',
    })
  })

  it('leaves out what is out of range', () => {
    expect(mapSeelieSettings({ ar: 0, wl: 10, server: 'cn', gender: 'x' })).toEqual({})
    expect(mapSeelieSettings('nope')).toEqual({})
  })
})
