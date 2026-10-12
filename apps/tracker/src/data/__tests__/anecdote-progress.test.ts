import { decodeAnecdoteText, decodeAnecdotes, loadAnecdotes } from '@gdt/game-data'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANECDOTE_FILTERS,
  NO_CAPTURED_ANECDOTES,
  anecdoteProgress,
  capturedAnecdotes,
  countShown,
  filterAnecdotes,
  markTarget,
  plainText,
  shortTitle,
  splitDone,
  textRuns,
  unfinishedFirst,
  type AnecdoteEntry,
  type AnecdoteProgress,
} from '../anecdote-progress'

/**
 * Two areas; NPC 9802 sorts before 9801. 103 is a variant of 102, 104 a
 * loop, 201 and 202 hidden.
 */
const FILE: Parameters<typeof decodeAnecdotes>[0] = {
  columns: { anecdotes: [], areas: [], npcs: [] },
  constants: { rewardEvery: 10, rewardPrimogems: 50, wishCooldownHours: 48 },
  areas: [
    [1, 1],
    [2, 2],
  ],
  npcs: [
    [9801, 5],
    [9802, 1],
  ],
  anecdotes: [
    [100101, 1, 9801, 1001, 0, 0, 0, 0, '5.4'],
    [100102, 1, 9801, 1001, 0, 0, 0, 0, '5.4'],
    [100103, 1, 9801, 1001, 0, 100102, 0, 0, '6.0'],
    [100104, 1, 9802, 1002, 0, 0, 0, 1, '5.7'],
    [100105, 1, 9802, 1002, 0, 0, 100104, 0, '5.7'],
    [100201, 2, 9801, 1003, 1, 0, 0, 0, '7.1'],
    [100202, 2, 9802, 1004, 1, 0, 0, 0, '7.1'],
    [100203, 2, 9802, 1004, 0, 0, 0, 0, '7.1'],
  ],
}
const DATA = decodeAnecdotes(FILE)
const TEXT = decodeAnecdoteText({
  columns: { anecdotes: ['title', 'summary', 'hint'] },
  areas: { '1': 'Mondstadt', '2': 'Snezhnaya' },
  npcs: { '9801': 'Noelle', '9802': 'Kaedehara Kazuha' },
  anecdotes: {
    '100101': ['Noelle: Bladework', 'She practised.', 'Someone is practising...'],
    '100102': ['Noelle: Tea Time', 'Tea was had.', 'By the <color=#E88812FF>fountain</color>...'],
    '100103': ['Noelle: Tea Time', 'Tea was had.', ''],
    '100104': ['Kaedehara Kazuha: Waiting...', 'Still waiting.', 'Waiting...'],
    '100105': ['Kaedehara Kazuha: Done Waiting', 'Done.', 'Finally...'],
    '100201': ['Noelle: A Surprise', 'Surprised.', ''],
    '100202': ['Kaedehara Kazuha: Snow', 'Snowed.', ''],
    '100203': ['Kaedehara Kazuha: Ice', 'Iced.', 'Cold...'],
  },
})

const entries = (p: AnecdoteProgress): AnecdoteEntry[] =>
  p.areas.flatMap((a) => a.groups.flatMap((g) => g.entries))
const byId = (p: AnecdoteProgress, id: number) => entries(p).find((e) => e.anecdote.id === id)

function capture(anecdotes: Record<string, { state: number; finishCount: number }>) {
  return capturedAnecdotes(
    {
      anecdotes,
      unlockedAreas: [1],
      reward: { index: 3, progress: 7, target: 10 },
    },
    1_790_000_000_000,
  )
}

describe('anecdoteProgress', () => {
  it('counts every anecdote but the variants, and lists hidden ones too', () => {
    const p = anecdoteProgress(DATA, NO_CAPTURED_ANECDOTES, new Set())
    expect(p.total).toBe(7)
    expect(p.done).toBe(0)
    const [mondstadt, snezhnaya] = p.areas
    expect(mondstadt).toMatchObject({ area: 1, done: 0, total: 4, unlocked: null })
    // The game's NPC order, then ids.
    expect(mondstadt!.groups.map((g) => [g.npc, g.entries.map((e) => e.anecdote.id)])).toEqual([
      [9802, [100104, 100105]],
      [9801, [100101, 100102]],
    ])
    expect(snezhnaya).toMatchObject({ area: 2, done: 0, total: 3 })
    // Hidden ones are listed before they are met, not just counted.
    expect(snezhnaya!.groups.flatMap((g) => g.entries.map((e) => e.anecdote.id))).toEqual([
      100202, 100203, 100201,
    ])
    expect(byId(p, 100201)).toMatchObject({ met: false, source: null })
    expect(byId(p, 100102)!.ids).toEqual([100102, 100103])
  })

  it('takes done from the capture (finished or recorded) and from hand marks', () => {
    const p = anecdoteProgress(
      DATA,
      capture({
        '100101': { state: 3, finishCount: 1 },
        '100104': { state: 0, finishCount: 3 }, // a loop, idle again
        '100105': { state: 1, finishCount: 0 }, // met, not done
        '100203': { state: 2, finishCount: 0 }, // going on now
      }),
      new Set([100101, 100203]),
    )
    expect(byId(p, 100101)).toMatchObject({ source: 'captured', marked: true, met: true })
    expect(byId(p, 100104)).toMatchObject({ source: 'captured', finishCount: 3 })
    expect(byId(p, 100105)).toMatchObject({ source: null, met: true, active: false })
    expect(byId(p, 100203)).toMatchObject({ source: 'marked', active: true })
    expect(byId(p, 100102)).toMatchObject({ source: null, met: false })
    expect(p.done).toBe(3)
    expect(p.active).toBe(1)
    expect(p.areas[0]!.unlocked).toBe(true)
    expect(p.areas[1]!.unlocked).toBe(false)
    // A captured one can't be unmarked; the others take marks on their id.
    expect(markTarget(byId(p, 100101)!)).toBeNull()
    expect(markTarget(byId(p, 100203)!)).toBe(100203)
  })

  it('marks a base done when its variant is captured', () => {
    const p = anecdoteProgress(DATA, capture({ '100103': { state: 3, finishCount: 1 } }), new Set())
    expect(byId(p, 100102)).toMatchObject({ source: 'captured', finishCount: 1 })
    expect(byId(p, 100103)).toBeUndefined()
    expect(p.done).toBe(1)
  })

  it("takes a hidden one's state from the capture and the marks", () => {
    const p = anecdoteProgress(
      DATA,
      capture({ '100201': { state: 2, finishCount: 0 } }),
      new Set([100202]),
    )
    const snezhnaya = p.areas[1]!
    expect(snezhnaya.groups.flatMap((g) => g.entries.map((e) => e.anecdote.id))).toEqual([
      100202, 100203, 100201,
    ])
    expect(byId(p, 100201)).toMatchObject({ source: null, active: true, met: true })
    expect(snezhnaya.done).toBe(1)
  })

  it('names captured ids the game data does not know', () => {
    const p = anecdoteProgress(
      DATA,
      capture({ '109999': { state: 3, finishCount: 1 }, '100101': { state: 3, finishCount: 1 } }),
      new Set(),
    )
    expect(p.unknown).toEqual([109999])
    expect(p.done).toBe(1)
  })
})

describe('filterAnecdotes', () => {
  const p = anecdoteProgress(
    DATA,
    capture({ '100101': { state: 3, finishCount: 1 } }),
    new Set([100104]),
  )
  const ids = (shown: ReturnType<typeof filterAnecdotes>) =>
    shown.flatMap((a) => a.shown.flatMap((g) => g.entries.map((e) => e.anecdote.id)))

  it('filters by area, completion and words, keeping toggled rows', () => {
    const all = filterAnecdotes(p, DEFAULT_ANECDOTE_FILTERS, TEXT)
    expect(countShown(all)).toBe(7)
    const missing = { ...DEFAULT_ANECDOTE_FILTERS, completion: 'missing' as const }
    expect(ids(filterAnecdotes(p, missing, TEXT))).toEqual([
      100105, 100102, 100202, 100203, 100201,
    ])
    expect(ids(filterAnecdotes(p, missing, TEXT, new Set([100101])))).toEqual([
      100105, 100101, 100102, 100202, 100203, 100201,
    ])
    const done = { ...DEFAULT_ANECDOTE_FILTERS, completion: 'done' as const, area: 1 }
    expect(ids(filterAnecdotes(p, done, TEXT))).toEqual([100104, 100101])
    // Hint, NPC name, id; markup is not matched.
    const query = (q: string) =>
      ids(filterAnecdotes(p, { ...DEFAULT_ANECDOTE_FILTERS, query: q }, TEXT))
    expect(query('fountain')).toEqual([100102])
    expect(query('color')).toEqual([])
    expect(query('KAZUHA')).toEqual([100104, 100105, 100202, 100203])
    expect(query('100203')).toEqual([100203])
    // Areas stay in the answer, empty or not.
    expect(
      filterAnecdotes(p, { ...missing, query: 'fountain' }, TEXT).map((a) => a.shown.length),
    ).toEqual([1, 0])
  })
})

describe('soft-hiding done anecdotes', () => {
  // Mondstadt: Kazuha's two both done (one captured, one marked); Noelle's
  // first done, second not.
  const p = anecdoteProgress(
    DATA,
    capture({ '100101': { state: 3, finishCount: 1 }, '100104': { state: 0, finishCount: 2 } }),
    new Set([100105]),
  )
  const [kazuha, noelle] = p.areas[0]!.groups
  const idsOf = (list: readonly AnecdoteEntry[]) => list.map((e) => e.anecdote.id)

  it('folds the done rows of a group and keeps the rest', () => {
    expect(kazuha!.npc).toBe(9802)
    expect(idsOf(splitDone(noelle!).open)).toEqual([100102])
    expect(idsOf(splitDone(noelle!).finished)).toEqual([100101])
    expect(splitDone(kazuha!).open).toEqual([])
    expect(idsOf(splitDone(kazuha!).finished)).toEqual([100104, 100105])
    // A row ticked a moment ago stays out of the fold.
    expect(idsOf(splitDone(kazuha!, new Set([100105])).open)).toEqual([100105])
  })

  it('puts groups with nothing left to do last, in data order otherwise', () => {
    expect(unfinishedFirst([kazuha!, noelle!]).map((g) => g.npc)).toEqual([9801, 9802])
    expect(unfinishedFirst([kazuha!, noelle!], new Set([100104])).map((g) => g.npc)).toEqual([
      9802, 9801,
    ])
    expect(unfinishedFirst([noelle!]).map((g) => g.npc)).toEqual([9801])
  })
})

describe('text', () => {
  it('drops the NPC from titles and the markup from text', () => {
    expect(shortTitle('Noelle: Bladework', 'Noelle')).toBe('Bladework')
    expect(shortTitle('Kaedehara Kazuha: Waiting...', 'Kaedehara Kazuha')).toBe('Waiting...')
    expect(shortTitle('Someone Else: Thing', 'Noelle')).toBe('Thing')
    expect(shortTitle('No prefix here', undefined)).toBe('No prefix here')
    expect(plainText('By the <color=#E88812FF>fountain</color>...\\nAgain')).toBe(
      'By the fountain... Again',
    )
    expect(textRuns('By the <color=#E88812FF>fountain</color>...')).toEqual([
      { text: 'By the ', em: false },
      { text: 'fountain', em: true },
      { text: '...', em: false },
    ])
  })
})

describe('the real game data', () => {
  it('folds the variants and keeps every NPC and area known', async () => {
    const data = await loadAnecdotes()
    const p = anecdoteProgress(data, NO_CAPTURED_ANECDOTES, new Set())
    expect(p.total).toBe(data.counted.length)
    expect(p.total).toBeLessThan(data.anecdotes.length)
    expect(p.areas.map((a) => a.area)).toEqual(data.areas.map((a) => a.id))
    for (const a of data.counted) expect(data.npcById.has(a.npc), String(a.id)).toBe(true)
  })
})
