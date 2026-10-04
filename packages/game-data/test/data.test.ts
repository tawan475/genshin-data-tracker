import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import iconsJson from '../data/icons.json'
import materialsJson from '../data/materials.json'
import plannerJson from '../data/planner.json'
import { GAME_DATA, entryIcon, loadIconManifest, loadMaterialIndex } from '../src'
import type { IconsFile, MaterialIndexFile, PlannerFile } from '../src/format'
import { TRACKER_ICON_DIR } from '../scripts/lib/paths.ts'

const icons = iconsJson as unknown as IconsFile
const materials = (materialsJson as unknown as MaterialIndexFile).materials
const planner = plannerJson as unknown as PlannerFile

describe('meta', () => {
  it('names the dump commit and game version', () => {
    expect(GAME_DATA.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(GAME_DATA.gameVersion).toMatch(/^\d+\.\d+$/)
    expect(GAME_DATA.repo).toMatch(/^https:\/\//)
    expect(Date.parse(GAME_DATA.builtAt)).not.toBeNaN()
  })
})

describe('material index', () => {
  it('maps every planner material key to the same item', async () => {
    const index = await loadMaterialIndex()
    for (const [id, key, , , , icon] of planner.materials) {
      expect([key, index.id(key), index.icon(key)]).toEqual([key, id, icon])
    }
  })

  it('decodes ids and icons', async () => {
    const index = await loadMaterialIndex()
    expect(index.id('MysticEnhancementOre')).toBe(104013)
    expect(index.icon('MysticEnhancementOre')).toBe('UI_ItemIcon_104013')
    expect(index.has('NotAMaterial')).toBe(false)
    expect(index.has('constructor')).toBe(false)
    expect(index.size).toBe(Object.keys(materials).length)
  })

  it('has keys like irminsul makes them', () => {
    for (const key of Object.keys(materials)) expect(key).toMatch(/^[A-Za-z0-9]+$/)
  })
})

describe('self-hosted icons', () => {
  const hosted = Object.values(icons.sources).flat()

  it('lists each icon once, sorted', () => {
    expect(new Set([...hosted, ...icons.missing]).size).toBe(hosted.length + icons.missing.length)
    for (const list of [...Object.values(icons.sources), icons.missing]) {
      expect(list).toEqual([...list].sort())
    }
  })

  it('has a file in apps/tracker/public/gi for every hosted icon, and no others', () => {
    const files = new Set(readdirSync(TRACKER_ICON_DIR).filter((f) => f.endsWith('.webp')))
    for (const icon of hosted) expect(files.has(`${icon}.webp`), icon).toBe(true)
    expect(files.size).toBe(hosted.length)
  })

  it('covers every planner material and achievement category', async () => {
    const { hosted: set, missing } = await loadIconManifest()
    expect(missing.size).toBe(icons.missing.length)
    for (const [, key, , , , icon] of planner.materials) expect(set.has(icon), key).toBe(true)
    const goals = (await import('../data/achievement-goals.json')).default.rows as [
      number,
      number,
      string,
    ][]
    for (const [, , icon] of goals) expect(set.has(icon), icon).toBe(true)
  })

  it('was refreshed after the last build (run `icons` after `build`)', () => {
    // Every icon the index uses is hosted, known missing, or deliberately skipped (TCG card art).
    const known = new Set([...hosted, ...icons.missing])
    const unknown = Object.values(materials)
      .map(entryIcon)
      .filter((icon) => !known.has(icon) && !/^UI_Gcg_Card(Face|Back)_/.test(icon))
    expect(unknown).toEqual([])
    expect(existsSync(join(TRACKER_ICON_DIR, 'UI_ItemIcon_202.webp'))).toBe(true)
  })
})
