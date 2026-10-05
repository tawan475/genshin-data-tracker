/**
 * The game data can't tell an achievement nobody can earn (datamine-only, or
 * not obtainable yet) from a real one, so the build compares it with
 * stardb.gg's list (https://stardb.gg, thanks!), which only has achievements
 * players can see and flags the ones nobody can complete. Warnings only: the
 * hand-kept overrides/achievement-unobtainable.json decides, so builds stay
 * reproducible, and an unreachable stardb only skips the check.
 */

import type { AchievementsFile } from '../../src/format.ts'
import { get } from './http.ts'
import type { Problems } from './problems.ts'

const STARDB = 'https://stardb.gg/api/gi/achievements?lang=en'

export interface StardbAchievement {
  id: number
  impossible?: boolean
}

/** What to look at in achievement-unobtainable.json, as warnings. */
export function compareWithStardb(
  achievements: AchievementsFile,
  unobtainable: ReadonlyMap<number, string>,
  stardb: readonly StardbAchievement[],
): string[] {
  const listed = new Map(stardb.map((a) => [a.id, a.impossible === true]))
  const warnings: string[] = []
  const missing: number[] = []
  const impossible: number[] = []
  for (const row of achievements.rows) {
    const [id, , , , , , , , disused] = row
    if (disused === 1) continue
    if (!listed.has(id)) missing.push(id)
    else if (listed.get(id)) impossible.push(id)
  }
  if (missing.length > 0) {
    warnings.push(
      `stardb.gg doesn't list achievement(s) ${missing.join(', ')}: datamine-only? If so, add them to achievement-unobtainable.json (new this patch: stardb may not have caught up yet)`,
    )
  }
  if (impossible.length > 0) {
    warnings.push(
      `stardb.gg flags achievement(s) ${impossible.join(', ')} impossible: add them to achievement-unobtainable.json if nobody can earn them yet`,
    )
  }
  const obtainable = [...unobtainable.keys()].filter((id) => listed.get(id) === false)
  if (obtainable.length > 0) {
    warnings.push(
      `achievement-unobtainable.json lists ${obtainable.join(', ')}, which stardb.gg now lists as obtainable: remove them if they are`,
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
