import type { Good } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { buildRoster } from '@/data/characters'
import { cardImageUrls } from '../card-images'

function good(overrides: Partial<Good> = {}): Good {
  return {
    format: 'GOOD',
    version: 3,
    source: 'test',
    characters: [
      {
        key: 'HuTao',
        level: 90,
        constellation: 1,
        ascension: 6,
        talent: { auto: 10, skill: 10, burst: 9 },
      },
    ],
    weapons: [
      { key: 'StaffOfHoma', level: 90, ascension: 6, refinement: 1, location: 'HuTao', lock: true },
    ],
    artifacts: ['flower', 'plume'].map((slotKey) => ({
      setKey: 'CrimsonWitchOfFlames',
      slotKey,
      level: 20,
      rarity: 5,
      mainStatKey: slotKey === 'flower' ? 'hp' : 'atk',
      location: 'HuTao',
      lock: true,
      substats: [{ key: 'critRate_', value: 3.9 }],
    })),
    materials: {},
    ...overrides,
  }
}

describe('cardImageUrls', () => {
  it("lists every image of a character's card once", () => {
    const [huTao] = buildRoster(good()).characters
    const urls = cardImageUrls(huTao!)
    const names = urls.map((url) => url.split('/').pop())
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.every(Boolean)).toBe(true)
    expect(names).toEqual(
      expect.arrayContaining([
        'UI_Gacha_AvatarImg_Hutao.webp',
        'UI_NameCardPic_Hutao_P.webp',
        'UI_Talent_S_Hutao_03.webp', // C1
        'Skill_S_Hutao_01.webp',
        'Skill_E_Hutao_01.webp',
        expect.stringMatching(/^UI_EquipIcon_Pole_Homa(_Awaken)?\.webp$/),
        expect.stringMatching(/^UI_RelicIcon_15006_\d\.webp$/),
        // The header art behind the 5★ weapon and pieces: one gradient, the emblem.
        'UI_QUALITY_ORANGE.webp',
        'UI_ImgSign_ItemTips.webp',
      ]),
    )
    // 6 constellations, 3 talents, splash, namecard, element, weapon, 2 pieces (+ a set icon,
    // which may be one of them), the gradient and the emblem: never more than that.
    expect(urls.length).toBeGreaterThanOrEqual(16)
    expect(urls.length).toBeLessThanOrEqual(18)
  })

  it("adds each rarity's gradient once", () => {
    const [huTao] = buildRoster(
      good({
        weapons: [
          {
            key: 'DragonsBane',
            level: 90,
            ascension: 6,
            refinement: 5,
            location: 'HuTao',
            lock: true,
          },
        ],
        artifacts: [
          ...good().artifacts,
          { ...good().artifacts[0]!, slotKey: 'sands', rarity: 4, mainStatKey: 'eleMas' },
        ],
      }),
    ).characters
    const names = cardImageUrls(huTao!).map((url) => url.split('/').pop())
    expect(names.filter((name) => name?.startsWith('UI_QUALITY_')).sort()).toEqual([
      'UI_QUALITY_ORANGE.webp',
      'UI_QUALITY_PURPLE.webp',
    ])
    expect(names.filter((name) => name === 'UI_ImgSign_ItemTips.webp')).toHaveLength(1)
  })

  it('skips what a character lacks (no weapon, no pieces, newer than the data)', () => {
    const [noGear] = buildRoster(good({ weapons: [], artifacts: [] })).characters
    expect(cardImageUrls(noGear!).some((url) => url.includes('EquipIcon'))).toBe(false)
    expect(cardImageUrls(noGear!).some((url) => url.includes('RelicIcon'))).toBe(false)
    expect(cardImageUrls(noGear!).some((url) => /UI_QUALITY_|UI_ImgSign_/.test(url))).toBe(false)
    const [unknown] = buildRoster(
      good({
        characters: [
          {
            key: 'SomeoneNew',
            level: 1,
            constellation: 0,
            ascension: 0,
            talent: { auto: 1, skill: 1, burst: 1 },
          },
        ],
        weapons: [],
        artifacts: [],
      }),
    ).characters
    expect(cardImageUrls(unknown!)).toEqual([])
  })
})
