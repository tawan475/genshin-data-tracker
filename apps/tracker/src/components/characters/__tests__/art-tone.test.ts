import { describe, expect, it } from 'vitest'
import { BOTTOM_REGION, DARK_ART, TOP_REGION, regionLuminance } from '../art-tone'

/** A width×height RGBA image, each pixel from `paint(x, y)`. */
function image(width: number, height: number, paint: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = paint(x, y)
      data.set([v, v, v, 255], (y * width + x) * 4)
    }
  }
  return data
}

describe('regionLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(
      regionLuminance(
        image(10, 10, () => 0),
        10,
        10,
        [0, 0, 1, 1],
      ),
    ).toBe(0)
    expect(
      regionLuminance(
        image(10, 10, () => 255),
        10,
        10,
        [0, 0, 1, 1],
      ),
    ).toBeCloseTo(1)
  })

  it('reads only its region: a dark top-left over a light rest', () => {
    // 84×40, like the sampled namecard: dark where the header sits, light elsewhere.
    const data = image(84, 40, (x, y) => (x < 34 && y < 12 ? 30 : 220))
    expect(regionLuminance(data, 84, 40, TOP_REGION)).toBeLessThan(DARK_ART)
    expect(regionLuminance(data, 84, 40, BOTTOM_REGION)).toBeGreaterThan(DARK_ART)
  })

  it('weighs green over red over blue, as the eye does', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255])
    const green = new Uint8ClampedArray([0, 255, 0, 255])
    const blue = new Uint8ClampedArray([0, 0, 255, 255])
    const lum = (d: Uint8ClampedArray) => regionLuminance(d, 1, 1, [0, 0, 1, 1])
    expect(lum(green)).toBeGreaterThan(lum(red))
    expect(lum(red)).toBeGreaterThan(lum(blue))
  })
})
