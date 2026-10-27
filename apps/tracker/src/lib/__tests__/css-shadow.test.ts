import { describe, expect, it } from 'vitest'
import { parseInsetRing, parseShadows } from '@/lib/css-shadow'
import { CARD_THEMES } from '@/components/characters/share-card'

describe('the cards’ CSS shadows on a canvas', () => {
  it('reads a shadow list, inset ones left out', () => {
    expect(parseShadows(CARD_THEMES.dark['--card-panel-shadow']!)).toEqual([
      { x: 0, y: 8, blur: 24, color: 'rgba(0,0,0,0.25)' },
    ])
    expect(parseShadows(CARD_THEMES.dark['--card-hero-shadow']!)).toEqual([
      { x: 0, y: 2, blur: 10, color: 'rgba(0,0,0,0.65)' },
      { x: 0, y: 1, blur: 2, color: 'rgba(0,0,0,0.6)' },
    ])
    expect(parseShadows('0 1px 3px 0 rgb(0 0 0 / 0.1)')).toEqual([
      { x: 0, y: 1, blur: 3, color: 'rgb(0 0 0 / 0.1)' },
    ])
  })

  it('reads the hairline ring of a panel', () => {
    expect(parseInsetRing(CARD_THEMES.light['--card-panel-shadow']!)).toEqual({
      width: 1,
      color: 'rgba(15,23,42,0.07)',
    })
    expect(parseInsetRing(CARD_THEMES.dark['--card-chip-ring']!)).toEqual({
      width: 1,
      color: 'rgba(255,255,255,0.18)',
    })
    expect(parseInsetRing('0 1px 2px rgba(0,0,0,0.5)')).toBeNull()
  })
})
