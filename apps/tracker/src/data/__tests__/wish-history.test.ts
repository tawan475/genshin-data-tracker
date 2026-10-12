import { describe, expect, it } from 'vitest'
import {
  parseWishTime,
  resolveWishItem,
  type GachaType,
  type UigfGachaType,
  type WishPull,
} from '@gdt/shared'
import bannerFile from '../wish-banners.json'
import {
  bannerAt,
  bannerStats,
  eventBanners,
  type BannerFile,
  type EventBanner,
  type EventKind,
} from '../wish-history'

const T0 = parseWishTime('2026-03-01 12:00:00')!

/** Pulls from names; `400` marks a pull on the second character banner. */
function history(banner: UigfGachaType, names: (string | [string, 400])[], start = T0): WishPull[] {
  return names.map((entry, i) => {
    const [name, type] = Array.isArray(entry) ? entry : [entry, banner]
    return {
      id: 1_780_000_000_000_000_000n + BigInt(i),
      time: start + i * 60,
      gachaType: type as GachaType,
      item: resolveWishItem({ name }),
    }
  })
}

const filler = (n: number, name = 'Slingshot') => Array.from({ length: n }, () => name)

function banners(
  kind: EventKind,
  featured5: string[],
  featured4: string[] = ['Bennett', 'Xingqiu', 'Diona'],
): Map<EventKind, EventBanner[]> {
  return new Map([[kind, [{ kind, start: 0, end: 4e9, featured5, featured4, version: '9.9' }]]])
}

describe('wish pity', () => {
  it('counts 301 and 400 together, and a 5★ leaves the 4★ count running', () => {
    const pulls = history(301, [
      ...filler(40),
      ...filler(39).map((n) => [n, 400] as [string, 400]),
      ['Furina', 400],
      ...filler(5),
      'Bennett',
      ...filler(3),
    ])
    const stats = bannerStats(301, pulls, { timezone: 8, banners: null })
    expect(stats.total).toBe(89)
    expect(stats.fives.map((r) => [r.pull.item.key, r.pity, r.number])).toEqual([
      ['Furina', 80, 80],
    ])
    expect(stats.fours[0]!.pity).toBe(86)
    expect(stats.pity5).toBe(9)
    expect(stats.pity4).toBe(3)
    // No banner data: no 50/50.
    expect(stats.guaranteed5).toBeNull()
    expect(stats.fives[0]!.outcome).toBeNull()
  })

  it('tells 50/50s won, lost and guaranteed on the character banner', () => {
    const pulls = history(301, [
      ...filler(10),
      'Diluc', // lost
      ...filler(10),
      'Furina', // guaranteed
      ...filler(10),
      'Furina', // won
      ...filler(10),
      'Qiqi', // lost
      'Jean', // lost (while guaranteed: the data says otherwise; counted lost)
    ])
    const stats = bannerStats(301, pulls, {
      timezone: 8,
      banners: banners('character', ['Furina']),
    })
    expect(stats.fives.map((r) => r.outcome).reverse()).toEqual([
      'lost',
      'guaranteed',
      'won',
      'lost',
      'lost',
    ])
    expect(stats).toMatchObject({ guaranteed5: true, won5: 1, lost5: 3, lostStreak: 2 })
  })

  it('tracks the 4★ guarantee from the featured three', () => {
    const pulls = history(301, [
      ...filler(9),
      'Fischl',
      ...filler(9),
      'Bennett',
      ...filler(2),
      'Barbara',
    ])
    const stats = bannerStats(301, pulls, {
      timezone: 8,
      banners: banners('character', ['Furina']),
    })
    expect(stats.fours.map((r) => r.outcome).reverse()).toEqual(['lost', 'guaranteed', 'lost'])
    expect(stats.guaranteed4).toBe(true)
  })

  it('reads the weapon banner as 75/25 between its two and the standard ones', () => {
    const pulls = history(302, [
      ...filler(60),
      'Skyward Harp',
      ...filler(10),
      'Splendor of Tranquil Waters',
    ])
    const stats = bannerStats(302, pulls, {
      timezone: 8,
      banners: banners('weapon', ['SplendorOfTranquilWaters', 'Absolution'], []),
    })
    expect(stats.fives.map((r) => [r.pity, r.outcome]).reverse()).toEqual([
      [61, 'lost'],
      [11, 'guaranteed'],
    ])
    expect(stats.guaranteed5).toBe(false)
  })

  it('stops guessing after a pull outside the banner data', () => {
    const outside: Map<EventKind, EventBanner[]> = new Map([
      [
        'character',
        [{ kind: 'character', start: 0, end: 1, featured5: [], featured4: [], version: '' }],
      ],
    ])
    const stats = bannerStats(301, history(301, [...filler(5), 'Diluc']), {
      timezone: 8,
      banners: outside,
    })
    expect(stats.fives[0]!.outcome).toBeNull()
    expect(stats.guaranteed5).toBeNull()
  })

  it('keeps standard, beginners and chronicled to pity', () => {
    const stats = bannerStats(200, history(200, [...filler(3), 'Diluc']), {
      timezone: 8,
      banners: banners('character', ['Diluc']),
    })
    expect(stats.fives[0]).toMatchObject({ pity: 4, outcome: null })
    expect(stats.guaranteed5).toBeNull()
  })
})

describe('banner data', () => {
  const file = bannerFile as unknown as BannerFile

  it('finds the featured character of a dual phase, on every server clock', () => {
    for (const tz of [8, 1, -5]) {
      const list = eventBanners(file, tz).get('character')!
      // 2026-09-30 noon on that server's clock.
      const at = parseWishTime('2026-09-30 12:00:00')! - tz * 3600
      expect(bannerAt(list, at)?.featured5).toContain('Vesna')
    }
  })

  it('lists banners with known featured keys, oldest first', () => {
    const map = eventBanners(file, 8)
    for (const [, list] of map) {
      for (let i = 1; i < list.length; i++)
        expect(list[i]!.start).toBeGreaterThanOrEqual(list[i - 1]!.start)
      for (const b of list) expect(b.featured5.length).toBeGreaterThan(0)
    }
    expect(map.get('weapon')!.length).toBeGreaterThan(100)
  })
})
