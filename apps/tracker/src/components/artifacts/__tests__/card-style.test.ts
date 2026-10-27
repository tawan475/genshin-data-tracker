import { describe, expect, it } from 'vitest'
import type { GoodArtifact } from '@gdt/shared'
import { buildArtifactRows } from '@/data/artifacts'
import { artifactCardHeight } from '../card-style'

const piece = (location: string, lines: number, inactive = 0): GoodArtifact =>
  ({
    setKey: 'GladiatorsFinale',
    slotKey: 'sands',
    level: 0,
    rarity: 5,
    mainStatKey: 'atk_',
    location,
    lock: false,
    substats: ['critRate_', 'critDMG_', 'hp', 'def']
      .slice(0, lines)
      .map((key) => ({ key, value: 3 })),
    unactivatedSubstats: inactive ? [{ key: 'eleMas', value: 19 }] : undefined,
  }) as GoodArtifact

describe('the artifact share picture', () => {
  it('is as tall as the card lays out: band, lines, set, the Equipped bar', () => {
    const [worn, spare, opening] = buildArtifactRows([
      piece('Furina', 4),
      piece('', 4),
      piece('', 3, 1),
    ])
    // 2px margins, 122 band, 6 + 24 per line + 6, the set line 26, the bar 36.
    expect(artifactCardHeight(worn!)).toBe(4 + 122 + 12 + 96 + 26 + 36)
    expect(artifactCardHeight(spare!)).toBe(4 + 122 + 12 + 96 + 26)
    expect(artifactCardHeight(opening!)).toBe(artifactCardHeight(spare!))
  })
})
