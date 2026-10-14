/**
 * Anecdotes (the game's "Travel Accounts"): what the checklist shows, from
 * the game data (`@gdt/game-data` loadAnecdotes), the newest capture that
 * carried irminsul's `gi_anecdotes`, and the marks made by hand.
 *
 * - Done = captured (`finishCount > 0` or `state == 3`) or marked by hand.
 *   A captured one stays done: its mark can't undo it.
 * - A variant (another version of an anecdote) counts as its base: either
 *   one captured means the base is done; marks are made on the base.
 * - The server lists only anecdotes the player has met, so an id absent from
 *   the capture is "not met", never "not done". Hidden ones (surprise
 *   encounters) are listed like the rest, marked as hidden.
 * - `state == 2` is active now; a repeatable loop shows how often it was done.
 */

import type { Anecdote, AnecdoteData, AnecdoteTexts } from '@gdt/game-data'
import type { GiAnecdote, GiAnecdotes } from '@gdt/shared'

/** What the newest capture with anecdotes says. */
export interface CapturedAnecdotes {
  entries: ReadonlyMap<number, GiAnecdote>
  /** The book's tabs the player has; null when no capture said. */
  unlockedAreas: ReadonlySet<number> | null
  reward: GiAnecdotes['reward'] | null
  /** When that capture was taken (epoch ms); null without one. */
  takenAt: number | null
}

export const NO_CAPTURED_ANECDOTES: CapturedAnecdotes = {
  entries: new Map(),
  unlockedAreas: null,
  reward: null,
  takenAt: null,
}

export function capturedAnecdotes(
  section: GiAnecdotes | null,
  takenAt: number | null,
): CapturedAnecdotes {
  if (!section) return NO_CAPTURED_ANECDOTES
  return {
    entries: new Map(
      Object.entries(section.anecdotes).map(([id, entry]) => [Number(id), entry] as const),
    ),
    unlockedAreas: new Set(section.unlockedAreas),
    reward: section.reward ?? null,
    takenAt,
  }
}

/** The capture's own rule: finished at least once, or recorded. */
export function isCapturedDone(entry: GiAnecdote | undefined): boolean {
  return !!entry && (entry.finishCount > 0 || entry.state === 3)
}

export type AnecdoteSource = 'captured' | 'marked'

export interface AnecdoteEntry {
  /** The anecdote a checklist counts (a base, never a variant). */
  anecdote: Anecdote
  /** Its id and its variants' ids. */
  ids: readonly number[]
  /** Why it is done: a capture first, else a hand mark; null when not done. */
  source: AnecdoteSource | null
  /** Marked by hand (also when a capture has it too). */
  marked: boolean
  /** In the capture (any state), or marked: the player has met it. */
  met: boolean
  /** Going on right now (`state == 2`). */
  active: boolean
  /** Times completed (the base and its variants together). */
  finishCount: number
}

export interface NpcGroup {
  npc: number
  entries: AnecdoteEntry[]
  done: number
  total: number
}

export interface AreaProgress {
  area: number
  /** In the capture's unlocked areas; null when no capture said. */
  unlocked: boolean | null
  /** Listed anecdotes by main NPC, in the game's NPC order. */
  groups: NpcGroup[]
  /** Counted anecdotes done / in all. */
  done: number
  total: number
}

export interface AnecdoteProgress {
  areas: AreaProgress[]
  done: number
  total: number
  active: number
  /** Captured ids the game data doesn't know (newer than it). */
  unknown: number[]
}

/** Every counted anecdote's state, by area and NPC. */
export function anecdoteProgress(
  data: AnecdoteData,
  captured: CapturedAnecdotes,
  marked: ReadonlySet<number>,
): AnecdoteProgress {
  const variants = new Map<number, number[]>()
  for (const a of data.anecdotes) {
    if (!a.variantOf) continue
    const list = variants.get(a.variantOf)
    if (list) list.push(a.id)
    else variants.set(a.variantOf, [a.id])
  }
  const npcOrder = new Map(data.npcs.map((npc, index) => [npc.id, index]))

  const byArea = new Map<number, Map<number, AnecdoteEntry[]>>()
  const counts = new Map<number, { done: number; total: number }>()
  let active = 0
  for (const anecdote of data.counted) {
    const ids = [anecdote.id, ...(variants.get(anecdote.id) ?? [])]
    const seen = ids.map((id) => captured.entries.get(id)).filter((e) => e !== undefined)
    const capturedDone = seen.some(isCapturedDone)
    const isMarked = marked.has(anecdote.id)
    const entry: AnecdoteEntry = {
      anecdote,
      ids,
      source: capturedDone ? 'captured' : isMarked ? 'marked' : null,
      marked: isMarked,
      met: seen.length > 0 || isMarked,
      active: seen.some((e) => e.state === 2),
      finishCount: seen.reduce((sum, e) => sum + e.finishCount, 0),
    }
    if (entry.active) active++
    const count = counts.get(anecdote.area) ?? { done: 0, total: 0 }
    count.total++
    if (entry.source) count.done++
    counts.set(anecdote.area, count)
    let npcs = byArea.get(anecdote.area)
    if (!npcs) byArea.set(anecdote.area, (npcs = new Map()))
    const list = npcs.get(anecdote.npc)
    if (list) list.push(entry)
    else npcs.set(anecdote.npc, [entry])
  }

  const areas = data.areas.map((area): AreaProgress => {
    const npcs = byArea.get(area.id) ?? new Map<number, AnecdoteEntry[]>()
    const groups = [...npcs]
      .sort(
        ([a], [b]) =>
          (npcOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (npcOrder.get(b) ?? Number.MAX_SAFE_INTEGER) || a - b,
      )
      .map(([npc, entries]) => {
        entries.sort((a, b) => a.anecdote.id - b.anecdote.id)
        return {
          npc,
          entries,
          done: entries.filter((e) => e.source).length,
          total: entries.length,
        }
      })
    const count = counts.get(area.id) ?? { done: 0, total: 0 }
    return {
      area: area.id,
      unlocked: captured.unlockedAreas ? captured.unlockedAreas.has(area.id) : null,
      groups,
      done: count.done,
      total: count.total,
    }
  })
  const known = new Set(data.anecdotes.map((a) => a.id))
  return {
    areas,
    done: areas.reduce((sum, a) => sum + a.done, 0),
    total: areas.reduce((sum, a) => sum + a.total, 0),
    active,
    unknown: [...captured.entries.keys()].filter((id) => !known.has(id)).sort((a, b) => a - b),
  }
}

/** The id a hand mark goes on (a variant's base); null when a capture already has it done. */
export function markTarget(entry: AnecdoteEntry): number | null {
  return entry.source === 'captured' ? null : entry.anecdote.id
}

// ------------------------------------------------------------------- filters

export type AnecdoteCompletion = 'all' | 'missing' | 'done'

export interface AnecdoteFilters {
  /** An area id, or null for every area. */
  area: number | null
  completion: AnecdoteCompletion
  query: string
}

export const DEFAULT_ANECDOTE_FILTERS: AnecdoteFilters = {
  area: null,
  completion: 'all',
  query: '',
}

/** The game's text without its markup (`<color=…>…</color>`), on one line. */
export function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\\n|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The game's text in runs, the coloured ones (places, times of day) marked. */
export function textRuns(text: string): { text: string; em: boolean }[] {
  const runs: { text: string; em: boolean }[] = []
  const pattern = /<color=[^>]*>(.*?)<\/color>/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), em: false })
    runs.push({ text: match[1]!, em: true })
    last = match.index + match[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), em: false })
  return runs
    .map((run) => ({ ...run, text: run.text.replace(/<[^>]*>/g, '').replace(/\\n|\n/g, ' ') }))
    .filter((run) => run.text)
}

/** A title's "Name: " prefix: an ASCII colon and a space, or Chinese text's full-width colon. */
const PREFIX_END = /:\s|：\s*/

/** "Noelle: Bladework" -> "Bladework": the group heading already names the NPC. */
export function shortTitle(title: string, npcName: string | undefined): string {
  const plain = plainText(title)
  if (npcName && plain.startsWith(npcName)) {
    const end = PREFIX_END.exec(plain.slice(npcName.length))
    if (end?.index === 0) return plain.slice(npcName.length + end[0].length)
  }
  const colon = PREFIX_END.exec(plain)
  return colon && colon.index > 0 && colon.index < 40
    ? plain.slice(colon.index + colon[0].length)
    : plain
}

export function matchesCompletion(entry: AnecdoteEntry, completion: AnecdoteCompletion): boolean {
  if (completion === 'all') return true
  return completion === 'done' ? entry.source !== null : entry.source === null
}

function searchText(entry: AnecdoteEntry, text: AnecdoteTexts): string {
  const words = text.anecdotes.get(entry.anecdote.id)
  return [
    String(entry.anecdote.id),
    words?.title ?? '',
    words?.summary ?? '',
    words?.hint ?? '',
    text.npcs.get(entry.anecdote.npc) ?? '',
  ]
    .map(plainText)
    .join('\n')
    .toLowerCase()
}

export interface ShownArea extends AreaProgress {
  /** The groups and rows that pass the filters (empty groups dropped). */
  shown: NpcGroup[]
}

/**
 * The areas and rows the filters leave. `kept` rows stay whatever their
 * completion (rows toggled since the filters changed, so a mark doesn't
 * make the row vanish under the pointer).
 */
export function filterAnecdotes(
  progress: AnecdoteProgress,
  filters: AnecdoteFilters,
  text: AnecdoteTexts,
  kept: ReadonlySet<number> = new Set(),
): ShownArea[] {
  const query = filters.query.trim().toLowerCase()
  return progress.areas
    .filter((area) => filters.area === null || area.area === filters.area)
    .map((area) => ({
      ...area,
      shown: area.groups
        .map((group) => ({
          ...group,
          entries: group.entries.filter(
            (entry) =>
              (kept.has(entry.anecdote.id) || matchesCompletion(entry, filters.completion)) &&
              (!query || searchText(entry, text).includes(query)),
          ),
        }))
        .filter((group) => group.entries.length > 0),
    }))
}

export function hasAnecdoteFilters(filters: AnecdoteFilters): boolean {
  return filters.completion !== 'all' || filters.query.trim() !== ''
}

/**
 * A group's rows for the soft-hidden view (the default: completed ones out of
 * the way but one tap from sight): what is still to do, and what is done.
 * `kept` rows count as still to do, so a row ticked a moment ago stays where
 * it was instead of folding away under the pointer.
 */
export function splitDone(
  group: NpcGroup,
  kept: ReadonlySet<number> = new Set(),
): { open: AnecdoteEntry[]; finished: AnecdoteEntry[] } {
  const open: AnecdoteEntry[] = []
  const finished: AnecdoteEntry[] = []
  for (const entry of group.entries) {
    if (entry.source === null || kept.has(entry.anecdote.id)) open.push(entry)
    else finished.push(entry)
  }
  return { open, finished }
}

/** Groups with something left to do first, finished ones after (each keeping data order). */
export function unfinishedFirst<T extends NpcGroup>(
  groups: readonly T[],
  kept: ReadonlySet<number> = new Set(),
): T[] {
  const open = groups.filter((group) => splitDone(group, kept).open.length > 0)
  return [...open, ...groups.filter((group) => !open.includes(group))]
}

/** Rows the filters leave, over every shown area. */
export function countShown(areas: readonly ShownArea[]): number {
  return areas.reduce(
    (sum, area) => sum + area.shown.reduce((n, group) => n + group.entries.length, 0),
    0,
  )
}
