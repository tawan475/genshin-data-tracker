import { describe, expect, it } from 'vitest'
import { WISH_ITEMS, resolveWishItem } from '@gdt/shared'
import { wishIconName } from '@/components/wishes/wish-labels'
import bannerFile from '../wish-banners.json'

describe('wish icons', () => {
  it('names a game icon for every item a wish can give', () => {
    const missing = WISH_ITEMS.filter(
      (info) => !wishIconName(resolveWishItem({ name: info.name, itemId: info.itemId })),
    ).map((info) => info.key)
    expect(missing).toEqual([])
  })

  it('names one for every featured item of every banner, by key alone', () => {
    const missing = new Set<string>()
    for (const row of bannerFile.banners) {
      for (const key of [...(row[4] as string[]), ...(row[5] as string[])]) {
        const item = { key, kind: null, name: key, rank: 0, itemId: 0, known: false }
        if (!wishIconName(item)) missing.add(key)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('finds an item kept by name (not in the wish table yet) by its GOOD key', () => {
    const item = {
      key: null,
      kind: 'character' as const,
      name: 'Hu Tao',
      rank: 5,
      itemId: 0,
      known: false,
    }
    expect(wishIconName(item)).toBe('UI_AvatarIcon_Hutao')
  })
})
