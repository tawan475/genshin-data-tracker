import type { GameNotice, GiEvent } from '@gdt/shared'

/**
 * The events in the newest capture (Capture 1.7.0's `gi_events`: by activity
 * id, its window and reward counters), named by the game data
 * (`@gdt/game-data/collections` `events`, from v7.1.19). An event it does not
 * name takes the title of the one notice whose dates match its own (within a
 * day, either end; the board keys notices by announcement id); with none or
 * several it stays unnamed. The notice still lends its banner. Pure.
 */

export interface EventRow {
  id: number
  /** The game data's name, else the matching notice's title; null when neither. */
  name: string | null
  image: string | null
  /** Epoch ms. */
  start: number
  end: number
  running: boolean
  claimed: number
  /** Counters done whose reward is still waiting. */
  waiting: number
  total: number
}

const DAY = 86_400_000

/** A notice's local date text ("2026-10-27 10:00:00") as epoch ms (read as UTC: within a day of the truth). */
const noticeMs = (text: string | null) => (text ? Date.parse(`${text.replace(' ', 'T')}Z`) : NaN)

export function eventRows(
  events: Record<string, GiEvent>,
  notices: readonly GameNotice[],
  title: (notice: GameNotice) => string,
  now: number,
  /** The game data's name of an activity id ('' when it has none). */
  gameName: (id: number) => string = () => '',
): EventRow[] {
  const boards = notices.filter((n) => n.kind === 'event')
  return Object.entries(events)
    .map(([key, e]) => {
      const start = e.start * 1000
      const end = e.end * 1000
      const near = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= DAY
      const matches = boards.filter(
        (n) => near(noticeMs(n.start), start) && (n.end === null || near(noticeMs(n.end), end)),
      )
      const notice = matches.length === 1 ? matches[0]! : null
      const counters = Object.values(e.progress ?? {})
      return {
        id: Number(key),
        name: gameName(Number(key)) || (notice ? title(notice) : null),
        image: notice?.image ?? null,
        start,
        end,
        running: start <= now && now < end,
        claimed: counters.filter((c) => c.claimed).length,
        waiting: counters.filter((c) => !c.claimed && c.total > 0 && c.progress >= c.total).length,
        total: counters.length,
      }
    })
    .sort((a, b) => Number(b.running) - Number(a.running) || b.end - a.end || a.id - b.id)
}
