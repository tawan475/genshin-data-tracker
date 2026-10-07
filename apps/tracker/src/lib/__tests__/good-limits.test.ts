/**
 * The per-file caps an upload is held to (GOOD_LIMITS in @gdt/shared) are
 * about 1.5× the game's own counts. The game keeps growing: when a game data
 * bump brings a count within 1.2× of its cap, this fails, so the cap is raised
 * long before a real export reaches it.
 */

import achievementsJson from '@gdt/game-data/data/achievements.json'
import catalogJson from '@gdt/game-data/data/catalog.json'
import materialsJson from '@gdt/game-data/data/materials.json'
import { GOOD_LIMITS } from '@gdt/shared'
import { describe, expect, it } from 'vitest'

const HEADROOM = 1.2

describe('GOOD_LIMITS', () => {
  it("stay well above the game data's own counts", () => {
    const counts: [keyof typeof GOOD_LIMITS, number][] = [
      ['characters', Object.keys(catalogJson.characters).length],
      ['materialKeys', Object.keys(materialsJson.materials).length],
      ['achievements', achievementsJson.rows.length],
    ]
    for (const [cap, count] of counts) {
      expect(count, cap).toBeGreaterThan(0)
      expect(GOOD_LIMITS[cap], cap).toBeGreaterThanOrEqual(Math.ceil(count * HEADROOM))
    }
  })
})
