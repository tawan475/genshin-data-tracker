import { describe, expect, it } from 'vitest'
import { wikiPage } from '../wiki'

describe('wikiPage', () => {
  it("writes the wiki's own page addresses", () => {
    expect(wikiPage('Nefer: Reliable or Not')).toBe(
      'https://genshin-impact.fandom.com/wiki/Nefer:_Reliable_or_Not',
    )
    expect(wikiPage('Radiant Spincrystal "A Letter from the Wind: II"')).toBe(
      'https://genshin-impact.fandom.com/wiki/Radiant_Spincrystal_%22A_Letter_from_the_Wind:_II%22',
    )
    // Subpages: the Archive's tutorials and viewpoints.
    expect(wikiPage('Viewpoint/Manor of Daybreak')).toBe(
      'https://genshin-impact.fandom.com/wiki/Viewpoint/Manor_of_Daybreak',
    )
  })
})
