import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import goalsJson from '../data/achievement-goals.json'
import imagesJson from '../data/images.json'
import materialsJson from '../data/materials.json'
import missingJson from '../data/missing-images.json'
import plannerJson from '../data/planner.json'
import { GAME_DATA, loadImageCoverage, loadMaterialIndex, loadMissingImages } from '../src'
import { imageUrlOf } from '../src/image-url'
import { itemImage } from '../src/images'
import type {
  GoalsFile,
  ImagesFile,
  MaterialIndexFile,
  MissingImagesFile,
  PlannerFile,
} from '../src/format'
import { IMAGE_HOST, imageNames, nameSetHash, selfHostable } from '../scripts/lib/image-names.ts'
import { HOSTED_DIR } from '../scripts/lib/paths.ts'

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

  it('has furnishing blueprints, which irminsul exports as materials', async () => {
    const index = await loadMaterialIndex()
    expect(index.id('BasicTentANapBeneathTheSnow')).toBe(394662)
    expect(index.icon('BasicTentANapBeneathTheSnow')).toBe('UI_ItemIcon_Home_Common')
    expect(index.id('AdventurerCamp')).toBe(350001) // a furnishing set blueprint
    expect(index.icon('AdventurerCamp')).toBe('UI_ItemIcon_Home_Outdoor')
    // A blueprint named like an item doesn't take the item's key.
    expect(index.id('ShinyShell')).toBe(121050)
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

  it('hosts only missing names the app shows (no TCG card art)', () => {
    const hosted = missingImages.hosted ?? []
    expect(hosted).toEqual([...new Set(hosted)].sort())
    const missing = new Set(missingImages.missing)
    for (const name of hosted) {
      expect(missing.has(name), name).toBe(true)
      expect(selfHostable(names.get(name)!), name).toBe(true)
    }
  })

  // The copies are gitignored (game art, public repo): only a checkout that
  // ran `images --gi-cdn-dir` has them, and a clean one skips this.
  const hostedFiles = existsSync(HOSTED_DIR)
    ? readdirSync(HOSTED_DIR).filter((file) => file.endsWith('.webp'))
    : []
  it.skipIf(hostedFiles.length === 0)(
    'has a WebP in apps/tracker/public/gi/ for each hosted name, and nothing else',
    () => {
      const hosted = missingImages.hosted ?? []
      expect([...hostedFiles].sort()).toEqual(hosted.map((name) => `${name}.webp`).sort())
      for (const name of hosted) {
        const head = readFileSync(join(HOSTED_DIR, `${name}.webp`))
          .subarray(0, 12)
          .toString('latin1')
        expect([head.slice(0, 4), head.slice(8)], name).toEqual(['RIFF', 'WEBP'])
      }
    },
  )

  it('shows an icon for every material of a typical bag', async () => {
    const [index, coverage] = await Promise.all([loadMaterialIndex(), loadImageCoverage()])
    expect([...coverage.hosted]).toEqual(missingImages.hosted ?? [])
    // Made up, but with every kind a real capture had without an icon before
    // the tracker hosted its own copies and indexed blueprints.
    const bag = [
      'Mora',
      'Primogem',
      'OriginalResin',
      'CondensedResin',
      'FragileResin',
      'MasterlessStardust',
      'MasterlessStarglitter',
      'MasterlessStellaFortuna',
      'LunaSigil',
      'DustOfEnlightenment',
      'HerosWit',
      'MysticEnhancementOre',
      'CrownOfInsight',
      'DreamSolvent',
      'Sunsettia',
      'LuckyCoin',
      'BlankDynamicCard',
      'LegendPlayerBadge',
      'MatchInvitationLetter',
      'EnvoysMedal',
      'MoonPrayerBlossomFromColumbina',
      'PhotoWithTheLittleWitchesAndTheirImaginaryFriends',
      'KeepsakePhotoWithYelan',
      'BasicTentANapBeneathTheSnow',
      'LargeCargoCrateReliableSupport',
      'AGoldenWinter',
      'UselessAdvice',
      'AdventurerCamp',
    ]
    const own: string[] = []
    for (const key of bag) {
      const name = itemImage(key) ?? index.icon(key)
      const url = imageUrlOf(name, coverage, IMAGE_HOST, '/gi/')
      expect(url, key).not.toBe('')
      if (url.startsWith('/gi/')) own.push(key)
    }
    // The Original Resin icon and the game's misspelled photo come from our copies.
    expect(own).toContain('OriginalResin')
    expect(own).toContain('PhotoWithTheLittleWitchesAndTheirImaginaryFriends')
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
