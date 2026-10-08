import { describe, expect, it } from 'vitest'
import { EMBLEM, emblemBox, emblemFromRight, qualityCell } from '../item-art'
import { GI_CDN_BASE } from '../assets'

describe('emblemFromRight', () => {
  it("puts the knot on an icon's centre, measured from the band's right edge", () => {
    const style = emblemFromRight(122, 7, 94)
    const box = emblemBox(122, 0)
    const right = parseFloat(style.right!)
    // The knot is (512 − knotX)·scale in from the emblem's right edge: on the icon's centre, 7 + 47px from the band's.
    expect(right + (EMBLEM.width - EMBLEM.knotX) * box.scale).toBeCloseTo(7 + 94 / 2)
    expect(parseFloat(style.width!)).toBeCloseTo(box.width)
    expect(parseFloat(style.top!)).toBeCloseTo(box.top)
    expect(parseFloat(style.height!)).toBeCloseTo(box.height)
  })
})

describe('qualityCell', () => {
  it("is the game's bag cell for 1–5★, the small square on request, none otherwise", () => {
    expect(qualityCell(5)).toBe(`${GI_CDN_BASE}UI_QualityBg_5.webp`)
    expect(qualityCell(4, true)).toBe(`${GI_CDN_BASE}UI_QualityBg_4s.webp`)
    for (const none of [0, 6, null, undefined]) expect(qualityCell(none)).toBe('')
  })
})
