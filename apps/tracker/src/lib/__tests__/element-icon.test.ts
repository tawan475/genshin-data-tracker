import { loadImageCoverage } from '@gdt/game-data'
import { elementImage } from '@gdt/game-data/images'
import { GI_CDN_HOST, IMAGE_HOST } from '@gdt/game-data/image-url'
import { describe, expect, it } from 'vitest'
import { ELEMENTS } from '@/data/characters'
import { elementIcon, loadGameIcons } from '../assets'

const gameName = (element: string) =>
  elementImage((element[0]!.toUpperCase() + element.slice(1)) as Parameters<typeof elementImage>[0])

// In order: the first test runs before the coverage list loads.
describe('elementIcon', () => {
  it('is empty until the coverage list loads, so ElementIcon draws its glyph', () => {
    for (const element of ELEMENTS) expect(elementIcon(element), element).toBe('')
  })

  it("is the game data's icon on the host that serves it, else empty (the glyph)", async () => {
    await loadGameIcons()
    const { missing, hosted } = await loadImageCoverage()
    const names = ELEMENTS.map(gameName)
    expect(new Set(names).size).toBe(7)
    for (const [i, element] of ELEMENTS.entries()) {
      const name = names[i]!
      const expected = !missing.has(name)
        ? `${IMAGE_HOST}${name}.webp`
        : hosted.has(name)
          ? `${GI_CDN_HOST}${name}.webp`
          : ''
      expect(elementIcon(element), element).toBe(expected)
    }
  })

  it("loads the game's coloured icons from the image host once the data names them", async () => {
    await loadGameIcons()
    // Earlier releases named the status icons (UI_Buff_Element_*), which no
    // host serves: those keep the glyph until the data bump.
    if (!gameName('pyro')!.startsWith('UI_Buff_Element02_')) return
    expect(elementIcon('pyro')).toBe(`${IMAGE_HOST}UI_Buff_Element02_Fire.webp`)
    expect(elementIcon('geo')).toBe(`${IMAGE_HOST}UI_Buff_Element02_Roach.webp`)
    for (const element of ELEMENTS) expect(elementIcon(element), element).not.toBe('')
  })
})
