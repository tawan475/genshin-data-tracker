/**
 * The game data can't tell a datamine-only achievement (in the files, never
 * shown in game) from a real one, so the build compares it with stardb.gg's
 * list (https://stardb.gg, thanks!), which only has achievements players can
 * see. Warnings only: the hand-kept overrides/achievement-unobtainable.json
 * decides, so builds stay reproducible, and an unreachable stardb only skips
 * the check. stardb's `impossible` flag is not used: it marks real
 * achievements few or no players have completed, which still count in game.
 */

import type { AchievementsFile } from '../../src/format.ts'
import { get } from './http.ts'
import type { Problems } from './problems.ts'

const STARDB = 'https://stardb.gg/api/gi/achievements?lang=en'

export interface StardbAchievement {
  id: number
}

/** What to look at in achievement-unobtainable.json, as warnings. */
export function compareWithStardb(
  achievements: AchievementsFile,
  unobtainable: ReadonlyMap<number, string>,
  stardb: readonly StardbAchievement[],
): string[] {
  const listed = new Set(stardb.map((a) => a.id))
  const warnings: string[] = []
  const missing: number[] = []
  for (const row of achievements.rows) {
    const [id, , , , , , , , disused] = row
    if (disused === 0 && !listed.has(id)) missing.push(id)
  }
  if (missing.length > 0) {
    warnings.push(
      `stardb.gg doesn't list achievement(s) ${missing.join(', ')}: datamine-only? If the game never shows them, add them to achievement-unobtainable.json (new this patch: stardb may not have caught up yet)`,
    )
  }
  const shown = [...unobtainable.keys()].filter((id) => listed.has(id))
  if (shown.length > 0) {
    warnings.push(
      `achievement-unobtainable.json lists ${shown.join(', ')}, which stardb.gg lists: players can see them, so remove them`,
    )
  }
  return warnings
}

export async function checkAgainstStardb(
  achievements: AchievementsFile,
  unobtainable: ReadonlyMap<number, string>,
  problems: Problems,
): Promise<void> {
  let stardb: StardbAchievement[]
  try {
    const response = await get(STARDB, { attempts: 2, timeoutMs: 30_000 })
    if (!response) throw new Error('not found')
    stardb = (await response.json()) as StardbAchievement[]
    if (!Array.isArray(stardb) || stardb.length < 1000) throw new Error('unexpected answer')
  } catch (error) {
    console.log(`stardb.gg check skipped: ${(error as Error).message}`)
    return
  }
  for (const warning of compareWithStardb(achievements, unobtainable, stardb)) {
    problems.warn(warning)
  }
}
