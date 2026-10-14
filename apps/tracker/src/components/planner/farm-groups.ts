/**
 * How the Farm view lays its cards out, Seelie's way (presentation only:
 * the cards come from farm-today.ts unchanged):
 * - tabs: Today (every section), one per resin cost, Artifacts, Schedule;
 *   a tab with nothing in it is disabled;
 * - inside a section, the cards under a type label: Ley Line Outcrop,
 *   Domain of Mastery, Domain of Forgery first (as Seelie orders them),
 *   then artifact domains, bosses, weekly bosses, local specialties,
 *   enemies, ore and the rest;
 * - a strip of everyone the plan is for (one portrait per character, a
 *   spare weapon its own), which can narrow the cards to one of them.
 * Pure; the panel keeps the results in computed()s.
 */

import type { FarmCard, FarmSectionKey } from './farm-today'

// ------------------------------------------------------------------ tabs

export type FarmTab = 'all' | FarmSectionKey | 'schedule'

/** The tabs in order: Today, by resin cost (0, 20, 40, 30/60), Artifacts, Schedule. */
export const FARM_TABS: readonly FarmTab[] = [
  'all',
  'free',
  'domain',
  'boss',
  'weekly',
  'artifact',
  'schedule',
]

export const isFarmTab = (value: unknown): value is FarmTab =>
  typeof value === 'string' && (FARM_TABS as readonly string[]).includes(value)

/**
 * The tab shown: the chosen one, or Today when the chosen section has
 * nothing in it (the choice is kept for when it fills again).
 */
export function shownTab(chosen: FarmTab, counts: Readonly<Partial<Record<FarmTab, number>>>) {
  if (chosen === 'all' || chosen === 'schedule') return chosen
  return (counts[chosen] ?? 0) > 0 ? chosen : 'all'
}

// ------------------------------------------------------------------ type groups

export type FarmGroupKey =
  | 'ley'
  | 'mastery'
  | 'forgery'
  | 'blessing'
  | 'boss'
  | 'weekly'
  | 'local'
  | 'common'
  | 'elite'
  | 'ore'
  | 'other'

/** Ley lines, talent books, weapon materials first (Seelie's order), then the rest. */
export const GROUP_ORDER: readonly FarmGroupKey[] = [
  'ley',
  'mastery',
  'forgery',
  'blessing',
  'boss',
  'weekly',
  'local',
  'common',
  'elite',
  'ore',
  'other',
]

/** The type a card is grouped under. */
export function groupOf(card: Pick<FarmCard, 'id' | 'kind' | 'domain'>): FarmGroupKey {
  switch (card.kind) {
    case 'ley':
      return 'ley'
    case 'domain':
      return card.domain === 'weapon' ? 'forgery' : 'mastery'
    case 'artifact':
      // Sets no domain drops (bosses, events) aren't a Domain of Blessing.
      return card.id === 'artifact:elsewhere' ? 'other' : 'blessing'
    case 'boss':
    case 'gem':
      return 'boss'
    case 'weekly':
      return 'weekly'
    case 'local':
      return 'local'
    case 'common':
      return 'common'
    case 'elite':
      return 'elite'
    case 'ore':
      return 'ore'
    default:
      return 'other'
  }
}

/** The group a section is named after: its label would only repeat the section's. */
const NAMESAKE: Partial<Record<FarmSectionKey, FarmGroupKey>> = {
  boss: 'boss',
  weekly: 'weekly',
}

export interface CardGroup {
  key: FarmGroupKey
  cards: FarmCard[]
  /** Show the type label (not when the section holds only its namesake). */
  labelled: boolean
}

/**
 * A section's cards under their type labels, in `GROUP_ORDER`; within a
 * group the cards keep their order (locked ones stay last).
 */
export function groupCards(section: FarmSectionKey, cards: readonly FarmCard[]): CardGroup[] {
  const byKey = new Map<FarmGroupKey, FarmCard[]>()
  for (const card of cards) {
    const key = groupOf(card)
    const list = byKey.get(key)
    if (list) list.push(card)
    else byKey.set(key, [card])
  }
  const groups = GROUP_ORDER.flatMap((key) => {
    const list = byKey.get(key)
    return list ? [{ key, cards: list, labelled: true }] : []
  })
  const only = groups.length === 1 ? groups[0]! : null
  if (only && NAMESAKE[section] === only.key) only.labelled = false
  return groups
}

// ------------------------------------------------------------------ people

/**
 * Who a goal is for: `c:<character>` (its own goal, a custom character's, or
 * a weapon goal's holder), `w:<weapon>` (a spare weapon), `extra` (extra
 * item needs). As GoalAvatars counts them: one portrait per character.
 */
export function goalSlot(goal: string): string {
  const [kind, key = '', owner = ''] = goal.split(':')
  if (kind === 'item') return 'extra'
  if (kind === 'character' || kind === 'custom') return `c:${key}`
  return owner ? `c:${owner}` : `w:${key}`
}

export interface FarmPerson {
  /** `goalSlot` of the goals. */
  slot: string
  /** The goals on the cards for this person, first seen first (the first names them). */
  goals: string[]
}

/**
 * Everyone the cards are for (extra item needs aside), in `order` (goal
 * ids in priority order) and then as the cards first name them.
 */
export function farmPeople(
  cards: readonly Pick<FarmCard, 'goals'>[],
  order: readonly string[] = [],
): FarmPerson[] {
  const people = new Map<string, FarmPerson>()
  for (const card of cards) {
    for (const goal of card.goals) {
      const slot = goalSlot(goal)
      if (slot === 'extra') continue
      const person = people.get(slot)
      if (!person) people.set(slot, { slot, goals: [goal] })
      else if (!person.goals.includes(goal)) person.goals.push(goal)
    }
  }
  const rank = new Map<string, number>()
  order.forEach((goal, i) => {
    const slot = goalSlot(goal)
    if (!rank.has(slot)) rank.set(slot, i)
  })
  const list = [...people.values()]
  const at = (p: FarmPerson) => rank.get(p.slot) ?? Infinity
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => at(a.p) - at(b.p) || a.i - b.i)
    .map((x) => x.p)
}

/** The cards with something for `slot` (all of them when null). */
export function cardsFor<T extends Pick<FarmCard, 'goals'>>(
  cards: readonly T[],
  slot: string | null,
): T[] {
  if (slot === null) return [...cards]
  return cards.filter((c) => c.goals.some((g) => goalSlot(g) === slot))
}
