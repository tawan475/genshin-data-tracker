import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { achievementText, loadAchievements } from '../src'
import stardb from './fixtures/stardb-achievements.json'

const data = await loadAchievements()
const text = await achievementText('en')
const active = data.achievements.filter((a) => !a.disused)
// Achievements nobody can earn yet that stardb still lists (flagged impossible).
const unobtainable = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(new URL('../overrides/achievement-unobtainable.json', import.meta.url), 'utf8'),
    ) as Record<string, string>,
  )
    .filter((key) => !key.startsWith('$'))
    .map(Number),
)

describe('achievements vs stardb (sanity check)', () => {
  it('has every achievement stardb lists, active unless listed unobtainable, and few more', () => {
    const missing = stardb.ids.filter(
      (id) => !unobtainable.has(id) && data.byId.get(id)?.disused !== false,
    )
    expect(missing).toEqual([])
    for (const id of unobtainable) expect([id, data.byId.get(id)?.disused]).toEqual([id, true])
    const listedUnobtainable = stardb.ids.filter((id) => unobtainable.has(id)).length
    expect(active.length).toBeGreaterThanOrEqual(stardb.count - listedUnobtainable)
    expect(active.length - stardb.count).toBeLessThan(150)
  })

  it('pays the same primogems for stardb’s achievements', () => {
    const total = stardb.ids.reduce((sum, id) => sum + data.byId.get(id)!.primogems, 0)
    expect(total).toBe(stardb.primogems)
    for (const a of active) expect([5, 10, 20]).toContain(a.primogems)
  })

  it('agrees on hidden achievements and category sizes', () => {
    const hidden = new Set(stardb.hidden)
    for (const id of stardb.ids)
      expect([id, data.byId.get(id)!.hidden]).toEqual([id, hidden.has(id)])
    const counts: Record<string, number> = {}
    for (const id of stardb.ids) {
      const goal = String(data.byId.get(id)!.goal)
      counts[goal] = (counts[goal] ?? 0) + 1
    }
    expect(counts).toEqual(stardb.series)
  })
})

describe('achievement data', () => {
  it('gives every active achievement a title, description and version', () => {
    for (const a of active) {
      const t = text.achievements.get(a.id)
      expect(t?.title, String(a.id)).toBeTruthy()
      expect(t?.description, String(a.id)).toBeTruthy()
      expect(t!.description, String(a.id)).not.toMatch(/\{param/)
      expect(a.version, String(a.id)).toMatch(/^\d+\.\d+$/)
    }
  })

  it('fills {param0} from the progress target', () => {
    const a = data.byId.get(80198)!
    expect(text.achievements.get(80198)!.description).toContain(String(a.progress))
  })

  it('names every category, gives it an icon and puts every achievement in one', () => {
    expect(data.goals.length).toBeGreaterThanOrEqual(73)
    expect(data.goals[0]!.id).toBe(0)
    for (const goal of data.goals) {
      expect(text.goals.get(goal.id), String(goal.id)).toBeTruthy()
      expect(goal.icon).toMatch(/^UI_AchievementIcon_/)
    }
    for (const a of active) expect(data.goalById.has(a.goal), String(a.id)).toBe(true)
  })

  it('chains multi-tier achievements within one category', () => {
    let chained = 0
    for (const a of active) {
      if (!a.prevStage) continue
      const previous = data.byId.get(a.prevStage)
      expect(previous, String(a.id)).toBeDefined()
      expect(previous!.goal).toBe(a.goal)
      chained++
    }
    expect(chained).toBeGreaterThan(250)
  })

  it('keeps disused achievements without counting them', () => {
    const disused = data.achievements.filter((a) => a.disused)
    expect(disused.length).toBeGreaterThan(100)
    expect(data.achievements).toEqual([...data.achievements].sort((a, b) => a.id - b.id))
  })
})
