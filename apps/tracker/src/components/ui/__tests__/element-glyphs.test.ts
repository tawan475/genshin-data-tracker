import { ELEMENT_KEYS } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { ELEMENT_FILL, ELEMENT_TEXT } from '@/components/characters/tokens'
import { ELEMENTS, ELEMENT_LABELS } from '@/data/characters'
import { toElement } from '@/data/game-meta'
import { ELEMENT_GLYPHS } from '../element-glyphs'

describe('element mapping', () => {
  it('maps every game element to the app’s lowercase key', () => {
    expect(ELEMENT_KEYS.map((e) => toElement(e))).toEqual([
      'anemo',
      'geo',
      'electro',
      'dendro',
      'hydro',
      'pyro',
      'cryo',
    ])
    expect(toElement(null)).toBeNull()
    expect([...ELEMENTS].sort()).toEqual(ELEMENT_KEYS.map((e) => e.toLowerCase()).sort())
  })

  it('gives each element a name, a colour and a glyph', () => {
    for (const element of ELEMENTS) {
      expect(ELEMENT_LABELS[element].toLowerCase()).toBe(element)
      expect(ELEMENT_TEXT[element]).toBe(`text-${element}`)
      expect(ELEMENT_FILL[element]).toBe(`bg-${element}`)
      const glyph = ELEMENT_GLYPHS[element]
      expect(glyph.fill || glyph.stroke, element).toBeTruthy()
      for (const d of [glyph.fill, glyph.stroke]) {
        if (d) expect(d, element).toMatch(/^M[\d .,\-MmLlHhVvCcSsQqTtAaZz]+$/)
      }
    }
    expect(Object.keys(ELEMENT_GLYPHS).sort()).toEqual([...ELEMENTS].sort())
  })

  it('draws seven different glyphs', () => {
    const shapes = ELEMENTS.map((e) => JSON.stringify(ELEMENT_GLYPHS[e]))
    expect(new Set(shapes).size).toBe(7)
  })
})
