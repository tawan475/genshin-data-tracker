import { decodePlanner } from '@gdt/game-data'
import dropsJson from '@gdt/game-data/data/drops.json'
import plannerJson from '@gdt/game-data/data/planner.json'
import { parseDropRates } from '@gdt/game-data/drops'
import type { PlannerFile } from '@gdt/game-data/format'
import { farmPlan } from '@gdt/game-data/planner-estimate'
import { emptyRequirement, planTotals, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import {
  cardsFor,
  farmPeople,
  goalSlot,
  groupCards,
  groupOf,
  shownTab,
  type FarmGroupKey,
} from '../farm-groups'
import { todaySections, type FarmCard, type FarmInput } from '../farm-today'

const card = (id: string, kind: FarmCard['kind'], extra: Partial<FarmCard> = {}): FarmCard => ({
  id,
  kind,
  name: id,
  detail: '',
  domain: null,
  resinPerRun: 0,
  run: null,
  status: 'ok',
  lock: null,
  lines: [],
  goals: [],
  paid: 0,
  blocked: 0,
  sets: [],
  ...extra,
})

const keys = (groups: { key: FarmGroupKey }[]) => groups.map((g) => g.key)
const ids = (list: { id: string }[]) => list.map((c) => c.id)

describe('type groups', () => {
  it('names each kind of card after its place', () => {
    expect(groupOf(card('ley:exp', 'ley'))).toBe('ley')
    expect(groupOf(card('d1', 'domain', { domain: 'talent' }))).toBe('mastery')
    expect(groupOf(card('d2', 'domain', { domain: 'weapon' }))).toBe('forgery')
    expect(groupOf(card('artifact:3', 'artifact'))).toBe('blessing')
    expect(groupOf(card('artifact:elsewhere', 'artifact'))).toBe('other')
    expect(groupOf(card('boss:x', 'boss'))).toBe('boss')
    expect(groupOf(card('gem:x', 'gem'))).toBe('boss')
    expect(groupOf(card('w', 'weekly'))).toBe('weekly')
    expect(groupOf(card('local:1', 'local'))).toBe('local')
    expect(groupOf(card('common:1', 'common'))).toBe('common')
    expect(groupOf(card('elite:1', 'elite'))).toBe('elite')
    expect(groupOf(card('ore', 'ore'))).toBe('ore')
    expect(groupOf(card('other', 'other'))).toBe('other')
  })

  it('puts ley lines, then mastery, then forgery first, keeping each group’s order', () => {
    const cards = [
      card('forgery-a', 'domain', { domain: 'weapon' }),
      card('mastery-a', 'domain', { domain: 'talent' }),
      card('mastery-locked', 'domain', { domain: 'talent', lock: 'AR 40' }),
      card('ley:exp', 'ley'),
      card('ley:mora', 'ley'),
    ]
    const groups = groupCards('domain', cards)
    expect(keys(groups)).toEqual(['ley', 'mastery', 'forgery'])
    expect(groups.map((g) => ids(g.cards))).toEqual([
      ['ley:exp', 'ley:mora'],
      ['mastery-a', 'mastery-locked'],
      ['forgery-a'],
    ])
    expect(groups.every((g) => g.labelled)).toBe(true)
  })

  it('orders the no-resin cards: local specialties, enemies, ore, the rest', () => {
    const cards = [
      card('other', 'other'),
      card('ore', 'ore'),
      card('elite:1', 'elite'),
      card('common:1', 'common'),
      card('local:2', 'local'),
    ]
    expect(keys(groupCards('free', cards))).toEqual(['local', 'common', 'elite', 'ore', 'other'])
  })

  it('leaves out a label that would only repeat the section’s name', () => {
    expect(groupCards('boss', [card('boss:a', 'boss'), card('gem:b', 'gem')])).toEqual([
      { key: 'boss', cards: [card('boss:a', 'boss'), card('gem:b', 'gem')], labelled: false },
    ])
    expect(groupCards('weekly', [card('w', 'weekly')])[0]!.labelled).toBe(false)
    // Artifact domains are labelled (Domain of Blessing), and so is what no domain drops.
    const artifacts = groupCards('artifact', [
      card('artifact:elsewhere', 'artifact'),
      card('artifact:1', 'artifact'),
    ])
    expect(artifacts.map((g) => [g.key, g.labelled])).toEqual([
      ['blessing', true],
      ['other', true],
    ])
  })

  it('has nothing for an empty section', () => {
    expect(groupCards('free', [])).toEqual([])
  })
})

describe('tabs', () => {
  it('keeps the chosen tab while it has cards, else shows Today', () => {
    expect(shownTab('boss', { boss: 2 })).toBe('boss')
    expect(shownTab('boss', { boss: 0 })).toBe('all')
    expect(shownTab('weekly', {})).toBe('all')
    expect(shownTab('all', {})).toBe('all')
    expect(shownTab('schedule', {})).toBe('schedule')
  })
})

describe('people', () => {
  it('is one slot per character: its goals, its weapons’ goals, custom characters', () => {
    expect(goalSlot('character:Amber')).toBe('c:Amber')
    expect(goalSlot('custom:abc')).toBe('c:abc')
    expect(goalSlot('weapon:FavoniusSword:Lisa:3')).toBe('c:Lisa')
    expect(goalSlot('weapon:FavoniusSword::4')).toBe('w:FavoniusSword')
    expect(goalSlot('item:Mora')).toBe('extra')
  })

  it('lists everyone the cards are for, in priority order, then as first seen', () => {
    const cards = [
      card('a', 'boss', { goals: ['character:Lisa', 'item:Mora'] }),
      card('b', 'domain', { goals: ['weapon:FavoniusSword:Lisa:3', 'character:Amber'] }),
      card('c', 'local', { goals: ['weapon:Rust::5', 'character:Noelle'] }),
    ]
    const people = farmPeople(cards, ['character:Amber', 'weapon:FavoniusSword:Lisa:3'])
    expect(people).toEqual([
      { slot: 'c:Amber', goals: ['character:Amber'] },
      { slot: 'c:Lisa', goals: ['character:Lisa', 'weapon:FavoniusSword:Lisa:3'] },
      { slot: 'w:Rust', goals: ['weapon:Rust::5'] },
      { slot: 'c:Noelle', goals: ['character:Noelle'] },
    ])
  })

  it('narrows the cards to one person, or keeps them all', () => {
    const cards = [
      card('a', 'boss', { goals: ['character:Lisa'] }),
      card('b', 'domain', { goals: ['weapon:FavoniusSword:Lisa:3'] }),
      card('c', 'local', { goals: ['character:Amber'] }),
    ]
    expect(ids(cardsFor(cards, 'c:Lisa'))).toEqual(['a', 'b'])
    expect(ids(cardsFor(cards, 'c:Noelle'))).toEqual([])
    expect(ids(cardsFor(cards, null))).toEqual(['a', 'b', 'c'])
  })
})

describe('on a real plan', () => {
  const planner = decodePlanner(plannerJson as unknown as PlannerFile)
  const { rates: drops } = parseDropRates(dropsJson)
  const goal = (id: string, items: Record<string, number>, extra = {}): PlanGoal => ({
    id,
    requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)), ...extra },
  })
  // Freedom (Mon/Thu, Forsaken Rift), Decarabian (Mon/Thu, Cecilia Garden), Blossom of Revelation.
  const goals = [
    goal('character:Amber', { TeachingsOfFreedom: 9 }, { characterExp: 100_000 }),
    goal('weapon:FavoniusSword:Lisa', { TileOfDecarabiansTower: 5 }),
  ]
  const totals = planTotals(planner, goals, {})
  const input: FarmInput = {
    planner,
    plan: farmPlan(planner, totals, drops, { ar: 60, wl: 8 }),
    totals,
    drops,
    ar: 60,
    wl: 8,
    refreshes: 0,
  }

  it('groups Monday’s 20-resin cards as ley line, mastery, forgery', () => {
    const domain = todaySections(input, 1).find((s) => s.key === 'domain')!
    const groups = groupCards('domain', domain.cards)
    expect(keys(groups)).toEqual(['ley', 'mastery', 'forgery'])
    expect(groups.flatMap((g) => g.cards).length).toBe(domain.cards.length)
    expect(farmPeople(domain.cards).map((p) => p.slot)).toEqual(['c:Amber', 'c:Lisa'])
  })
})
