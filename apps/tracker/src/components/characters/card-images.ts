import type { CharacterView } from '@/data/characters'
import {
  artifactIcon,
  artifactSetIcon,
  characterBanner,
  characterSplash,
  elementIcon,
  weaponIcon,
} from '@/lib/assets'
import { preloadImages } from '@/lib/image-preload'
import { constellationIcons, talentIcons } from './talent-icons'

/**
 * Every image a character's details and share card show (namecard, splash
 * art, constellation and talent icons, element, weapon, the five pieces,
 * the set icons), once each, empty ones left out.
 */
export function cardImageUrls(c: CharacterView): string[] {
  const talents = talentIcons(c.key)
  const urls = [
    characterSplash(c.key),
    characterBanner(c.key),
    ...constellationIcons(c.key),
    talents.auto,
    talents.skill,
    talents.burst,
    c.element ? elementIcon(c.element) : '',
    c.weapon ? weaponIcon(c.weapon.key, c.weapon.ascension) : '',
    ...c.artifacts.map((piece) => (piece ? artifactIcon(piece.setKey, piece.slotKey) : '')),
    ...c.sets.map((set) => artifactSetIcon(set.setKey)),
  ]
  return [...new Set(urls.filter(Boolean))]
}

/**
 * Fetches and decodes a character's card images ahead (bounded, see
 * lib/image-preload); resolves once they have all decoded or failed.
 */
export function preloadCharacter(c: CharacterView | null | undefined): Promise<void> {
  return c ? preloadImages(cardImageUrls(c)) : Promise.resolve()
}
