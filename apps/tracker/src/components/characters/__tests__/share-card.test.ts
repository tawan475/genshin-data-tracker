import { describe, expect, it } from 'vitest'
import { GI_CDN_BASE } from '@/lib/assets'
import {
  BAND_EMBLEM,
  BAND_ICON,
  BAND_ICON_RIGHT,
  BAND_WIDTH,
  EMBLEM,
  EMBLEM_URL,
  PIECE_HEIGHT,
  QUALITY_ART,
  SPLASH_LEFT,
  WEAPON_EMBLEM,
  emblemBox,
  qualityArt,
} from '../share-card'

describe('the emblem over the header art', () => {
  it("puts its knot on the icon's centre and its foot on the box's foot", () => {
    const box = emblemBox(200, 150)
    expect(box.left + EMBLEM.knotX * box.scale).toBeCloseTo(150)
    expect(box.top + EMBLEM.knotY * box.scale).toBeCloseTo(100)
    expect(box.top + box.height).toBeCloseTo(200)
    expect(box.width / box.height).toBeCloseTo(EMBLEM.width / EMBLEM.height)
  })

  it('takes another icon centre height', () => {
    const box = emblemBox(200, 150, 80)
    expect(box.top + EMBLEM.knotY * box.scale).toBeCloseTo(80)
    expect(box.top + box.height).toBeCloseTo(200)
  })

  it("is the design's on a piece's band: a 187.2px panel, the icon centred at x 188", () => {
    expect(PIECE_HEIGHT).toBeCloseTo(187.2)
    expect(BAND_WIDTH - BAND_ICON_RIGHT - BAND_ICON / 2).toBe(188)
    expect(BAND_EMBLEM.scale).toBeCloseTo(187.2 / 232)
    expect(BAND_EMBLEM.scale).toBeCloseTo(0.807, 3)
    expect(BAND_EMBLEM.width).toBeCloseTo(413.1, 1)
    expect(BAND_EMBLEM.height).toBeCloseTo(206.6, 1)
    expect(BAND_EMBLEM.left).toBeCloseTo(-127.6, 1)
    expect(BAND_EMBLEM.top).toBeCloseTo(-19.4, 1)
  })

  it("is the design's on the weapon's 128px tile, knot on its centre", () => {
    expect(WEAPON_EMBLEM.scale).toBeCloseTo(128 / 232)
    expect(WEAPON_EMBLEM.scale).toBeCloseTo(0.552, 3)
    expect(WEAPON_EMBLEM.width).toBeCloseTo(282.5, 1)
    expect(WEAPON_EMBLEM.height).toBeCloseTo(141.2, 1)
    expect(WEAPON_EMBLEM.left).toBeCloseTo(-151.8, 1)
    expect(WEAPON_EMBLEM.top).toBeCloseTo(-13.2, 1)
  })
})

describe('rarity gradients', () => {
  it("maps rarity to the game's quality names", () => {
    expect(QUALITY_ART).toEqual({
      5: 'UI_QUALITY_ORANGE',
      4: 'UI_QUALITY_PURPLE',
      3: 'UI_QUALITY_BLUE',
      2: 'UI_QUALITY_GREEN',
      1: 'UI_QUALITY_WHITE',
    })
  })

  it('loads them and the emblem from gi-cdn, none without a rarity', () => {
    expect(qualityArt(5)).toBe(`${GI_CDN_BASE}UI_QUALITY_ORANGE.webp`)
    expect(qualityArt(4)).toBe(`${GI_CDN_BASE}UI_QUALITY_PURPLE.webp`)
    expect(qualityArt(1)).toBe(`${GI_CDN_BASE}UI_QUALITY_WHITE.webp`)
    expect(EMBLEM_URL).toBe(`${GI_CDN_BASE}UI_ImgSign_ItemTips.webp`)
    for (const none of [0, 6, null, undefined]) expect(qualityArt(none)).toBe('')
  })
})

describe('the splash art', () => {
  it("moves left by 7.5% of the character column's 700px", () => {
    expect(SPLASH_LEFT).toBeCloseTo(-712.5)
  })
})
