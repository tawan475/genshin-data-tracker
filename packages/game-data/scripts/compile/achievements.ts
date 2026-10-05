/**
 * Achievements and their categories ("goals") from AchievementExcelConfigData,
 * AchievementGoalExcelConfigData and RewardExcelConfigData.
 *
 * - goal: `goalId`, missing for goal 0 ("Wonders of the World").
 * - hidden: `isShow == "SHOWTYPE_HIDE"`. disused: `isDisuse` (kept, not counted),
 *   or listed in overrides/achievement-unobtainable.json (datamine-only: the
 *   game never shows them, so nobody can earn them either).
 * - prevStage: `preStageAchievementId`, chaining the tiers of one achievement.
 * - primogems: item 201 in the `finishRewardId` reward.
 * - version: not in the game data. overrides/achievement-versions.json (seeded
 *   once from stardb) wins, then the version an id was first compiled with,
 *   then the dump's game version for ids new in this build.
 * - text: titles and descriptions (with {param0} filled from `progress`).
 */

import type {
  AchievementRow,
  AchievementsFile,
  GoalRow,
  GoalsFile,
  TextFile,
} from '../../src/format.ts'
import { bool, checkFields, list, num, str, type Row, type TextMap } from '../lib/excel.ts'
import { sortedObject } from '../lib/json.ts'
import type { Problems } from '../lib/problems.ts'

export const ACHIEVEMENT_FILES = {
  achievements: 'ExcelBinOutput/AchievementExcelConfigData.json',
  goals: 'ExcelBinOutput/AchievementGoalExcelConfigData.json',
  rewards: 'ExcelBinOutput/RewardExcelConfigData.json',
} as const

const PRIMOGEM = 201
export const ACHIEVEMENT_COLUMNS = [
  'id',
  'goal',
  'order',
  'hidden',
  'prevStage',
  'primogems',
  'progress',
  'version',
  'disused',
]
export const GOAL_COLUMNS = ['id', 'order', 'icon']

export interface AchievementInputs {
  achievements: Row[]
  goals: Row[]
  rewards: Row[]
  /** Display text (TextMap_MediumEN + TextMapEN). */
  text: TextMap
}

export interface AchievementContext {
  gameVersion: string
  versions: Map<number, string>
  /** Datamine-only ids: the game neither shows them nor marks them disused. */
  unobtainable?: ReadonlyMap<number, string>
  previous?: AchievementsFile
  problems: Problems
}

export interface CompiledAchievements {
  achievements: AchievementsFile
  goals: GoalsFile
  text: TextFile
}

export function compileAchievements(
  inputs: AchievementInputs,
  context: AchievementContext,
): CompiledAchievements {
  const { problems } = context
  checkFields(problems, 'AchievementExcelConfigData', inputs.achievements, {
    id: 0.99,
    titleTextMapHash: 0.99,
    descTextMapHash: 0.99,
    finishRewardId: 0.9,
    progress: 0.9,
    orderId: 0.9,
    goalId: 0.2,
    isShow: 0.2,
    preStageAchievementId: 0.05,
    isDisuse: 0.01,
  })
  checkFields(problems, 'AchievementGoalExcelConfigData', inputs.goals, {
    id: 0.9,
    orderId: 0.9,
    nameTextMapHash: 0.99,
    iconPath: 0.9,
  })
  checkFields(problems, 'RewardExcelConfigData', inputs.rewards, {
    rewardId: 0.99,
    rewardItemList: 0.9,
  })

  const rewards = new Map(inputs.rewards.map((r) => [num(r, 'rewardId'), r]))
  const previousVersions = new Map(
    (context.previous?.rows ?? []).map((row) => [row[0], row[7]] as const),
  )

  const goalRows: GoalRow[] = []
  const goalText = new Map<string, string>()
  for (const goal of inputs.goals) {
    const id = num(goal, 'id')
    const name = inputs.text.get(goal.nameTextMapHash)
    const icon = str(goal, 'iconPath').trim()
    if (!name) problems.error(`Achievement category ${id} has no name`)
    if (!icon) problems.error(`Achievement category ${id} (${name}) has no icon`)
    goalRows.push([id, num(goal, 'orderId'), icon])
    if (name) goalText.set(String(id), name)
  }
  goalRows.sort((a, b) => a[0] - b[0])
  const goalIds = new Set(goalRows.map((g) => g[0]))

  const rows: AchievementRow[] = []
  const text = new Map<string, [string, string]>()
  const unknownShow = new Set<string>()
  for (const achievement of inputs.achievements) {
    const id = num(achievement, 'id')
    const disusedInGame = bool(achievement, 'isDisuse')
    if (disusedInGame && context.unobtainable?.has(id)) {
      problems.warn(
        `achievement-unobtainable.json lists ${id}, which the game already marks disused; remove it`,
      )
    }
    const disused = disusedInGame || (context.unobtainable?.has(id) ?? false)
    const goal = num(achievement, 'goalId')
    const progress = num(achievement, 'progress')
    const show = str(achievement, 'isShow')
    if (show !== '' && show !== 'SHOWTYPE_HIDE') unknownShow.add(show)

    const reward = rewards.get(num(achievement, 'finishRewardId'))
    let primogems = 0
    for (const item of list(reward ?? {}, 'rewardItemList')) {
      if (num(item, 'itemId') === PRIMOGEM) primogems += num(item, 'itemCount')
    }
    if (!disused && !reward) problems.warn(`Achievement ${id} has no reward row`)

    const title = inputs.text.get(achievement.titleTextMapHash)
    const rawDescription = inputs.text.get(achievement.descTextMapHash)
    const description = rawDescription?.replaceAll('{param0}', String(progress))
    if (title && description !== undefined) text.set(String(id), [title, description])
    if (!disused) {
      if (!title) problems.error(`Achievement ${id} has no title text`)
      if (description === undefined) problems.error(`Achievement ${id} has no description text`)
      else if (/\{param\d*\}/.test(description)) {
        problems.warn(`Achievement ${id}: description has an unfilled placeholder: ${description}`)
      }
      if (!goalIds.has(goal)) problems.error(`Achievement ${id} is in unknown category ${goal}`)
    }

    const previous = previousVersions.get(id)
    const version = context.versions.get(id) ?? (previous || (disused ? '' : context.gameVersion))
    rows.push([
      id,
      goal,
      num(achievement, 'orderId'),
      show === 'SHOWTYPE_HIDE' ? 1 : 0,
      num(achievement, 'preStageAchievementId'),
      primogems,
      progress,
      version,
      disused ? 1 : 0,
    ])
  }
  rows.sort((a, b) => a[0] - b[0])

  for (const show of unknownShow) {
    problems.warn(`Achievement isShow value "${show}" is new; it is treated as visible`)
  }
  const ids = new Set(rows.map((r) => r[0]))
  const seen = new Set<number>()
  for (const row of rows) {
    if (seen.has(row[0])) problems.error(`Achievement ${row[0]} appears twice`)
    seen.add(row[0])
    if (row[4] && !ids.has(row[4])) {
      problems.warn(`Achievement ${row[0]}: previous stage ${row[4]} does not exist`)
    }
  }
  for (const id of context.unobtainable?.keys() ?? []) {
    if (!ids.has(id))
      problems.warn(`achievement-unobtainable.json lists ${id}, which is not in the dump`)
  }
  for (const id of context.versions.keys()) {
    if (!ids.has(id))
      problems.warn(`achievement-versions.json lists ${id}, which is not in the dump`)
  }

  return {
    achievements: { columns: ACHIEVEMENT_COLUMNS, rows },
    goals: { columns: GOAL_COLUMNS, rows: goalRows },
    text: { goals: sortedObject(goalText), achievements: sortedObject(text) },
  }
}
