import { describe, expect, it } from 'vitest'
import { imageUrlOf, type ImageCoverage } from '../src/image-url'

const HOST = 'https://static.nanoka.cc/assets/gi/'
const GI_CDN = 'https://gi-cdn.475.dev/ui/'
const coverage: ImageCoverage = {
  missing: new Set(['UI_ItemIcon_106', 'Ul_Itemlcon_121565', 'UI_ItemIcon_100004']),
  hosted: new Set(['UI_ItemIcon_106', 'Ul_Itemlcon_121565']),
}
const url = (name: string | undefined, known: ImageCoverage | null = coverage) =>
  imageUrlOf(name, known, HOST, GI_CDN)

describe('imageUrlOf', () => {
  it('loads what the host has from the host', () => {
    expect(url('UI_ItemIcon_104013')).toBe(`${HOST}UI_ItemIcon_104013.webp`)
  })

  it('loads a name the host lacks from gi-cdn when gi-cdn serves it', () => {
    expect(url('UI_ItemIcon_106')).toBe('https://gi-cdn.475.dev/ui/UI_ItemIcon_106.webp')
    // The game's own misspelling (lowercase L for I) is the name, file included.
    expect(url('Ul_Itemlcon_121565')).toBe('https://gi-cdn.475.dev/ui/Ul_Itemlcon_121565.webp')
  })

  it("gives '' (initials) for a name neither has, and for no name", () => {
    expect(url('UI_ItemIcon_100004')).toBe('')
    expect(url('')).toBe('')
    expect(url(undefined)).toBe('')
  })

  it('asks the host for everything until the coverage is known', () => {
    expect(url('UI_ItemIcon_106', null)).toBe(`${HOST}UI_ItemIcon_106.webp`)
    expect(url(undefined, null)).toBe('')
  })
})
