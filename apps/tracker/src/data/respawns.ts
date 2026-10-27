import type { GiTasks } from '@gdt/shared'
import type { FarmingData } from '@gdt/game-data/farming'

/**
 * Bosses' and elites' respawns (Capture 1.7.0's `gi_tasks.respawns`: one
 * unix time per spot, by Adventurer Handbook id) against the farming data's
 * bosses and enemy groups, which use the same ids. A time already past means
 * that spot is up. Pure.
 */

export interface RespawnRow {
  id: number
  name: string
  kind: 'boss' | 'enemy'
  spots: number
  /** Spots up at `now`. */
  up: number
  /** When the next spot comes back (ms), null when all are up. */
  next: number | null
}

export function respawnRows(
  respawns: NonNullable<GiTasks['respawns']>,
  farming: FarmingData | null,
  now: number,
): RespawnRow[] {
  const bosses = new Map(farming?.bosses.map((b) => [b.id, b.name]) ?? [])
  const enemies = new Map(farming?.enemies.map((e) => [e.id, e.name]) ?? [])
  return Object.entries(respawns)
    .map(([key, times]) => {
      const id = Number(key)
      const ms = times.map((at) => at * 1000)
      const waiting = ms.filter((at) => at > now)
      return {
        id,
        name: bosses.get(id) ?? enemies.get(id) ?? `#${id}`,
        kind: bosses.has(id) ? ('boss' as const) : ('enemy' as const),
        spots: ms.length,
        up: ms.length - waiting.length,
        next: waiting.length ? Math.min(...waiting) : null,
      }
    })
    .sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'boss' ? -1 : 1) ||
        (a.next ?? 0) - (b.next ?? 0) ||
        a.name.localeCompare(b.name),
    )
}
