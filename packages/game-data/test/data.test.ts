import { describe, expect, it } from 'vitest'
import goalsJson from '../data/achievement-goals.json'
import imagesJson from '../data/images.json'
import materialsJson from '../data/materials.json'
import missingJson from '../data/missing-images.json'
import plannerJson from '../data/planner.json'
import { GAME_DATA, loadMaterialIndex, loadMissingImages } from '../src'
import type {
  GoalsFile,
  ImagesFile,
  MaterialIndexFile,
  MissingImagesFile,
  PlannerFile,
} from '../src/format'
import { IMAGE_HOST, imageNames, nameSetHash } from '../scripts/lib/image-names.ts'

const goals = goalsJson as unknown as GoalsFile
const images = imagesJson as unknown as ImagesFile
const missingImages = missingJson as unknown as MissingImagesFile
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

describe('image coverage (data/missing-images.json)', () => {
  const names = imageNames()

  it('was checked after the last build (run `images` after `build`)', () => {
    expect([missingImages.names, missingImages.hash]).toEqual([
      names.size,
      nameSetHash(names.keys()),
    ])
    expect(missingImages.source).toBe(`${IMAGE_HOST}<name>.webp`)
  })

  it('lists known names once, sorted', () => {
    expect(missingImages.missing).toEqual([...new Set(missingImages.missing)].sort())
    for (const name of missingImages.missing) expect(names.has(name), name).toBe(true)
  })

  it('has every item, achievement category and planner material shown outside the bag', async () => {
    const missing = await loadMissingImages()
    expect(missing.size).toBe(missingImages.missing.length)
    for (const [key, name] of Object.entries(images.items))
      expect(missing.has(name), key).toBe(false)
    for (const [id, , icon] of goals.rows) expect(missing.has(icon), String(id)).toBe(false)
    for (const [, key, , , , icon] of planner.materials) expect(missing.has(icon), key).toBe(false)
  })
})
